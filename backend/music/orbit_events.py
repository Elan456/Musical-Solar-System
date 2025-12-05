import math
from typing import Any, Dict, List

from .note_mapping import get_note_from_order, note_duration, radius_to_velocity
from .planet_stats import PlanetStats
from .utils import eccentricity_to_reverb, wrapped_angle_diff


def _note_events(
    planet: Dict[str, Any],
    t: float,
    stats: PlanetStats,
    speed: float | None = None,
) -> List[Dict[str, Any]]:
    """
    Create a short note pair (on/off) for a planet at time t.
    Speed gently affects velocity and duration.
    """
    kind = planet.get("kind")
    instrument = "mallet" if kind == "rocky" else "pad"

    radius = float(planet.get("radius") or 0.0)
    max_order = max(stats.orders.values()) if stats.orders else 0
    midi = get_note_from_order(stats.orders.get(planet["name"], 0), max_order)

    # Map radius to velocity with wider dynamic range
    # radius_to_velocity returns 0.1-1.0, we scale this to use more of MIDI's 1-127 range
    radius_factor = radius_to_velocity(radius)
    if instrument == "mallet":
        # Mallets: louder base, wider range (60-127)
        vel = int(20 + radius_factor * 120)
    else:
        # Pads: softer base, moderate range (40-110)
        vel = int(40 + radius_factor * 70)
    vel = max(1, min(127, vel))

    duration = note_duration(instrument, speed)
    eccentricity = stats.eccentricities.get(planet["name"], 0.0)
    reverb = eccentricity_to_reverb(eccentricity)

    return [
        {
            "t": t,
            "type": "note_on",
            "planet": planet["name"],
            "midi": midi,
            "vel": vel,
            "instrument": instrument,
            "reverb": reverb,
        },
        {
            "t": t + duration,
            "type": "note_off",
            "planet": planet["name"],
        },
    ]


def planet_orbit_events(samples: List[Dict[str, Any]], stats: PlanetStats) -> List[Dict[str, Any]]:
    """
    Emit a note each time a planet completes a full orbit around the star.

    Tracks cumulative angular displacement and triggers when it crosses
    multiples of 2π.
    """
    events: List[Dict[str, Any]] = []
    if not samples:
        return events

    first = samples[0]
    star_pos = stats.star_position

    planet_state: Dict[str, Dict[str, float]] = {}
    for body in first.get("planets", []):
        if body.get("kind") == "star" or body["kind"] == "gas":
            continue
        x = float(body.get("x") or 0.0) - star_pos[0]
        y = float(body.get("y") or 0.0) - star_pos[1]
        theta = math.atan2(y, x)
        planet_state[body["name"]] = {
            "last_theta": theta,
            "cumulative_angle": 0.0,
            "last_trigger_orbit": 0,
        }

    for sample in samples[1:]:
        t = float(sample.get("t") or 0.0)
        current_star_pos = stats.star_position
        for body in sample.get("planets", []):
            if body.get("kind") == "star":
                current_star_pos = (
                    float(body.get("x") or 0.0),
                    float(body.get("y") or 0.0),
                )
                break

        for body in sample.get("planets", []):
            if body.get("kind") == "star":
                continue

            state = planet_state.get(body["name"])
            if state is None:
                continue

            x = float(body.get("x") or 0.0) - current_star_pos[0]
            y = float(body.get("y") or 0.0) - current_star_pos[1]
            theta = math.atan2(y, x)

            delta = wrapped_angle_diff(theta, state["last_theta"])
            state["cumulative_angle"] += delta
            state["last_theta"] = theta

            current_orbit = int(state["cumulative_angle"] / (2 * math.pi))
            if current_orbit > state["last_trigger_orbit"]:
                speed = float(body.get("speed") or 0.0)
                events.extend(_note_events(body, t, stats, speed=speed))
                state["last_trigger_orbit"] = current_orbit

    return events
