import gzip
import json
import time

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Literal, Optional

from backend.physics import samples_for_system
from backend.music import events_for_system

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Star(BaseModel):
    massMs: float


class Planet(BaseModel):
    name: str
    kind: Literal["rocky", "gas"]
    aAU: float
    mass: float
    color: str
    radius: float
    ellipticity: Optional[float] = None
    position: Optional[List[float]] = None
    velocity: Optional[List[float]] = None


class ComputeRequest(BaseModel):
    star: Star
    planets: List[Planet]
    durationSec: float
    dtSec: float
    trajectoryOnly: Optional[bool] = False
    eventsOnly: Optional[bool] = False
    profile: Optional[bool] = False


class TrajectorySample(BaseModel):
    t: float
    positions: List[List[float]]


class VelocityPoint(BaseModel):
    t: float
    velocity: float


class Event(BaseModel):
    t: float
    type: Literal["note_on", "note_off"]
    planet: str
    midi: Optional[int] = None
    vel: Optional[int] = None
    instrument: Optional[str] = None
    reverb: Optional[float] = None  # 0.0 = dry, 1.0 = full wet
    continuous: Optional[bool] = None
    velocityEnvelope: Optional[List[VelocityPoint]] = None
    eccentricity: Optional[float] = None


class PlanetMetadata(BaseModel):
    name: str
    kind: Literal["rocky", "gas", "star"]
    color: str
    radius: float
    mass: Optional[float] = None
    aAU: Optional[float] = None


class ComputeResponse(BaseModel):
    planetMetadata: List[PlanetMetadata]
    samples: List[TrajectorySample]
    events: List[Event]
    meta: dict


@app.post("/api/compute", response_model=ComputeResponse)
def compute(req: ComputeRequest):
    """
    Optionally profiles physics, music event generation, and JSON serialization
    when `profile` is true.
    """
    payload = req.dict()
    include_samples = not bool(req.eventsOnly)
    include_events = not bool(req.trajectoryOnly)
    profile_enabled = bool(req.profile)
    profile_meta = {"timingsMs": {}} if profile_enabled else None

    planet_metadata: List[PlanetMetadata] = []
    samples: List[TrajectorySample] = []

    if include_samples or include_events:
        physics_start = time.perf_counter()
        result = samples_for_system(payload, req.durationSec, req.dtSec)
        if profile_enabled:
            profile_meta["timingsMs"]["samples_for_system"] = (
                time.perf_counter() - physics_start
            ) * 1000.0
        planet_metadata = result["planetMetadata"]
        samples = result["samples"]

    events_start = time.perf_counter()
    events = (
        events_for_system(samples, planet_metadata, req.durationSec)
        if include_events
        else []
    )
    if profile_enabled and include_events:
        profile_meta["timingsMs"]["events_for_system"] = (
            time.perf_counter() - events_start
        ) * 1000.0

    meta = {"dtSec": req.dtSec}
    if profile_enabled:
        profile_meta["serverTimestamp"] = time.time()
        meta["profile"] = profile_meta

    response_payload = {
        "planetMetadata": planet_metadata,
        "samples": samples if include_samples else [],
        "events": events,
        "meta": meta,
    }

    if profile_enabled:
        serialize_start = time.perf_counter()
        serialized = json.dumps(response_payload, separators=(",", ":")).encode("utf-8")
        serialize_ms = (time.perf_counter() - serialize_start) * 1000.0

        profile_meta["timingsMs"]["serialize_response_json"] = serialize_ms
        profile_meta["payloadBytes"] = len(serialized)
        profile_meta["payloadGzipBytes"] = len(gzip.compress(serialized))

        serialized = json.dumps(response_payload, separators=(",", ":")).encode("utf-8")
        return Response(content=serialized, media_type="application/json")

    return response_payload
