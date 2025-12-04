import math
from typing import Any, Dict, List, Tuple

from .constants import RADIUS_RANGE


def calculate_eccentricity(min_r: float, max_r: float) -> float:
    if max_r + min_r == 0:
        return 0.0
    return (max_r - min_r) / (max_r + min_r)


def eccentricity_to_reverb(eccentricity: float) -> float:
    """
    Map eccentricity (0-1) to reverb amount (0-1).
    Circular orbits -> dry, elliptical -> wetter.
    """
    min_reverb = 0.1
    max_reverb = 0.8
    return min_reverb + eccentricity * (max_reverb - min_reverb)


def wrapped_angle_diff(a: float, b: float) -> float:
    """
    Smallest signed angular difference a - b in [-pi, pi].
    """
    diff = (a - b + math.pi) % (2.0 * math.pi) - math.pi
    return diff


def downsample_envelope(
    envelope: List[Dict[str, float]], duration_sec: float, target_hz: float = 5.0
) -> List[Dict[str, float]]:
    """
    Reduce envelope density to roughly target_hz samples per second to shrink
    payload size while preserving shape. Always retains first/last points.
    """
    if duration_sec <= 0 or len(envelope) <= 2:
        return envelope

    target_count = max(2, int(duration_sec * target_hz))
    if len(envelope) <= target_count:
        return envelope

    step = max(1, len(envelope) // target_count)
    downsampled = envelope[::step]

    if downsampled[-1]["t"] != envelope[-1]["t"]:
        downsampled.append(envelope[-1])

    return downsampled


def inflate_samples(
    samples: List[Dict[str, Any]], planet_metadata: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Expand compact trajectory samples (positions only) into the richer shape
    expected by the music generation routines.
    """
    inflated: List[Dict[str, Any]] = []

    for sample in samples:
        positions = sample.get("positions") or []
        planets: List[Dict[str, Any]] = []

        for idx, meta in enumerate(planet_metadata):
            pos = positions[idx] if idx < len(positions) else [0.0, 0.0]
            x = float(pos[0]) if len(pos) > 0 else 0.0
            y = float(pos[1]) if len(pos) > 1 else 0.0

            planets.append(
                {
                    "name": meta.get("name", f"planet_{idx}"),
                    "kind": meta.get("kind", "rocky"),
                    "aAU": meta.get("aAU"),
                    "mass": meta.get("mass"),
                    "color": meta.get("color", "#ffffff"),
                    "radius": meta.get("radius", RADIUS_RANGE[0]),
                    "x": x,
                    "y": y,
                }
            )

        inflated.append({"t": float(sample.get("t") or 0.0), "planets": planets})

    return inflated


def get_planets_min_max_radius(samples: List[Dict[str, Any]]) -> Dict[str, Tuple[float, float]]:
    """
    Calculate min and max radius for each planet across all samples.
    Returns a dict mapping planet name to (min_radius, max_radius).
    """
    planet_radii: Dict[str, List[float]] = {}
    for sample in samples:
        for body in sample.get("planets", []):
            if body.get("kind") == "star":
                continue
            name = body["name"]
            x = float(body.get("x") or 0.0)
            y = float(body.get("y") or 0.0)
            r = math.sqrt(x * x + y * y)
            planet_radii.setdefault(name, []).append(r)

    planet_min_max: Dict[str, Tuple[float, float]] = {}
    for name, radii in planet_radii.items():
        planet_min_max[name] = (min(radii), max(radii))

    return planet_min_max
