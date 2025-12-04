import math
from typing import Any, Dict, List, Tuple

from .note_mapping import get_note_from_order, radius_to_velocity
from .planet_stats import PlanetStats
from .utils import downsample_envelope, eccentricity_to_reverb


def _collect_velocity_samples(
    samples: List[Dict[str, Any]], planet_name: str
) -> List[Tuple[float, float]]:
    """
    Single-pass extraction of velocity samples for a gas planet.
    """
    last_position = None
    velocity_samples: List[Tuple[float, float]] = []

    for sample in samples:
        t = float(sample.get("t") or 0.0)

        for body in sample.get("planets", []):
            if body["name"] != planet_name:
                continue

            x = float(body.get("x") or 0.0)
            y = float(body.get("y") or 0.0)

            if last_position is not None:
                t_prev, x_prev, y_prev = last_position
                dt = t - t_prev
                if dt > 0:
                    dx = x - x_prev
                    dy = y - y_prev
                    distance = math.sqrt(dx * dx + dy * dy)
                    speed = distance / dt
                    velocity_samples.append((t, speed))

            last_position = (t, x, y)
            break

    return velocity_samples


def velocity_pad_events(samples: List[Dict[str, Any]], duration_sec: float, stats: PlanetStats) -> List[Dict[str, Any]]:
    """
    Create continuous pad tones for gas giants that modulate in volume
    based on their orbital velocity at each moment.
    """
    events: List[Dict[str, Any]] = []
    if not samples or len(samples) < 2:
        return events

    first = samples[0]
    gas_planets = [body for body in first.get("planets", []) if body.get("kind") == "gas"]
    if not gas_planets:
        return events

    max_order = max(stats.orders.values()) if stats.orders else 0

    for gas_planet in gas_planets:
        name = gas_planet["name"]
        velocity_samples = _collect_velocity_samples(samples, name)
        if not velocity_samples:
            continue

        speeds = [v[1] for v in velocity_samples]
        min_speed = min(speeds)
        max_speed = max(speeds)
        speed_range = max_speed - min_speed

        velocity_envelope = []
        for t, speed in velocity_samples:
            if speed_range > 0.0001:
                normalized = (speed - min_speed) / speed_range
            else:
                normalized = 0.5

            normalized = 0.2 + normalized * 0.8
            velocity_envelope.append({"t": t, "velocity": normalized})

        velocity_envelope = downsample_envelope(velocity_envelope, duration_sec)

        midi = get_note_from_order(stats.orders[name], max_order)
        eccentricity = stats.eccentricities.get(name, 0.0)
        reverb = eccentricity_to_reverb(eccentricity)

        radius = float(gas_planet.get("radius") or 0.0)
        base_vel = 80 - int(radius_to_velocity(radius) * 40)
        base_vel = max(1, min(127, base_vel))

        events.append(
            {
                "t": 0,
                "type": "note_on",
                "planet": name,
                "midi": midi,
                "vel": base_vel,
                "instrument": "pad",
                "reverb": reverb,
                "continuous": True,
                "velocityEnvelope": velocity_envelope,
                "eccentricity": eccentricity,
            }
        )

        events.append(
            {
                "t": duration_sec,
                "type": "note_off",
                "planet": name,
            }
        )

    return events
