"""L298N bridge against the truth table in docs/spec/07 §3, checked on mock pin states.

Assertions read the pins, never the Bridge's own attributes, so a wrong pin write fails here
even when the adapter believes it is right.
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from typing import Any

import pytest
from gpiozero import Device
from gpiozero.pins.mock import MockFactory, MockPWMPin

from rc_agent.config import Pins, Wheels
from rc_agent.l298n import Bridge

PINS = Pins(ena=12, in1=17, in2=27, in3=22, in4=23, enb=13)
STRAIGHT = Wheels(left_inverted=False, right_inverted=False)
# (enable, in_a, in_b) per wheel; 07 §2: IN1=1, IN2=0 and IN3=1, IN4=0 turn the wheels forward.
LEFT = ("ena", "in1", "in2")
RIGHT = ("enb", "in3", "in4")

# Every state change of every pin, in the order it happened across pins.
_log: list[tuple[Any, float]] = []
_state_at_close: dict[int, float] = {}


class RecordingPin(MockPWMPin):  # type: ignore[misc]
    """Relies on MockPin's private ``_change_state`` and ``_state`` (gpiozero 2.0.1)."""

    def _change_state(self, value: float) -> bool:
        changed: bool = super()._change_state(value)
        if changed:
            _log.append((self, float(value)))
        return changed

    def close(self) -> None:
        # Recorded before the mock's own close, which drops the state to 0 by itself and would
        # hide a Bridge that released an enable while it was still driving.
        _state_at_close[id(self)] = float(self._state)
        super().close()


@pytest.fixture
def factory() -> Iterator[MockFactory]:
    f = MockFactory(pin_class=RecordingPin)
    Device.pin_factory = f
    _log.clear()
    _state_at_close.clear()
    yield f
    f.reset()


def pin(factory: MockFactory, pins: Pins, name: str) -> Any:
    return factory.pin(getattr(pins, name))


def state(factory: MockFactory, pins: Pins, name: str) -> float:
    return float(pin(factory, pins, name).state)


def wheel(factory: MockFactory, pins: Pins, names: tuple[str, str, str]) -> tuple[float, int, int]:
    en, a, b = names
    return state(factory, pins, en), int(state(factory, pins, a)), int(state(factory, pins, b))


def assert_wheel(
    factory: MockFactory, pins: Pins, names: tuple[str, str, str], duty: float, a: int, b: int
) -> None:
    en, in_a, in_b = wheel(factory, pins, names)
    assert en == pytest.approx(duty), names
    assert (in_a, in_b) == (a, b), names


def assert_never_braking(factory: MockFactory, pins: Pins) -> None:
    """Replay the cross-pin log: no wheel may ever have EN > 0 with equal IN (07 §3, row 3)."""
    by_pin = {id(pin(factory, pins, n)): n for n in LEFT + RIGHT}
    current = dict.fromkeys(LEFT + RIGHT, 0.0)
    for i, (p, value) in enumerate(_log):
        name = by_pin.get(id(p))
        if name is None:
            continue
        current[name] = value
        for en, a, b in (LEFT, RIGHT):
            if current[en] > 0:
                assert current[a] != current[b], (
                    f"event {i}: {en}={current[en]} with {a}={current[a]}, {b}={current[b]}"
                )


def test_starts_with_both_enables_off_and_all_outputs(factory: MockFactory) -> None:
    with Bridge(PINS, STRAIGHT, 100) as _:
        for name in LEFT + RIGHT:
            assert pin(factory, PINS, name).function == "output", name
        assert state(factory, PINS, "ena") == 0
        assert state(factory, PINS, "enb") == 0


@pytest.mark.parametrize("hz", [100, 250])
def test_enables_use_configured_pwm_frequency(factory: MockFactory, hz: float) -> None:
    with Bridge(PINS, STRAIGHT, hz) as bridge:
        bridge.drive(0.5, 0.5)
        assert pin(factory, PINS, "ena").frequency == hz
        assert pin(factory, PINS, "enb").frequency == hz


# Row 2: EN = PWM, opposite IN -> rotation; the sign picks the direction.
@pytest.mark.parametrize(
    ("left", "right", "expected_left", "expected_right"),
    [
        (0.5, 0.0, (0.5, 1, 0), (0.0, None, None)),
        (-0.5, 0.0, (0.5, 0, 1), (0.0, None, None)),
        (0.0, 0.7, (0.0, None, None), (0.7, 1, 0)),
        (0.0, -0.7, (0.0, None, None), (0.7, 0, 1)),
        (1.0, -1.0, (1.0, 1, 0), (1.0, 0, 1)),
        (-0.3, 0.3, (0.3, 0, 1), (0.3, 1, 0)),
    ],
)
def test_drive_sets_truth_table_row(
    factory: MockFactory,
    left: float,
    right: float,
    expected_left: tuple[float, int | None, int | None],
    expected_right: tuple[float, int | None, int | None],
) -> None:
    with Bridge(PINS, STRAIGHT, 100) as bridge:
        bridge.drive(left, right)
        for names, expected in ((LEFT, expected_left), (RIGHT, expected_right)):
            en, a, b = wheel(factory, PINS, names)
            assert en == pytest.approx(expected[0]), names
            if expected[1] is None:
                # Row 1: EN = 0, IN don't matter.
                continue
            assert (a, b) == (expected[1], expected[2]), names
            assert a != b
        assert_never_braking(factory, PINS)


