"""Agent configuration loaded from a TOML file kept outside the repository.

Unknown keys are rejected so a typo cannot silently fall back to a default.
Values that are not measured yet (calibration, freshness TTL) load as ``None``;
deciding whether the profile is complete enough to arm belongs to the agent.
"""

from __future__ import annotations

import math
import tomllib
from dataclasses import astuple, dataclass
from pathlib import Path
from typing import Any

# T8 in docs/spec/08 §4: a command may not be older than the motion watchdog window.
MAX_FRESHNESS_TTL_MS = 400
CALIBRATION_KEYS = ("left_forward", "left_reverse", "right_forward", "right_reverse")
# User-accessible BCM GPIO on the Pi 4B header.
VALID_BCM = range(2, 28)


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class Connection:
    worker_url: str
    car_id: str
    device_token: str
    max_queue: int


@dataclass(frozen=True)
class Pins:
    ena: int
    in1: int
    in2: int
    in3: int
    in4: int
    enb: int


@dataclass(frozen=True)
class Wheels:
    left_inverted: bool
    right_inverted: bool


@dataclass(frozen=True)
class Calibration:
    min_start_duty: float | None
    min_run_duty: float | None
    max_duty: float | None


@dataclass(frozen=True)
class Drive:
    pwm_frequency_hz: float
    direction_change_pause_ms: int | None
    deadband: float | None
    limit: float | None
    calibration: dict[str, Calibration]


@dataclass(frozen=True)
class Timing:
    token_interval_ms: int
    freshness_ttl_ms: int | None
    rtt_warning_ms: int | None
    motion_watchdog_ms: int
    control_loop_period_ms: int
    telemetry_period_ms: int


@dataclass(frozen=True)
class Config:
    connection: Connection
    pins: Pins
    wheels: Wheels
    drive: Drive
    timing: Timing


class _Table:
    """Typed reads from one TOML table; ``done()`` rejects keys nobody read."""

    def __init__(self, data: Any, path: str) -> None:
        if not isinstance(data, dict):
            raise ConfigError(f"[{path}] must be a table")
        self._data: dict[str, Any] = data
        self._path = path
        self._seen: set[str] = set()

    def _err(self, key: str, message: str) -> ConfigError:
        return ConfigError(f"{self._path}.{key} {message}")

    def _raw(self, key: str) -> Any:
        self._seen.add(key)
        return self._data.get(key)

    def _required(self, key: str) -> Any:
        value = self._raw(key)
        if value is None:
            raise self._err(key, "is required")
        return value

    def table(self, key: str) -> _Table:
        return _Table(self._required(key), f"{self._path}.{key}")

    def string(self, key: str) -> str:
        value = self._required(key)
        if not isinstance(value, str):
            raise self._err(key, "must be a string")
        return value

    def boolean(self, key: str) -> bool:
        value = self._required(key)
        if not isinstance(value, bool):
            raise self._err(key, "must be true or false")
        return value

    def integer(self, key: str, minimum: int) -> int:
        return self._check_int(key, self._required(key), minimum)

    def opt_integer(self, key: str, minimum: int) -> int | None:
        value = self._raw(key)
        return None if value is None else self._check_int(key, value, minimum)

    def number(self, key: str) -> float:
        return self._check_number(key, self._required(key))

    def opt_fraction(self, key: str) -> float | None:
        value = self._raw(key)
        if value is None:
            return None
        number = self._check_number(key, value)
        if not 0.0 <= number <= 1.0:
            raise self._err(key, "must be within 0..1")
        return number

    def _check_int(self, key: str, value: Any, minimum: int) -> int:
        if isinstance(value, bool) or not isinstance(value, int):
            raise self._err(key, "must be an integer")
        if value < minimum:
            raise self._err(key, f"must be >= {minimum}")
        return int(value)

    def _check_number(self, key: str, value: Any) -> float:
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise self._err(key, "must be a number")
        if not math.isfinite(value):
            raise self._err(key, "must be finite")
        return float(value)

    def done(self) -> None:
        unknown = sorted(set(self._data) - self._seen)
        if unknown:
            raise ConfigError(f"[{self._path}] unknown keys: {', '.join(unknown)}")


