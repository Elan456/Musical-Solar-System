import numpy as np

C_MAJOR = [0, 2, 4, 5, 7, 9, 11]  # MIDI offsets for C major
BASE_MIDI = 48  # C3
OCTAVES = 3

def a_to_midi(aAU: float) -> int:
    # Map log(aAU) to C major scale over 3 octaves
    log_a = np.log2(aAU)
    scale_steps = len(C_MAJOR) * OCTAVES
    idx = int(np.clip(log_a * scale_steps + scale_steps // 2, 0, scale_steps - 1))
    octave, note = divmod(idx, len(C_MAJOR))
    return BASE_MIDI + octave * 12 + C_MAJOR[note]

def events_for_system(system, durationSec, musicMode):
    planets = system["planets"]
    events = []
    for p in planets:
        midi = a_to_midi(p["aAU"])
        instrument = "mallet" if p["kind"] == "rocky" else "pad"
        T = 365.25 * p["aAU"] ** 1.5
        T_sec = T * 86400 / durationSec
        if musicMode == "per_orbit_note":
            t = 0.0
            while t < durationSec:
                events.append({"t": t, "type": "note_on", "planet": p["name"], "midi": midi, "vel": 80, "instrument": instrument})
                t += T_sec
        else:  # continuous_tone
            events.append({"t": 0.0, "type": "note_on", "planet": p["name"], "midi": midi, "vel": 80, "instrument": instrument})
            events.append({"t": durationSec, "type": "note_off", "planet": p["name"]})
    return events
