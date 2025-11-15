from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Literal, Optional
from backend.physics import period_days, samples_for_system
from backend.music import events_for_system, a_to_midi

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

class ComputeRequest(BaseModel):
    star: Star
    planets: List[Planet]
    durationSec: float
    dtSec: float
    musicMode: Literal["per_orbit_note", "continuous_tone"]

class Sample(BaseModel):
    t: float
    planets: List[dict]

class Event(BaseModel):
    t: float
    type: Literal["note_on", "note_off"]
    planet: str
    midi: Optional[int] = None
    vel: Optional[int] = None
    instrument: Optional[str] = None

class ComputeResponse(BaseModel):
    samples: List[Sample]
    events: List[Event]
    meta: dict

PRESET = {
    "star": {"massMs": 1.0},
    "planets": [{"name": "Terra", "kind": "rocky", "aAU": 1.0}],
    "durationSec": 30,
    "dtSec": 0.1,
    "musicMode": "per_orbit_note"
}

@app.post("/api/compute", response_model=ComputeResponse)
def compute(req: ComputeRequest):
    samples = samples_for_system(req.dict(), req.durationSec, req.dtSec)
    events = events_for_system(req.dict(), req.durationSec, req.musicMode)
    meta = {"dtSec": req.dtSec, "musicMode": req.musicMode}
    return {"samples": samples, "events": events, "meta": meta}

@app.get("/api/presets")
def presets():
    return [PRESET]
