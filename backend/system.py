"""
Main class for handling a solar system.
"""

from __future__ import annotations

import math
from typing import Iterable, List, Optional, Sequence, Dict, Any

import numpy as np

from .body import PhysicsBody

G_DEFAULT = 6.67430e-11  # m^3 kg^-1 s^-2


class System:
    """
    Container that owns Body instances and computes pairwise gravity so bodies
    can integrate their trajectories.
    """

    def __init__(
        self,
        name: str = "Unnamed system",
        gravitational_constant: float = G_DEFAULT,
        initial_bodies: Optional[Sequence[dict]] = None,
    ):
        self.name = name
        self.gravitational_constant = gravitational_constant
        self.bodies: List[PhysicsBody] = []
        if initial_bodies:
            self.add_bodies(initial_bodies)

    def add_body(
        self,
        name: str,
        mass: float,
        position: Iterable[float],
        velocity: Iterable[float],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> PhysicsBody:
        body = PhysicsBody(self, name, mass, position, velocity, metadata=metadata)
        self.bodies.append(body)
        return body

    def add_bodies(self, configs: Sequence[dict]) -> List[PhysicsBody]:
        created = []
        for cfg in configs:
            created.append(
                self.add_body(
                    name=cfg["name"],
                    mass=cfg["mass"],
                    position=cfg["position"],
                    velocity=cfg["velocity"],
                    metadata=cfg.get("metadata"),
                )
            )
        return created

    def remove_body(self, name: str) -> None:
        self.bodies = [b for b in self.bodies if b.name != name]

    def get_body(self, name: str) -> Optional[PhysicsBody]:
        return next((b for b in self.bodies if b.name == name), None)

    def total_mass(self) -> float:
        return sum(body.mass for body in self.bodies)

    def _compute_gravity(self) -> None:
        for body in self.bodies:
            body.reset_force()
        for idx, primary in enumerate(self.bodies):
            for secondary in self.bodies[idx + 1 :]:
                offset = secondary.position - primary.position
                distance = np.linalg.norm(offset)
                if distance == 0:
                    continue  # Collocated bodies; skip to avoid singularity.
                direction = offset / distance
                magnitude = (
                    self.gravitational_constant * primary.mass * secondary.mass / distance**2
                )
                force = magnitude * direction
                primary.apply_force(force)
                secondary.apply_force(-force)

    def step(self, dt: float) -> None:
        """
        Compute forces, then advance each body by dt seconds.
        """
        if not self.bodies:
            return
        self._compute_gravity()
        for body in self.bodies:
            body.integrate(dt)

    def sample_positions(
        self,
        duration_seconds: float = 300.0,
        sample_rate_hz: float = 10.0,
    ) -> List[dict]:
        """
        Return a list of samples representing each body's position during the
        requested duration. Duration defaults to 5 minutes sampled at 10 Hz.
        """
        if sample_rate_hz <= 0:
            raise ValueError("sample_rate_hz must be positive")
        if duration_seconds <= 0:
            raise ValueError("duration_seconds must be positive")
        if not self.bodies:
            return []

        dt = 1.0 / sample_rate_hz
        steps = max(1, math.ceil(duration_seconds * sample_rate_hz))

        # Preserve state so sampling does not mutate the live system.
        preserved_state = [
            (body, body.position.copy(), body.velocity.copy()) for body in self.bodies
        ]

        def capture_sample(t: float) -> dict:
            bodies = []
            for body in self.bodies:
                bodies.append(
                    {
                        "name": body.name,
                        "position": body.position.copy().tolist(),
                        "metadata": dict(body.metadata),
                    }
                )
            return {"t": t, "bodies": bodies}

        samples: List[dict] = [capture_sample(0.0)]
        try:
            for idx in range(1, steps + 1):
                self.step(dt)
                samples.append(capture_sample(idx * dt))
        finally:
            for body, position, velocity in preserved_state:
                body.position = position
                body.velocity = velocity
                body.reset_force()
        return samples