def test_zero_on_one_wheel_turns_only_its_enable_off(factory: MockFactory) -> None:
    with Bridge(PINS, STRAIGHT, 100) as bridge:
        bridge.drive(0.6, 0.6)
        bridge.drive(0.0, 0.6)
        assert state(factory, PINS, "ena") == 0
        assert state(factory, PINS, "enb") == pytest.approx(0.6)


@pytest.mark.parametrize(
    ("wheels", "inverted", "straight"),
    [
        (Wheels(left_inverted=True, right_inverted=False), LEFT, RIGHT),
        (Wheels(left_inverted=False, right_inverted=True), RIGHT, LEFT),
    ],
)
def test_inversion_swaps_only_that_wheels_inputs(
    factory: MockFactory,
    wheels: Wheels,
    inverted: tuple[str, str, str],
    straight: tuple[str, str, str],
) -> None:
    with Bridge(PINS, wheels, 100) as bridge:
        bridge.drive(0.5, 0.5)
        assert_wheel(factory, PINS, inverted, 0.5, 0, 1)
        assert_wheel(factory, PINS, straight, 0.5, 1, 0)
        bridge.drive(-0.5, -0.5)
        assert_wheel(factory, PINS, inverted, 0.5, 1, 0)
        assert_wheel(factory, PINS, straight, 0.5, 0, 1)


def test_stop_turns_both_enables_off(factory: MockFactory) -> None:
    """ADR-0010: STOP is coast, EN = 0 on both channels."""
    with Bridge(PINS, STRAIGHT, 100) as bridge:
        bridge.drive(0.8, -0.8)
        bridge.stop()
        assert state(factory, PINS, "ena") == 0
        assert state(factory, PINS, "enb") == 0
        assert pin(factory, PINS, "ena").function == "output"
        assert pin(factory, PINS, "enb").function == "output"
        assert_never_braking(factory, PINS)


def test_never_brakes_across_direction_changes(factory: MockFactory) -> None:
    """Row 3 (EN = 1, equal IN = active braking) is unreachable, even between two writes."""
    sequence = [
        (0.5, 0.5),
        (-0.5, -0.5),
        (1.0, -1.0),
        (-1.0, 1.0),
        (0.0, 0.0),
        (0.3, -0.3),
        (-0.3, 0.3),
    ]
    with Bridge(PINS, STRAIGHT, 100) as bridge:
        for left, right in sequence:
            bridge.drive(left, right)
        bridge.stop()
        bridge.drive(0.4, 0.4)
    assert _log, "recording pin saw no writes"
    assert_never_braking(factory, PINS)


def test_never_brakes_with_inverted_wheels(factory: MockFactory) -> None:
    with Bridge(PINS, Wheels(left_inverted=True, right_inverted=True), 100) as bridge:
        for left, right in [(0.5, -0.5), (-0.5, 0.5), (1.0, 1.0), (-1.0, -1.0)]:
            bridge.drive(left, right)
    assert_never_braking(factory, PINS)


@pytest.mark.parametrize("bad", [1.01, -1.01, 2.0, math.inf, -math.inf, math.nan])
def test_drive_rejects_values_outside_unit_range(factory: MockFactory, bad: float) -> None:
    with Bridge(PINS, STRAIGHT, 100) as bridge:
        bridge.drive(0.5, -0.5)
        mark = len(_log)
        with pytest.raises(ValueError):
            bridge.drive(bad, 0.2)
        with pytest.raises(ValueError):
            bridge.drive(-0.2, bad)
        # Both values are checked before any pin changes.
        assert _log[mark:] == []


def assert_closed_after_coasting(factory: MockFactory, pins: Pins) -> None:
    """Close releases every pin, and each enable was already 0 when it was released.

    After the release the process has to run the GPIO helper (RC-04): on lgpio a released
    enable floats HIGH (07 §2), which the mock cannot show.
    """
    for name in LEFT + RIGHT:
        assert pin(factory, pins, name).function == "input", f"{name} not released"
    for name in ("ena", "enb"):
        p = pin(factory, pins, name)
        assert _state_at_close.get(id(p)) == 0, f"{name} released while driving"


def test_close_coasts_then_releases_all_pins(factory: MockFactory) -> None:
    bridge = Bridge(PINS, STRAIGHT, 100)
    bridge.drive(0.9, -0.9)
    bridge.close()
    assert_closed_after_coasting(factory, PINS)
    assert_never_braking(factory, PINS)


