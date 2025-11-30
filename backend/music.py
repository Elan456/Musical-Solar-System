import math
from typing import Any, Dict, List, Tuple
import json

# MIDI range for custom bodies
NOTE_RANGE = (48, 72)  # C3 to C5 roughly

# Expected radius range from your UI
RADIUS_RANGE = (2.0, 12.0)

# Base durations by instrument
NOTE_DURATION = {"mallet": 0.3, "pad": 0.6}

# How many steps per orbit for pulsed notes
ANGLE_STEPS_PER_REV = 8  # 8 notes per full orbit
ANGLE_STEP = 2 * math.pi / ANGLE_STEPS_PER_REV

def get_note_from_order(order: int, max_order: int) -> int:
    """
    Maps a planet's position from the star to a MIDI note.

    Uses only notes in the C major chord (C, E, G).
    Order 0 (closest to star) gets the lowest note, higher orders get higher notes.
    
    Starts from middle C (MIDI 60) and expands outward as needed to fit all planets.
    
    C major chord notes per octave:
      C2=36, E2=40, G2=43
      C3=48, E3=52, G3=55
      C4=60 (middle C), E4=64, G4=67
      C5=72, E5=76, G5=79
      C6=84, E6=88, G6=91
    """
    # C major chord intervals from C: C=0, E=4, G=7
    CHORD_INTERVALS = [0, 4, 7]  # 3 notes per octave
    NOTES_PER_OCTAVE = len(CHORD_INTERVALS)
    
    # Middle C as our anchor point
    MIDDLE_C = 60
    
    # Calculate how many octaves we need to span all planets
    # We want to center around middle C as much as possible
    total_notes_needed = max_order + 1
    octaves_needed = (total_notes_needed + NOTES_PER_OCTAVE - 1) // NOTES_PER_OCTAVE
    
    # Calculate the starting octave offset from middle C
    # We want to start low and go up, but stay near middle C when possible
    # Start from an octave that keeps us centered
    octaves_below_middle = (octaves_needed - 1) // 2
    start_octave_offset = -octaves_below_middle
    
    # Calculate which octave and which chord tone this order maps to
    octave_index = order // NOTES_PER_OCTAVE
    chord_tone_index = order % NOTES_PER_OCTAVE
    
    # Build the final MIDI note
    octave_offset = start_octave_offset + octave_index
    midi_note = MIDDLE_C + (octave_offset * 12) + CHORD_INTERVALS[chord_tone_index]
    
    # Clamp to valid MIDI range (0-127)
    return max(0, min(127, midi_note))

def _radius_to_velocity(radius: float) -> float:
    """
    Map a planet radius to a velocity for musical purposes.
    Larger radius -> lower velocity (slower orbit)
    """
    r_min, r_max = RADIUS_RANGE
    v_min, v_max = 0.1, 1.0  # arbitrary velocity range
    if radius < r_min:
        return v_max
    if radius > r_max:
        return v_min
    # Invert mapping: larger radius = smaller velocity
    norm = (radius - r_min) / (r_max - r_min)
    velocity = v_max - norm * (v_max - v_min)
    return velocity

def _calculate_eccentricity(min_r: float, max_r: float) -> float:
    """
    Calculate orbital eccentricity from min/max radius.
    
    e = (r_max - r_min) / (r_max + r_min)
    
    Circle: e = 0
    Parabolic: e = 1
    """
    if max_r + min_r == 0:
        return 0.0
    return (max_r - min_r) / (max_r + min_r)


def _eccentricity_to_reverb(eccentricity: float) -> float:
    """
    Map eccentricity (0-1) to reverb amount (0-1).
    
    Circular orbits (e≈0) -> dry (0.1)
    Elliptical orbits (e≈1) -> wet (0.8)
    """
    min_reverb = 0.1
    max_reverb = 0.8
    return min_reverb + eccentricity * (max_reverb - min_reverb)

