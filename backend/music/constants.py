import math

# MIDI range for custom bodies
NOTE_RANGE = (48, 72)  # C3 to C5 roughly

# Expected radius range from the UI
RADIUS_RANGE = (2.0, 12.0)

# Base durations by instrument
NOTE_DURATION = {"mallet": 0.3, "pad": 0.6}

# How many steps per orbit for pulsed notes
ANGLE_STEPS_PER_REV = 8  # 8 notes per full orbit
ANGLE_STEP = 2 * math.pi / ANGLE_STEPS_PER_REV
