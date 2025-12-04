"""
Main class for handling a solar system.
"""

from __future__ import annotations

import math
from typing import Iterable, List, Optional, Sequence, Dict, Any

import numpy as np
from fastquadtree import QuadTree

from .body import PhysicsBody

G_DEFAULT = 6.67430e-11  # m^3 kg^-1 s^-2
CULL_DISTANCE_AU = 1.0  # Skip planet-planet forces beyond this distance


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
        """
        Compute pairwise gravity. Star interactions are always applied.
        Planet-planet interactions are culled if planets are >1 AU apart,
        using a QuadTree to avoid O(n^2) scans.
        """
        for body in self.bodies:
            body.reset_force()
        if not self.bodies:
            return

        def apply_force_pair(primary: PhysicsBody, secondary: PhysicsBody) -> None:
            offset = secondary.position - primary.position
            distance = np.linalg.norm(offset)
            if distance == 0:
                return  # Collocated bodies; skip to avoid singularity.
            direction = offset / distance
            magnitude = (
                self.gravitational_constant * primary.mass * secondary.mass / distance**2
            )
            force = magnitude * direction
            primary.apply_force(force)
            secondary.apply_force(-force)

        stars: List[PhysicsBody] = [
            body for body in self.bodies if (body.metadata or {}).get("kind") == "star"
        ]
        non_stars: List[PhysicsBody] = [
            body for body in self.bodies if (body.metadata or {}).get("kind") != "star"
        ]

        # Always apply star ↔ body interactions (no distance cull).
        for star in stars:
            for other in non_stars:
                apply_force_pair(star, other)

        if len(non_stars) < 2:
            return

        xs = [float(body.position[0]) for body in non_stars]
        ys = [float(body.position[1]) for body in non_stars]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        padding = CULL_DISTANCE_AU
        if min_x == max_x:
            min_x -= padding
            max_x += padding
        if min_y == max_y:
            min_y -= padding
            max_y += padding

        qt_bounds = (min_x - padding, min_y - padding, max_x + padding, max_y + padding)
        quadtree = QuadTree(qt_bounds, capacity=8, track_objects=False)

        for body in non_stars:
            quadtree.insert((float(body.position[0]), float(body.position[1])))

        # Query neighbors within 1 AU using bounding boxes, then precise distance filter.
        for idx, body in enumerate(non_stars):
            x = float(body.position[0])
            y = float(body.position[1])
            query_rect = (
                x - CULL_DISTANCE_AU,
                y - CULL_DISTANCE_AU,
                x + CULL_DISTANCE_AU,
                y + CULL_DISTANCE_AU,
            )
            candidates = quadtree.query(query_rect, as_items=False)
            for candidate_id, cand_x, cand_y in candidates:
                if candidate_id <= idx:
                    continue  # ensure each pair once
                dx = cand_x - x
                dy = cand_y - y
                distance = math.hypot(dx, dy)
                if distance > CULL_DISTANCE_AU or distance == 0:
                    continue
                other = non_stars[candidate_id]
                apply_force_pair(body, other)

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