def test_exit_on_exception_coasts_then_releases(factory: MockFactory) -> None:
    with pytest.raises(RuntimeError), Bridge(PINS, STRAIGHT, 100) as bridge:
        bridge.drive(0.9, 0.9)
        raise RuntimeError("boom")
    assert_closed_after_coasting(factory, PINS)


def test_same_direction_duty_change_keeps_pwm_running(factory: MockFactory) -> None:
    """A control loop tick that only changes duty must not gap the PWM or touch the inputs."""
    with Bridge(PINS, STRAIGHT, 100) as bridge:
        bridge.drive(0.4, -0.4)
        mark = len(_log)
        bridge.drive(0.7, -0.6)
        bridge.drive(0.5, -0.9)
        changes = _log[mark:]
        ins = {id(pin(factory, PINS, n)) for n in ("in1", "in2", "in3", "in4")}
        ens = {id(pin(factory, PINS, n)) for n in ("ena", "enb")}
        assert not [v for p, v in changes if id(p) in ins], "inputs touched"
        assert all(v > 0 for p, v in changes if id(p) in ens), "enable dropped to 0"
        assert_wheel(factory, PINS, LEFT, 0.5, 1, 0)
        assert_wheel(factory, PINS, RIGHT, 0.9, 0, 1)


def test_pins_come_from_config(factory: MockFactory) -> None:
    other = Pins(ena=18, in1=5, in2=6, in3=24, in4=25, enb=19)
    with Bridge(other, STRAIGHT, 100) as bridge:
        bridge.drive(0.5, -0.5)
        assert_wheel(factory, other, LEFT, 0.5, 1, 0)
        assert_wheel(factory, other, RIGHT, 0.5, 0, 1)
        # The default wiring was never claimed.
        for n in (12, 13, 17, 27, 22, 23):
            assert factory.pin(n).function == "input", n


def test_failed_constructor_releases_pins_it_already_claimed(factory: MockFactory) -> None:
    clash = Pins(ena=12, in1=17, in2=17, in3=22, in4=23, enb=13)
    # The traceback is kept alive on purpose: otherwise CPython would collect the half-built
    # Bridge and close its devices by refcount, hiding a constructor that leaks them.
    with pytest.raises(Exception, match="17") as excinfo:
        Bridge(clash, STRAIGHT, 100)
    for n in (12, 17):
        assert factory.pin(n).function == "input", n
    # Nothing is left reserved: the correct wiring can be claimed right after.
    with Bridge(PINS, STRAIGHT, 100) as bridge:
        bridge.drive(0.5, 0.5)
        assert_wheel(factory, PINS, LEFT, 0.5, 1, 0)
    assert excinfo.value is not None


def test_drive_after_close_is_refused_without_claiming_pins(factory: MockFactory) -> None:
    bridge = Bridge(PINS, STRAIGHT, 100)
    bridge.close()
    mark = len(_log)
    with pytest.raises(RuntimeError):
        bridge.drive(0.5, 0.5)
    assert _log[mark:] == []
    for name in LEFT + RIGHT:
        assert pin(factory, PINS, name).function == "input", name
    # stop() and a second close() after close are harmless.
    bridge.stop()
    bridge.close()


class _ClaimOrder:
    """Wraps MockFactory.pin: records the order pins are claimed in, can refuse one of them."""

    def __init__(self, factory: MockFactory, refuse: int | None = None) -> None:
        self._pin = factory.pin
        self.refuse = refuse
        self.order: list[int] = []
        self.enables_when_refused: tuple[tuple[str, float], ...] | None = None

    def __call__(self, spec: Any, **kwargs: Any) -> Any:
        number = int(spec)
        if number not in self.order:
            self.order.append(number)
        if number == self.refuse:
            self.enables_when_refused = tuple(
                (self._pin(n).function, float(self._pin(n).state)) for n in (PINS.ena, PINS.enb)
            )
            raise RuntimeError(f"GPIO{number} in use")
        return self._pin(spec, **kwargs)


def test_both_enables_are_claimed_before_any_direction_pin(
    factory: MockFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Neither enable is left floating while the IN pins are set up (07 §2)."""
    claims = _ClaimOrder(factory)
    monkeypatch.setattr(factory, "pin", claims)
    Bridge(PINS, STRAIGHT, 100).close()
    assert set(claims.order[:2]) == {PINS.ena, PINS.enb}
    assert set(claims.order) == {12, 13, 17, 27, 22, 23}


def test_refused_direction_pin_finds_both_enables_low(
    factory: MockFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    claims = _ClaimOrder(factory, refuse=PINS.in1)
    monkeypatch.setattr(factory, "pin", claims)
    with pytest.raises(RuntimeError, match="in use"):
        Bridge(PINS, STRAIGHT, 100)
    assert claims.enables_when_refused == (("output", 0.0), ("output", 0.0))
    monkeypatch.undo()
    for n in (PINS.ena, PINS.enb):
        assert factory.pin(n).function == "input", n
