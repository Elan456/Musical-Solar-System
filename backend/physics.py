"""
Utilities for constructing a System instance from a request payload and
sampling its positions for the frontend. Uses simplified game units so
numbers remain readable and render nicely in the 2D plane.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List

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
                "color": "#ffffcc",
                "radius": 12,
                "visible": False,
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
                velocity_vec = [direction[0] * speed, direction[1] * speed, 0.0]
            else:
                velocity_vec = [0.0, 0.0, 0.0]

        bodies.append(
            {
                "name": planet["name"],
                "mass": planet["mass"],
                "position": position_vec,
                "velocity": velocity_vec,
                "metadata": {**planet, "visible": True},
            }
        )
    return bodies


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
    samples: List[Dict[str, Any]] = []
    for sample in raw_samples:
        planets = []
        for body in sample["bodies"]:
            metadata = dict(body.get("metadata") or {})
            if metadata.get("visible", True) is False:
                continue
            position = body["position"]
            x = position[0]
            y = position[1]
            planets.append(
                {
                    "name": body["name"],
                    "kind": metadata.get("kind", "rocky"),
                    "aAU": metadata.get("aAU", math.sqrt(x * x + y * y)),
                    "mass": metadata.get("mass"),
                    "color": metadata.get("color", "#ffffff"),
                    "radius": metadata.get("radius", 5),
                    "x": x,
                    "y": y,
                }
            )
        samples.append({"t": sample["t"], "planets": planets})
    return samples
