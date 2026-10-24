import copy
import json
import tomllib
from pathlib import Path
from typing import Any

import pytest

from rc_agent.config import CALIBRATION_KEYS, ConfigError, load_config, parse_config

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
    assert set(config.drive.calibration) == set(CALIBRATION_KEYS)
    for cal in config.drive.calibration.values():
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
    assert config.drive.calibration["left_forward"].min_start_duty == 0.55
    assert config.drive.calibration["left_forward"].max_duty == 1.0
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
        ("timing", {"freshness_ttl_ms": 401}, "<= 400"),
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
