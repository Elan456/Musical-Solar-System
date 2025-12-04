"""
Utilities for constructing a System instance from a request payload and
sampling its positions for the frontend. Uses simplified game units so
numbers remain readable and render nicely in the 2D plane.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

from .system import System

SIM_G = 0.01  # Tuned gravitational constant for simplified masses/lengths
STAR_MASS_SCALE = 100.0  # Amplify star mass so planets orbit sensibly


def period_days(aAU: float) -> float:
    # Kepler's third law, solar mass = 1
    return 365.25 * aAU ** 1.5


def _vector3(values: Any) -> List[float]:
    vec = list(values)
    if len(vec) < 3:
        vec.extend([0.0] * (3 - len(vec)))
    return [float(v) for v in vec[:3]]


def _build_initial_bodies(system_cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    star_mass = system_cfg["star"]["massMs"] * STAR_MASS_SCALE
    bodies: List[Dict[str, Any]] = [
        {
            "name": system_cfg["star"].get("name", "Star"),
            "mass": star_mass,
            "position": [0.0, 0.0, 0.0],
            "velocity": [0.0, 0.0, 0.0],
            "metadata": {
                "kind": "star",
                "color": "#ffdd44",
                "radius": 12,
                "visible": True,
            },
        }
    ]

    for planet in system_cfg["planets"]:
        distance = planet["aAU"]
        position = planet.get("position")
        velocity = planet.get("velocity")

        if position is not None:
            position_vec = _vector3(position)
        else:
            position_vec = [distance, 0.0, 0.0]

        if velocity is not None:
            velocity_vec = _vector3(velocity)
        else:
            dist_xy = math.hypot(position_vec[0], position_vec[1])
            if dist_xy > 0:
                speed = math.sqrt(SIM_G * star_mass / dist_xy)
                direction = [-position_vec[1] / dist_xy, position_vec[0] / dist_xy, 0.0]
                ellipticity = float(planet.get("ellipticity") or 0.0)
                ellipticity = max(0.0, min(ellipticity, 0.95))
                velocity_scale = 1.0 - 0.5 * ellipticity
                velocity_vec = [
                    direction[0] * speed * velocity_scale,
                    direction[1] * speed * velocity_scale,
                    0.0,
                ]
            else:
                velocity_vec = [0.0, 0.0, 0.0]

        metadata = {**planet, "visible": True}
        bodies.append(
            {
                "name": planet["name"],
                "mass": planet["mass"],
                "position": position_vec,
                "velocity": velocity_vec,
                "metadata": metadata,
            }
        )
    return bodies


def _extract_metadata(first_sample: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Pull shared, static metadata from the first sample and preserve ordering
    so position arrays can be zipped back together later.
    """
    planet_metadata: List[Dict[str, Any]] = []
    ordered_names: List[str] = []

    for body in first_sample.get("bodies", []):
        metadata = dict(body.get("metadata") or {})
        if metadata.get("visible", True) is False:
            continue

        position = body.get("position") or [0.0, 0.0, 0.0]
        x, y = float(position[0]), float(position[1])

        planet_metadata.append(
            {
                "name": body["name"],
                "kind": metadata.get("kind", "rocky"),
                "color": metadata.get("color", "#ffffff"),
                "radius": metadata.get("radius", 5),
                "mass": metadata.get("mass"),
                "aAU": metadata.get("aAU", math.hypot(x, y)),
            }
        )
        ordered_names.append(body["name"])

    return planet_metadata, ordered_names


def samples_for_system(system_cfg: Dict[str, Any], duration_sec: float, dt_sec: float):
    if dt_sec <= 0:
        raise ValueError("dtSec must be positive")
    system = System(
        name="User system",
        gravitational_constant=SIM_G,
        initial_bodies=_build_initial_bodies(system_cfg),
    )
    sample_rate = 1.0 / dt_sec
    raw_samples = system.sample_positions(
        duration_seconds=duration_sec, sample_rate_hz=sample_rate
    )

    if not raw_samples:
        return {"planetMetadata": [], "samples": []}

    planet_metadata, ordered_names = _extract_metadata(raw_samples[0])
    name_to_index = {name: idx for idx, name in enumerate(ordered_names)}

    samples: List[Dict[str, Any]] = []
    for sample in raw_samples:
        positions: List[List[float]] = [[0.0, 0.0] for _ in ordered_names]

        for body in sample.get("bodies", []):
            metadata = dict(body.get("metadata") or {})
            if metadata.get("visible", True) is False:
                continue

            idx = name_to_index.get(body["name"])
            if idx is None:
                continue

            pos = body.get("position") or [0.0, 0.0, 0.0]
            positions[idx] = [float(pos[0]), float(pos[1])]

        samples.append({"t": float(sample.get("t") or 0.0), "positions": positions})

    return {"planetMetadata": planet_metadata, "samples": samples}
