import math
from .constants import NOTE_RANGE, NOTE_DURATION, RADIUS_RANGE


def get_note_from_order(order: int, max_order: int) -> int:
    """
    Map a planet's order from the star to a MIDI note using a C-major chord stack.
    Order 0 (closest) gets the lowest note, higher orders climb upward.
    """
    chord_intervals = [0, 4, 7]  # C, E, G
    notes_per_octave = len(chord_intervals)
    middle_c = 60

    total_notes_needed = max_order + 1
    octaves_needed = (total_notes_needed + notes_per_octave - 1) // notes_per_octave
    octaves_below_middle = (octaves_needed - 1) // 2
    start_octave_offset = -octaves_below_middle

    octave_index = order // notes_per_octave
    chord_tone_index = order % notes_per_octave

    octave_offset = start_octave_offset + octave_index
    midi_note = middle_c + (octave_offset * 12) + chord_intervals[chord_tone_index]
    return max(0, min(127, midi_note))


def a_to_midi(a_au: float) -> int:
    """
    Smoothly map semi-major axis (aAU) to a MIDI note within NOTE_RANGE.
    Uses a logarithmic mapping so outer planets climb in pitch without clustering.
    """
    min_a, max_a = 0.2, 10.0
    clamped = max(min_a, min(max_a, float(a_au)))
    # Log scaling keeps progression smooth for both inner/outer planets
    ratio = (math.log(clamped) - math.log(min_a)) / (math.log(max_a) - math.log(min_a))
    midi = NOTE_RANGE[0] + ratio * (NOTE_RANGE[1] - NOTE_RANGE[0])
    return int(round(midi))


def radius_to_velocity(radius: float) -> float:
    """
    Map a planet radius to a velocity for musical purposes.
    Larger radius -> higher velocity (for volume calculation).
    Uses a cubic curve to make the difference VERY dramatic and apparent.
    Small planets are very quiet, large planets are very loud.
    """
    r_min, r_max = RADIUS_RANGE
    v_min, v_max = 0.00, 1.0  # Wider range: smallest planets are much quieter
    if radius < r_min:
        return v_min
    if radius > r_max:
        return v_max
    # Normalize to 0-1
    norm = (radius - r_min) / (r_max - r_min)
    # Apply cubic curve for dramatic effect: small planets very quiet, large planets very loud
    curved = norm ** 3
    return v_min + curved * (v_max - v_min)


def note_duration(instrument: str, speed: float | None = None) -> float:
    """
    Base duration per instrument, optionally shortened when the planet moves fast.
    """
    base = NOTE_DURATION["mallet"] if instrument == "mallet" else NOTE_DURATION["pad"]
    if speed is None or speed <= 0:
        return base
    dur_scale = 1.0 / (1.0 + 0.5 * min(speed, 3.0))
    return max(0.15, base * dur_scale)
