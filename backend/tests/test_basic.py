from backend.physics import period_days
from backend.music import a_to_midi
import numpy as np

def test_period_days_earth():
    T = period_days(1.0)
    assert abs(T - 365.25) / 365.25 < 0.01

def test_a_to_midi_monotonic():
    last = a_to_midi(0.5)
    for a in np.linspace(0.6, 5.0, 20):
        midi = a_to_midi(a)
        assert midi >= last
        last = midi
