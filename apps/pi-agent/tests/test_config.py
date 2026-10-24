import copy
import json
import tomllib
from pathlib import Path
from typing import Any

import pytest

from rc_agent.config import (
    Calibration,
    Calibrations,
    ConfigError,
    Pins,
    load_config,
    parse_config,
    parse_pins,
    read_toml,
)

APP_DIR = Path(__file__).resolve().parents[1]
EXAMPLE = APP_DIR / "config.example.toml"
WIRING_MAP = APP_DIR.parents[1] / "docs" / "diagrams" / "pi4b-l298n-connections.json"


@pytest.fixture
def data() -> dict[str, Any]:
    with EXAMPLE.open("rb") as f:
        return tomllib.load(f)


def test_example_config_loads() -> None:
    config = load_config(EXAMPLE)
    assert config.connection.max_queue == 16
    assert config.wheels.left_inverted is False
    assert config.wheels.right_inverted is False
    assert config.drive.pwm_frequency_hz == 100
    assert config.timing.token_interval_ms == 50
    assert config.timing.motion_watchdog_ms == 400


def test_example_leaves_unmeasured_values_empty() -> None:
    config = load_config(EXAMPLE)
    assert config.timing.freshness_ttl_ms is None
    assert config.timing.rtt_warning_ms is None
    assert config.drive.deadband is None
    assert config.drive.limit is None
    assert config.drive.direction_change_pause_ms is None
    for cal in vars(config.drive.calibration).values():
        assert (cal.min_start_duty, cal.min_run_duty, cal.max_duty) == (None, None, None)


def test_example_pins_match_wiring_map() -> None:
    wiring = json.loads(WIRING_MAP.read_text())
    expected = {
        c["terminal"].lower(): c["bcm"] for c in wiring["connections"] if c["bcm"] is not None
    }
    pins = load_config(EXAMPLE).pins
    assert vars(pins) == expected


def test_measured_values_load(data: dict[str, Any]) -> None:
    data["drive"].update(deadband=0.05, limit=0.8, direction_change_pause_ms=100)
    data["drive"]["calibration"]["left_forward"].update(min_start_duty=0.55, max_duty=1)
    data["timing"].update(freshness_ttl_ms=300, rtt_warning_ms=180)
    config = parse_config(data)
    assert config.drive.calibration.left_forward.min_start_duty == 0.55
    assert config.drive.calibration.left_forward.max_duty == 1.0
    assert config.timing.freshness_ttl_ms == 300


def _with(data: dict[str, Any], section: str, **values: Any) -> dict[str, Any]:
    changed = copy.deepcopy(data)
    target = changed
    for part in section.split("."):
        target = target[part]
    target.update(values)
    return changed


@pytest.mark.parametrize(
    ("section", "values", "message"),
    [
        ("pins", {"enb": 12}, "different"),
        ("pins", {"ena": 40}, "BCM"),
        ("pins", {"ena": "12"}, "integer"),
        ("pins", {"ena": True}, "integer"),
        ("pins", {"en_a": 12}, "unknown keys"),
        ("wheels", {"left_inverted": 0}, "true or false"),
        ("connection", {"worker_url": "ws://insecure"}, "wss://"),
        ("connection", {"car_id": ""}, "car_id"),
        ("connection", {"max_queue": 0}, ">= 1"),
        ("drive", {"pwm_frequency_hz": 0}, "> 0"),
        ("drive", {"pwm_frequency_hz": float("inf")}, "finite"),
        ("drive", {"deadband": 1.0}, "< 1"),
        ("drive", {"limit": 1.2}, "0..1"),
        ("drive.calibration.right_reverse", {"max_duty": -0.1}, "0..1"),
        ("drive.calibration.right_reverse", {"max": 1.0}, "unknown keys"),
        ("drive.calibration", {"middle_forward": {}}, "unknown keys: middle_forward"),
        ("timing", {"motion_watchdog_ms": 401}, "<= 400"),
        ("timing", {"motion_watchdog_ms": 300, "freshness_ttl_ms": 301}, "<= motion_watchdog_ms"),
        ("timing", {"motion_watchdog_ms": 100, "freshness_ttl_ms": 400}, "<= motion_watchdog_ms"),
        ("timing", {"freshness_ttl_ms": 50}, "> token_interval_ms"),
        ("timing", {"freshness_ttl_ms": 300, "rtt_warning_ms": 250}, "rtt_warning_ms"),
    ],
)
def test_rejects_invalid_values(
    data: dict[str, Any], section: str, values: dict[str, Any], message: str
) -> None:
    with pytest.raises(ConfigError, match=message):
        parse_config(_with(data, section, **values))