def _connection(t: _Table) -> Connection:
    conn = Connection(
        worker_url=t.string("worker_url"),
        car_id=t.string("car_id"),
        device_token=t.string("device_token"),
        max_queue=t.integer("max_queue", minimum=1),
    )
    t.done()
    if not conn.worker_url.startswith("wss://"):
        raise ConfigError("connection.worker_url must use wss://")
    if not conn.car_id:
        raise ConfigError("connection.car_id must not be empty")
    return conn


def _pins(t: _Table) -> Pins:
    pins = Pins(
        ena=t.integer("ena", minimum=0),
        in1=t.integer("in1", minimum=0),
        in2=t.integer("in2", minimum=0),
        in3=t.integer("in3", minimum=0),
        in4=t.integer("in4", minimum=0),
        enb=t.integer("enb", minimum=0),
    )
    t.done()
    values = astuple(pins)
    bad = [v for v in values if v not in VALID_BCM]
    if bad:
        raise ConfigError(f"pins: not a header BCM GPIO: {bad}")
    if len(set(values)) != len(values):
        raise ConfigError("pins: each pin must be different")
    return pins


def _wheels(t: _Table) -> Wheels:
    wheels = Wheels(
        left_inverted=t.boolean("left_inverted"),
        right_inverted=t.boolean("right_inverted"),
    )
    t.done()
    return wheels


def _calibration(t: _Table) -> dict[str, Calibration]:
    calibration = {}
    for key in CALIBRATION_KEYS:
        c = t.table(key)
        calibration[key] = Calibration(
            min_start_duty=c.opt_fraction("min_start_duty"),
            min_run_duty=c.opt_fraction("min_run_duty"),
            max_duty=c.opt_fraction("max_duty"),
        )
        c.done()
    t.done()
    return calibration


def _drive(t: _Table) -> Drive:
    drive = Drive(
        pwm_frequency_hz=t.number("pwm_frequency_hz"),
        direction_change_pause_ms=t.opt_integer("direction_change_pause_ms", minimum=0),
        deadband=t.opt_fraction("deadband"),
        limit=t.opt_fraction("limit"),
        calibration=_calibration(t.table("calibration")),
    )
    t.done()
    if drive.pwm_frequency_hz <= 0:
        raise ConfigError("drive.pwm_frequency_hz must be > 0")
    if drive.deadband is not None and drive.deadband >= 1.0:
        raise ConfigError("drive.deadband must be < 1")
    return drive


def _timing(t: _Table) -> Timing:
    timing = Timing(
        token_interval_ms=t.integer("token_interval_ms", minimum=1),
        freshness_ttl_ms=t.opt_integer("freshness_ttl_ms", minimum=1),
        rtt_warning_ms=t.opt_integer("rtt_warning_ms", minimum=1),
        motion_watchdog_ms=t.integer("motion_watchdog_ms", minimum=1),
        control_loop_period_ms=t.integer("control_loop_period_ms", minimum=1),
        telemetry_period_ms=t.integer("telemetry_period_ms", minimum=1),
    )
    t.done()
    ttl = timing.freshness_ttl_ms
    if ttl is not None:
        if ttl > MAX_FRESHNESS_TTL_MS:
            raise ConfigError(f"timing.freshness_ttl_ms must be <= {MAX_FRESHNESS_TTL_MS}")
        if ttl <= timing.token_interval_ms:
            raise ConfigError("timing.freshness_ttl_ms must be > token_interval_ms")
        budget = ttl - timing.token_interval_ms
        if timing.rtt_warning_ms is not None and timing.rtt_warning_ms >= budget:
            raise ConfigError(
                "timing.rtt_warning_ms must be < freshness_ttl_ms - token_interval_ms"
            )
    return timing


def parse_config(data: dict[str, Any]) -> Config:
    root = _Table(data, "config")
    config = Config(
        connection=_connection(root.table("connection")),
        pins=_pins(root.table("pins")),
        wheels=_wheels(root.table("wheels")),
        drive=_drive(root.table("drive")),
        timing=_timing(root.table("timing")),
    )
    root.done()
    return config


def load_config(path: Path) -> Config:
    try:
        with path.open("rb") as f:
            data = tomllib.load(f)
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f"{path}: {e}") from e
    return parse_config(data)
