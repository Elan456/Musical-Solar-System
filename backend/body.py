"""
Mutable representation of a body that belongs to a System.
"""

from __future__ import annotations

from typing import Iterable, TYPE_CHECKING, Optional, Dict, Any

import numpy as np

if TYPE_CHECKING:  # Avoid circular import during runtime
    from .system import System


class PhysicsBody:
    """
    Represents a single point-mass tracked by a System. The System instance is
    stored on the body as ``self.system`` so every body knows where it belongs.
    """

    def __init__(
        self,
        system: System,
        name: str,
        mass: float,
        position: Iterable[float],
        velocity: Iterable[float],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.system = system
        self.name = name
        self.mass = float(mass)
        self.position = np.array(position, dtype=float)
        self.velocity = np.array(velocity, dtype=float)
        if self.position.shape != (3,) or self.velocity.shape != (3,):
            raise ValueError("position and velocity must be 3‑element vectors")
        self._force = np.zeros(3, dtype=float)
        self.metadata: Dict[str, Any] = dict(metadata or {})

    @property
    def force(self) -> np.ndarray:
        return self._force

    def reset_force(self) -> None:
        self._force.fill(0.0)

    def apply_force(self, force: np.ndarray) -> None:
        self._force += force

    def acceleration(self) -> np.ndarray:
        if self.mass == 0:
            raise ZeroDivisionError("Cannot integrate body with zero mass.")
        return self._force / self.mass

    def integrate(self, dt: float) -> None:
        """Advance velocity then position using the current net force."""
        self.velocity += self.acceleration() * dt
        self.position += self.velocity * dt

    def distance_to(self, other: PhysicsBody) -> float:
        """Return Euclidean distance to another body."""
        return float(np.linalg.norm(self.position - other.position))
