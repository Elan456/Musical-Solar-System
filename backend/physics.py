import numpy as np

def period_days(aAU: float) -> float:
    # Kepler's third law, solar mass = 1
    return 365.25 * aAU ** 1.5

def samples_for_system(system, durationSec, dtSec):
    planets = system["planets"]
    n_steps = int(durationSec / dtSec) + 1
    samples = []
    for i in range(n_steps):
        t = i * dtSec
        ps = []
        for p in planets:
            T = period_days(p["aAU"])
            theta = 2 * np.pi * (t / (T * 86400 / durationSec))
            x = p["aAU"] * np.cos(theta)
            y = p["aAU"] * np.sin(theta)
            ps.append({"name": p["name"], "x": x, "y": y})
        samples.append({"t": t, "planets": ps})
    return samples
