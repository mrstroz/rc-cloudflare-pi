"""L298N bridge adapter: two wheels, each a direction pair (IN) and a PWM enable (EN).

The adapter is the hardware layer only. It takes a ready duty per wheel; the mapping
from operator input to duty (calibration, deadband, limit, pause on direction change)
belongs to the control loop. Nothing here sleeps.

States follow docs/spec/07 §3 and ADR-0010. Zero or STOP means EN = 0 (coast); active
braking (EN = 1 with equal IN) is never produced, not even for an instant: on any
direction change EN goes to 0 first, then the IN pair changes, then EN takes the duty.

``close()`` releases every pin. On the Pi the lgpio backend then leaves the pin as an
input without a pull-down, so ENA may read HIGH (07 §2). Whoever closes the bridge must
follow it with ``gpio_helper.disable_enables``; running the helper before the release
would be undone by it.
"""

from __future__ import annotations

from contextlib import ExitStack
from dataclasses import dataclass
from types import TracebackType
from typing import Self

from gpiozero import DigitalOutputDevice, PWMOutputDevice

from rc_agent.config import Pins, Wheels


@dataclass
class _Wheel:
    enable: PWMOutputDevice
    in_first: DigitalOutputDevice  # IN1 / IN3
    in_second: DigitalOutputDevice  # IN2 / IN4
    inverted: bool
    direction: int = 0  # -1, 0 or 1 in the wheel's logical frame

    def coast(self) -> None:
        self.enable.value = 0.0

    def release_direction(self) -> None:
        self.in_first.off()
        self.in_second.off()
        self.direction = 0

    def run(self, speed: float) -> None:
        direction = 1 if speed > 0 else -1
        if direction != self.direction:
            self.coast()
            # Logical forward drives IN1/IN3 high; the config inversion swaps the pair.
            first_high = (direction > 0) != self.inverted
            self.in_first.value = first_high
            self.in_second.value = not first_high
            self.direction = direction
        self.enable.value = abs(speed)


class Bridge:
    """Left wheel on channel A (ENA, IN1, IN2), right wheel on channel B (ENB, IN3, IN4)."""

    def __init__(self, pins: Pins, wheels: Wheels, pwm_frequency_hz: float) -> None:
        self._pins = pins
        self._closed = False
        # Any device already created is closed if a later one fails (e.g. pin in use).
        with ExitStack() as stack:

            def digital(pin: int) -> DigitalOutputDevice:
                return stack.enter_context(DigitalOutputDevice(pin))

            def pwm(pin: int) -> PWMOutputDevice:
                return stack.enter_context(PWMOutputDevice(pin, frequency=pwm_frequency_hz))

            # Both enables first, so neither is left unclaimed while the direction pins are set up.
            ena = pwm(pins.ena)
            enb = pwm(pins.enb)
            self._left = _Wheel(ena, digital(pins.in1), digital(pins.in2), wheels.left_inverted)
            self._right = _Wheel(enb, digital(pins.in3), digital(pins.in4), wheels.right_inverted)
            self._devices = stack.pop_all()

    @property
    def pins(self) -> Pins:
        return self._pins

    def drive(self, left: float, right: float) -> None:
        """Set each wheel from -1 to 1: the sign is the logical direction, |x| the duty.

        Both values are checked before any pin changes. NaN is rejected too.
        """
        for speed in (left, right):
            if not -1.0 <= speed <= 1.0:
                raise ValueError(f"wheel speed must be within -1..1, got {speed}")
        if self._closed:
            raise RuntimeError("bridge is closed")
        for wheel, speed in ((self._left, left), (self._right, right)):
            if speed == 0.0:
                wheel.coast()
                wheel.release_direction()
            else:
                wheel.run(speed)

    def stop(self) -> None:
        """Coast: both enables to 0 first, then the direction pins low."""
        if self._closed:
            return
        self._left.coast()
        self._right.coast()
        self._left.release_direction()
        self._right.release_direction()

    def close(self) -> None:
        """Stop, then release every pin. Run ``gpio_helper.disable_enables`` afterwards."""
        if self._closed:
            return
        try:
            self.stop()
        finally:
            self._closed = True
            self._devices.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()