@pytest.mark.parametrize("section", ["connection", "pins", "wheels", "drive", "timing"])
def test_rejects_missing_section(data: dict[str, Any], section: str) -> None:
    del data[section]
    with pytest.raises(ConfigError, match=f"{section} is required"):
        parse_config(data)


def test_rejects_missing_calibration_row(data: dict[str, Any]) -> None:
    del data["drive"]["calibration"]["left_reverse"]
    with pytest.raises(ConfigError, match="left_reverse is required"):
        parse_config(data)


def test_rejects_unknown_section(data: dict[str, Any]) -> None:
    data["pin"] = {}
    with pytest.raises(ConfigError, match="unknown keys: pin"):
        parse_config(data)


def test_rejects_invalid_toml(tmp_path: Path) -> None:
    bad = tmp_path / "config.toml"
    bad.write_text("[pins\n")
    with pytest.raises(ConfigError, match=r"config\.toml"):
        load_config(bad)


def test_rejects_file_that_is_not_utf8(tmp_path: Path) -> None:
    bad = tmp_path / "config.toml"
    bad.write_bytes(b"\xff\xfe[pins]\n")
    with pytest.raises(ConfigError, match=r"config\.toml"):
        load_config(bad)


# Timing profile: the motion watchdog window is at most 400 ms (05 §3, 08 §4 T1) and the
# freshness TTL fits inside it (02 §8, 08 §4 T8). The refused values are in the table above.


@pytest.mark.parametrize("watchdog", [1, 399, 400])
def test_accepts_watchdog_window_up_to_400_ms(data: dict[str, Any], watchdog: int) -> None:
    config = parse_config(_with(data, "timing", motion_watchdog_ms=watchdog))
    assert config.timing.motion_watchdog_ms == watchdog


@pytest.mark.parametrize(("watchdog", "ttl"), [(300, 300), (400, 400), (300, 299)])
def test_accepts_freshness_ttl_up_to_the_watchdog_window(
    data: dict[str, Any], watchdog: int, ttl: int
) -> None:
    config = parse_config(_with(data, "timing", motion_watchdog_ms=watchdog, freshness_ttl_ms=ttl))
    assert config.timing.freshness_ttl_ms == ttl


# The device token is a secret (01 §5): it must not leak through a repr or an error message.

SECRET = "s3cr3t-device-token-value"


def test_device_token_is_not_shown_in_repr(data: dict[str, Any]) -> None:
    config = parse_config(_with(data, "connection", device_token=SECRET))
    assert config.connection.device_token == SECRET
    for shown in (repr(config), str(config), repr(config.connection), str(config.connection)):
        assert SECRET not in shown


def test_device_token_is_not_shown_in_a_config_error(data: dict[str, Any]) -> None:
    broken = _with(_with(data, "connection", device_token=SECRET), "timing", motion_watchdog_ms="x")
    with pytest.raises(ConfigError) as excinfo:
        parse_config(broken)
    assert SECRET not in str(excinfo.value)


def test_calibration_rows_are_named_fields() -> None:
    calibration = load_config(EXAMPLE).drive.calibration
    assert isinstance(calibration, Calibrations)
    for row in ("left_forward", "left_reverse", "right_forward", "right_reverse"):
        assert isinstance(getattr(calibration, row), Calibration)


# The GPIO helper reads [pins] on its own, so a mistake elsewhere does not change the pins it
# switches off (06 §2).


def test_parse_pins_ignores_errors_in_other_tables(data: dict[str, Any]) -> None:
    broken = _with(data, "timing", motion_watchdog_ms="x")
    with pytest.raises(ConfigError):
        parse_config(broken)
    assert parse_pins(broken) == Pins(ena=12, in1=17, in2=27, in3=22, in4=23, enb=13)


@pytest.mark.parametrize(
    ("values", "message"),
    [({"ena": 40}, "BCM"), ({"enb": 12}, "different"), ({"en_a": 12}, "unknown keys")],
    ids=["out-of-range", "duplicate", "unknown-key"],
)
def test_parse_pins_keeps_the_pin_checks(
    data: dict[str, Any], values: dict[str, Any], message: str
) -> None:
    with pytest.raises(ConfigError, match=message):
        parse_pins(_with(data, "pins", **values))


def test_parse_pins_requires_the_pins_table(data: dict[str, Any]) -> None:
    del data["pins"]
    with pytest.raises(ConfigError, match="pins is required"):
        parse_pins(data)


def test_read_toml_turns_a_syntax_error_into_config_error(tmp_path: Path) -> None:
    bad = tmp_path / "config.toml"
    bad.write_text("[pins\n")
    with pytest.raises(ConfigError, match=r"config\.toml"):
        read_toml(bad)
