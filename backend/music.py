import math
from typing import Any, Dict, List, Tuple
import json

# MIDI range for custom bodies
NOTE_RANGE = (48, 72)  # C3 to C5 roughly

# Expected radius range from your UI
RADIUS_RANGE = (2.0, 12.0)

# Base durations by instrument
NOTE_DURATION = {"mallet": 0.3, "pad": 0.6}

# Musical scale configuration
SCALE_ROOT = 48  # C3
SCALES: Dict[str, List[int]] = {
    # Pentatonic is forgiving and tends to sound good with random data
    "minor_pent": [0, 3, 5, 7, 10],
    "major_pent": [0, 2, 4, 7, 9],
}
DEFAULT_SCALE = "minor_pent"

# How many steps per orbit for pulsed notes
ANGLE_STEPS_PER_REV = 8  # 8 notes per full orbit
ANGLE_STEP = 2 * math.pi / ANGLE_STEPS_PER_REV


def _quantize_to_scale(
    midi: int,
    root: int = SCALE_ROOT,
    scale_name: str = DEFAULT_SCALE,
    midi_range: Tuple[int, int] = NOTE_RANGE,
) -> int:
    """
    Snap a MIDI note to the nearest pitch in the given scale and range.
    """
    low, high = midi_range
    scale_steps = SCALES.get(scale_name, SCALES[DEFAULT_SCALE])

    candidates: List[int] = []
    # Build candidate notes in a reasonable range
    for octave in range(-2, 8):
        for step in scale_steps:
            candidate = root + step + 12 * octave
            if low <= candidate <= high:
                candidates.append(candidate)

    if not candidates:
        return max(low, min(high, midi))

    best = candidates[0]
    best_diff = abs(best - midi)
    for c in candidates[1:]:
        diff = abs(c - midi)
        if diff < best_diff:
            best = c
            best_diff = diff
    return best


def radius_to_midi(radius: float) -> int:
    """
    Map planet radius to MIDI note, then quantize to a musical scale.
    """
    r_min, r_max = RADIUS_RANGE
    value = max(r_min, min(r_max, radius))
    span = r_max - r_min
    progress = (value - r_min) / span if span else 0.0
    low, high = NOTE_RANGE
    raw = low + progress * (high - low)
    midi = int(round(raw))
    return _quantize_to_scale(midi)


def _note_events(
    planet: Dict[str, Any],
    t: float,
    speed: float | None = None,
) -> List[Dict[str, Any]]:
    """
    Create a short note pair (on/off) for a planet at time t.
    Speed gently affects velocity and duration.
    """
    kind = planet.get("kind")
    instrument = "mallet" if kind == "rocky" else "pad"

    # Pitch from radius
    radius = float(planet.get("radius") or RADIUS_RANGE[0])
    midi = radius_to_midi(radius)

    # Velocity from radius and speed
    base_vel = 60 if instrument == "mallet" else 50
    vel = base_vel

    if speed is not None and speed > 0:
        # Map speed into a small boost, clamped
        speed_boost = min(speed * 10.0, 40.0)
        vel = base_vel + int(speed_boost)

    vel = max(30, min(vel, 127))

    # Duration: mallet is shorter, pad longer
    base_duration = NOTE_DURATION[instrument]
    if speed is not None and speed > 0:
        # Faster speed makes notes slightly shorter and more percussive
        dur_scale = 1.0 / (1.0 + 0.5 * min(speed, 3.0))
        duration = max(0.15, base_duration * dur_scale)
    else:
        duration = base_duration

    return [
        {
            "t": t,
            "type": "note_on",
            "planet": planet["name"],
            "midi": midi,
            "vel": vel,
            "instrument": instrument,
        },
        {
            "t": t + duration,
            "type": "note_off",
            "planet": planet["name"],
        },
    ]


def _wrapped_angle_diff(a: float, b: float) -> float:
    """
    Smallest signed angular difference a - b in [-pi, pi].
    """
    diff = a - b
    # Bring into [-pi, pi] using modulo arithmetic
    diff = (diff + math.pi) % (2.0 * math.pi) - math.pi
    return diff