def _note_events(
    planet: Dict[str, Any],
    t: float,
    all_orders: Dict[str, int],
    all_eccentricities: Dict[str, float],
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
    midi = get_note_from_order(all_orders[planet["name"]], max(all_orders.values()))

    # Velocity from radius
    base_vel = int(100 if instrument == "mallet" else 80)
    vel = base_vel - int(_radius_to_velocity(radius) * 40)
    vel = max(1, min(127, vel))


    # Duration: mallet is shorter, pad longer
    base_duration = NOTE_DURATION[instrument]
    if speed is not None and speed > 0:
        # Faster speed makes notes slightly shorter and more percussive
        dur_scale = 1.0 / (1.0 + 0.5 * min(speed, 3.0))
        duration = max(0.15, base_duration * dur_scale)
    else:
        duration = base_duration

    
    # Reverb from eccentricity if available
    eccentricity = all_eccentricities[planet["name"]]
    reverb = _eccentricity_to_reverb(eccentricity)

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


def _wrapped_angle_diff(a: float, b: float) -> float:
    """
    Smallest signed angular difference a - b in [-pi, pi].
    """
    diff = a - b
    # Bring into [-pi, pi] using modulo arithmetic
    diff = (diff + math.pi) % (2.0 * math.pi) - math.pi
    return diff

def _get_planets_min_max_radius(samples: List[Dict[str, Any]]) -> Dict[str, Tuple[float, float]]:
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
            if name not in planet_radii:
                planet_radii[name] = []
            planet_radii[name].append(r)
    
    planet_min_max: Dict[str, Tuple[float, float]] = {}
    for name, radii in planet_radii.items():
        planet_min_max[name] = (min(radii), max(radii))
    
    return planet_min_max

def _planet_orbit_events(samples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Emit a note each time a planet completes a full orbit around the star.
    
    Tracks cumulative angular displacement and triggers when it crosses
    multiples of 2π.
    """
    events: List[Dict[str, Any]] = []
    if not samples:
        return events

    first = samples[0]

    # Assign order to each planet based on distance from star
    planets_sorted = sorted(
        (body for body in first.get("planets", []) if body.get("kind") != "star"),
        key=lambda b: math.sqrt(
            (float(b.get("x") or 0.0) - float(next(
                (s.get("x") or 0.0) for s in first.get("planets", []) if s.get("kind") == "star"
            ))) ** 2 +
            (float(b.get("y") or 0.0) - float(next(
                (s.get("y") or 0.0) for s in first.get("planets", []) if s.get("kind") == "star"
            ))) ** 2
        )
    )

    all_orders = {}

    for order, planet in enumerate(planets_sorted):
        all_orders[planet["name"]] = order

    all_eccentricities = {}
    for planet in planets_sorted:
        name = planet["name"]
        min_r, max_r = _get_planets_min_max_radius(samples).get(name, (0.0, 0.0))
        eccentricity = _calculate_eccentricity(min_r, max_r)
        all_eccentricities[name] = eccentricity

    print(f"Assigned planet orders: {all_orders}")

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

    # Per-planet state: track cumulative angle and last trigger point
    planet_state: Dict[str, Dict[str, float]] = {}

    # Initialize with starting angles
    for body in first.get("planets", []):
        if body.get("kind") == "star":
            continue
        x = float(body.get("x") or 0.0) - initial_star_pos[0]
        y = float(body.get("y") or 0.0) - initial_star_pos[1]
        theta = math.atan2(y, x)
        planet_state[body["name"]] = {
            "last_theta": theta,
            "cumulative_angle": 0.0,
            "last_trigger_orbit": 0,  # which orbit number we last triggered on
        }

    for sample in samples[1:]:
        t = float(sample.get("t") or 0.0)

        # Get current star position
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
                continue

            # Current angle relative to star
            x = float(body.get("x") or 0.0) - star_pos[0]
            y = float(body.get("y") or 0.0) - star_pos[1]
            theta = math.atan2(y, x)

            # Calculate angular change (handle wraparound)
            delta = _wrapped_angle_diff(theta, state["last_theta"])
            state["cumulative_angle"] += delta
            state["last_theta"] = theta

            # Check if we've completed a new orbit
            # (cumulative angle crossed a multiple of 2π)
            current_orbit = int(state["cumulative_angle"] / (2 * math.pi))
            
            if current_orbit > state["last_trigger_orbit"]:
                # Completed an orbit! Emit note.
                speed = float(body.get("speed") or 0.0)
                events.extend(_note_events(body, t, all_orders, all_eccentricities, speed=speed))
                state["last_trigger_orbit"] = current_orbit

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
    if not samples:
        raise ValueError("No samples provided for event generation.")

    
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
