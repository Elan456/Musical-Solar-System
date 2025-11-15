# Musical Solar System

Minimal mono-repo for a musical orrery. Backend computes planet positions and music events; frontend draws orbits and plays notes.

## Quick Start

```sh
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
make backend

# Frontend
pnpm install
make frontend
```

Open [http://localhost:5173](http://localhost:5173) and click "Compute" to see the orrery and play music.

## Music Modes

- **per_orbit_note**: Each planet emits a note when it completes an orbit.
- **continuous_tone**: Each planet emits a drone for the duration.

## TODOs

- Add planet editing UI
- Add more instruments and sound design
- Add more physics (eccentricity, multi-star, etc.)

---

This is a minimal MVP. Extend as needed!