def _planet_orbit_events(samples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Emit a note each time a planet passes through its starting radial direction
    relative to the star.

    Uses per planet state so that:
    - Angles are compared modulo 2*pi.
    - Each crossing produces one group of notes, not many.
    """
    events: List[Dict[str, Any]] = []
    if not samples:
        return events

    first = samples[0]

    # Find star position in the first sample
    initial_star_pos = None
    for body in first.get("planets", []):
        if body.get("kind") == "star":
            initial_star_pos = (
                float(body.get("x") or 0.0),
                float(body.get("y") or 0.0),
            )
            break

    if initial_star_pos is None:
        raise ValueError("No star found in initial sample for orbit event calculation.")

    # Per planet state
    planet_state: Dict[str, Dict[str, float]] = {}

    # Initialize starting angles
    for body in first.get("planets", []):
        if body.get("kind") == "star":
            continue
        x = float(body.get("x") or 0.0) - initial_star_pos[0]
        y = float(body.get("y") or 0.0) - initial_star_pos[1]
        theta0 = math.atan2(y, x)
        planet_state[body["name"]] = {
            "theta0": theta0,
            "last_diff": 0.0,      # diff at previous sample
            "initialized": 0.0,    # flag to avoid a false trigger on first step
        }

    # Choose a tolerance in radians, a few degrees is fine
    # You can tune this as needed
    angle_tolerance = math.radians(3.0)  # about 0.052 rad

    # Process all subsequent samples
    for sample in samples[1:]:
        t = float(sample.get("t") or 0.0)

        # Star position in this frame
        star_pos = None
        for body in sample.get("planets", []):
            if body.get("kind") == "star":
                star_pos = (
                    float(body.get("x") or 0.0),
                    float(body.get("y") or 0.0),
                )
                break

        if star_pos is None:
            raise ValueError("No star found in sample for orbit event calculation.")

        for body in sample.get("planets", []):
            if body.get("kind") == "star":
                continue

            state = planet_state.get(body["name"])
            if state is None:
                continue  # planet did not exist in first frame

            # Current angle relative to star
            x = float(body.get("x") or 0.0) - star_pos[0]
            y = float(body.get("y") or 0.0) - star_pos[1]
            theta = math.atan2(y, x)

            diff = _wrapped_angle_diff(theta, state["theta0"])

            # Skip the very first update to avoid a false trigger
            if not state["initialized"]:
                state["last_diff"] = diff
                state["initialized"] = 1.0
                continue

            # We want to trigger when we move from "outside" to "inside" the tolerance band
            was_outside = abs(state["last_diff"]) >= angle_tolerance
            is_inside = abs(diff) < angle_tolerance

            if was_outside and is_inside:
                # Estimate speed if available
                speed = float(body.get("speed") or 0.0)
                events.extend(_note_events(body, t, speed=speed))

            state["last_diff"] = diff

    return events



def _compute_planet_stats(
    samples: List[Dict[str, Any]]
) -> Dict[str, Dict[str, float]]:
    """
    Compute average radius and speed per planet for use in continuous pads.
    """
    stats: Dict[str, Dict[str, float]] = {}

    for sample in samples:
        t = float(sample.get("t") or 0.0)
        for planet in sample.get("planets", []):
            name = planet.get("name")
            if not name:
                continue

            x = float(planet.get("x") or 0.0)
            y = float(planet.get("y") or 0.0)
            r = math.sqrt(x * x + y * y)

            s = stats.get(name)
            if s is None:
                stats[name] = {
                    "r_sum": r,
                    "r_min": r,
                    "r_max": r,
                    "count": 1.0,
                    "speed_sum": 0.0,
                    "last_x": x,
                    "last_y": y,
                    "last_t": t,
                }
                continue

            # Radius stats
            s["r_sum"] += r
            s["r_min"] = min(s["r_min"], r)
            s["r_max"] = max(s["r_max"], r)
            s["count"] += 1.0

            # Speed estimate
            dt = t - s["last_t"]
            if dt > 0:
                dx = x - s["last_x"]
                dy = y - s["last_y"]
                speed = math.sqrt(dx * dx + dy * dy) / dt
                s["speed_sum"] += speed

            s["last_x"] = x
            s["last_y"] = y
            s["last_t"] = t

    # Finalize averages
    result: Dict[str, Dict[str, float]] = {}
    for name, s in stats.items():
        count = max(s["count"], 1.0)
        # speed samples are count - 1 at most, but protect against divide by zero
        speed_count = max(count - 1.0, 1.0)
        result[name] = {
            "avg_r": s["r_sum"] / count,
            "min_r": s["r_min"],
            "max_r": s["r_max"],
            "avg_speed": s["speed_sum"] / speed_count,
        }
    return result


def _find_first_planet_meta(
    samples: List[Dict[str, Any]], name: str
) -> Dict[str, Any] | None:
    """
    Get the first planet dict with this name, to read kind etc.
    """
    for sample in samples:
        for planet in sample.get("planets", []):
            if planet.get("name") == name:
                return planet
    return None


def _continuous_velocity_pads(
    samples: List[Dict[str, Any]], duration_sec: float
) -> List[Dict[str, Any]]:
    """
    One long pad per planet.

    Pitch comes from average radius, with a small offset from average speed.
    Velocity also scales with speed so fast planets get brighter drones.
    """
    stats = _compute_planet_stats(samples)
    if not stats:
        return []

    avg_speeds = [v["avg_speed"] for v in stats.values()]
    max_speed = max(avg_speeds) if avg_speeds else 0.0
    if max_speed <= 0:
        max_speed = 1.0

    events: List[Dict[str, Any]] = []

    for name, s in stats.items():
        avg_r = s["avg_r"]
        avg_speed = s["avg_speed"]

        # Base pitch from radius
        base_midi = radius_to_midi(avg_r)

        # Speed moves the note a few semitones up or down
        speed_norm = max(0.0, min(1.0, avg_speed / max_speed))
        # Map 0..1 to roughly -3..+3 semitones
        offset = int(round((speed_norm - 0.5) * 6.0))
        midi = _quantize_to_scale(base_midi + offset)

        # Instrument choice
        meta = _find_first_planet_meta(samples, name)
        kind = meta.get("kind") if meta else None
        instrument = "pad" if kind != "rocky" else "pad"

        vel = 60 + int(speed_norm * 40.0)
        vel = max(40, min(vel, 120))

        events.append(
            {
                "t": 0.0,
                "type": "note_on",
                "planet": name,
                "midi": midi,
                "vel": vel,
                "instrument": instrument,
            }
        )
        events.append(
            {"t": duration_sec, "type": "note_off", "planet": name}
        )

    return events


def events_for_system(
    samples: List[Dict[str, Any]],
    duration_sec: float,
    music_mode: str,
) -> List[Dict[str, Any]]:
    """
    Generate musical events for a simulated system.

    Modes:
      "per_orbit_note"  -> pulsed notes as planets sweep around the star
      "continuous_tone" -> one long pad per planet, influenced by velocity
      "rich"            -> combination of both for a fuller track
    """
    print("Samples given in events_for_system:", samples)
    if not samples:
        return []

    if music_mode == "continuous_tone":
        events = _continuous_velocity_pads(samples, duration_sec)
        events.sort(key=lambda e: e["t"])
        return events

    if music_mode == "rich":
        orbit_events = _planet_orbit_events(samples)
        print(f"Generated {len(orbit_events)} orbit events")
        # Write to a json file for inspection
        with open("orbit_events.json", "w") as f:
            json.dump(orbit_events, f, indent=2)
        # pad_events = _continuous_velocity_pads(samples, duration_sec)
        pad_events = []
        events = orbit_events + pad_events
        events.sort(key=lambda e: e["t"])
        return events

    # Default fallback: orbit pulses only
    orbit_events = _planet_orbit_events(samples)
    orbit_events.sort(key=lambda e: e["t"])
    return orbit_events
