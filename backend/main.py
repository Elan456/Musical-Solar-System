from fastapi import FastAPI
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
    payload = req.dict()
    result = samples_for_system(payload, req.durationSec, req.dtSec)
    events = events_for_system(result["samples"], result["planetMetadata"], req.durationSec)
    meta = {"dtSec": req.dtSec}
    return {
        "planetMetadata": result["planetMetadata"],
        "samples": result["samples"],
        "events": events,
        "meta": meta,
    }
