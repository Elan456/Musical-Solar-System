import json
import os
from typing import Any, Dict, List

from .planet_stats import generate_planet_stats
from .orbit_events import planet_orbit_events
from .velocity_pads import velocity_pad_events
from .utils import inflate_samples


def events_for_system(
    samples: List[Dict[str, Any]],
    planet_metadata: List[Dict[str, Any]],
    duration_sec: float,
) -> List[Dict[str, Any]]:
    """
    Generate musical events for a simulated system.
    """
    if not samples:
        raise ValueError("No samples provided for event generation.")

    expanded_samples = inflate_samples(samples, planet_metadata)
    if not expanded_samples:
        raise ValueError("No valid samples after expansion for event generation.")

    stats = generate_planet_stats(expanded_samples)

    orbit_events = planet_orbit_events(expanded_samples, stats)
    pad_events = velocity_pad_events(expanded_samples, duration_sec, stats)

    debug_enabled = os.getenv("MUSIC_DEBUG", "false").lower() == "true"
    if debug_enabled:
        with open("orbit_events.json", "w") as f:
            json.dump(orbit_events, f, indent=2)

    events = orbit_events + pad_events
    events.sort(key=lambda e: e["t"])
    return events
