from dataclasses import dataclass
import math
from typing import Any, Dict, List, Tuple

from .utils import calculate_eccentricity, get_planets_min_max_radius


@dataclass
class PlanetStats:
    star_position: Tuple[float, float]
    planets_sorted: List[Dict[str, Any]]
    orders: Dict[str, int]
    eccentricities: Dict[str, float]
    min_max_radii: Dict[str, Tuple[float, float]]


def _find_star_position(sample: Dict[str, Any]) -> Tuple[float, float]:
    for body in sample.get("planets", []):
        if body.get("kind") == "star":
            return (
                float(body.get("x") or 0.0),
                float(body.get("y") or 0.0),
            )
    raise ValueError("No star found in samples")


def generate_planet_stats(samples: List[Dict[str, Any]]) -> PlanetStats:
    if not samples:
        raise ValueError("No samples provided for stat generation.")

    first = samples[0]
    star_pos = _find_star_position(first)

    planets_sorted = sorted(
        (body for body in first.get("planets", []) if body.get("kind") != "star"),
        key=lambda b: math.sqrt(
            (float(b.get("x") or 0.0) - star_pos[0]) ** 2 +
            (float(b.get("y") or 0.0) - star_pos[1]) ** 2
        ),
    )

    orders = {planet["name"]: order for order, planet in enumerate(planets_sorted)}
    min_max_radii = get_planets_min_max_radius(samples)
    eccentricities = {
        planet["name"]: calculate_eccentricity(*min_max_radii.get(planet["name"], (0.0, 0.0)))
        for planet in planets_sorted
    }

    return PlanetStats(
        star_position=star_pos,
        planets_sorted=planets_sorted,
        orders=orders,
        eccentricities=eccentricities,
        min_max_radii=min_max_radii,
    )
