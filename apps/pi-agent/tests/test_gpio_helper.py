"""GPIO helper (docs/spec/06 §2) checked offline through an injected runner.

What the pins do after ``pinctrl`` runs, and the 500 ms bound on the Pi (T4), need hardware.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import pytest

from rc_agent.config import Pins
from rc_agent.gpio_helper import HelperError, disable_enables, enable_off_command, main

PINS = Pins(ena=12, in1=17, in2=27, in3=22, in4=23, enb=13)
EXAMPLE_CONFIG = Path(__file__).parent.parent / "config.example.toml"


class FakeRunner:
    def __init__(self, returncode: int = 0, raises: BaseException | None = None) -> None:
        self.returncode = returncode
        self.raises = raises
        self.calls: list[tuple[list[str], dict[str, Any]]] = []

    def __call__(self, cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        self.calls.append((list(cmd), kwargs))
        if self.raises is not None:
            raise self.raises
        return subprocess.CompletedProcess(cmd, self.returncode, "", "pinctrl: boom")


def test_command_sets_both_enables_as_low_outputs() -> None:
    assert enable_off_command(PINS) == ["pinctrl", "set", "12,13", "op", "dl"]


def test_command_takes_enable_pins_from_config() -> None:
    other = Pins(ena=18, in1=5, in2=6, in3=24, in4=25, enb=19)
    assert enable_off_command(other) == ["pinctrl", "set", "18,19", "op", "dl"]


def test_disable_enables_runs_command_within_t4() -> None:
    run = FakeRunner()
    disable_enables(PINS, run)
    assert len(run.calls) == 1
    cmd, kwargs = run.calls[0]
    assert cmd == enable_off_command(PINS)
    # T4 in 08 §4: the helper finishes within 500 ms.
    assert 0 < kwargs["timeout"] <= 0.5


@pytest.mark.parametrize(
    "run",
    [
        FakeRunner(returncode=1),
        FakeRunner(raises=FileNotFoundError("pinctrl")),
        FakeRunner(raises=subprocess.TimeoutExpired(["pinctrl"], 0.4)),
        FakeRunner(raises=PermissionError("pinctrl")),
    ],
    ids=["nonzero-exit", "missing-pinctrl", "timeout", "no-permission"],
)
def test_disable_enables_turns_every_failure_into_helper_error(run: FakeRunner) -> None:
    with pytest.raises(HelperError):
        disable_enables(PINS, run)


def test_main_with_valid_config_uses_its_pins(capsys: pytest.CaptureFixture[str]) -> None:
    run = FakeRunner()
    assert main(["--config", str(EXAMPLE_CONFIG)], run_cmd=run) == 0
    assert [c for c, _ in run.calls] == [["pinctrl", "set", "12,13", "op", "dl"]]


def test_main_without_config_uses_default_enable_pins() -> None:
    run = FakeRunner()
    assert main([], run_cmd=run) == 0
    assert [c for c, _ in run.calls] == [["pinctrl", "set", "12,13", "op", "dl"]]


@pytest.mark.parametrize(
    "content",
    ["not toml [", "[pins]\nena = 12\n", ""],
    ids=["syntax", "incomplete", "empty"],
)
def test_main_with_broken_config_still_disables_defaults_and_fails(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], content: str
) -> None:
    """Safety first: the pins go LOW anyway, but the service must not start on a bad config."""
    path = tmp_path / "config.toml"
    path.write_text(content)
    run = FakeRunner()
    assert main(["--config", str(path)], run_cmd=run) == 2
    assert [c for c, _ in run.calls] == [["pinctrl", "set", "12,13", "op", "dl"]]
    assert capsys.readouterr().err.strip()


def test_main_with_missing_config_file_still_disables_defaults_and_fails(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    run = FakeRunner()
    assert main(["--config", str(tmp_path / "missing.toml")], run_cmd=run) == 2
    assert [c for c, _ in run.calls] == [["pinctrl", "set", "12,13", "op", "dl"]]
    assert capsys.readouterr().err.strip()


@pytest.mark.parametrize(
    "run",
    [FakeRunner(returncode=1), FakeRunner(raises=subprocess.TimeoutExpired(["pinctrl"], 0.4))],
    ids=["nonzero-exit", "timeout"],
)
def test_main_reports_command_failure(run: FakeRunner, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--config", str(EXAMPLE_CONFIG)], run_cmd=run) == 1
    assert capsys.readouterr().err.strip()


def test_main_uses_enable_pins_from_a_valid_config(tmp_path: Path) -> None:
    text = EXAMPLE_CONFIG.read_text()
    text = text.replace("ena = 12", "ena = 18").replace("enb = 13", "enb = 19")
    path = tmp_path / "config.toml"
    path.write_text(text)
    run = FakeRunner()
    assert main(["--config", str(path)], run_cmd=run) == 0
    assert [c for c, _ in run.calls] == [["pinctrl", "set", "18,19", "op", "dl"]]


def test_main_with_non_utf8_config_still_disables_defaults_and_fails(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A corrupted file (bad sector, wrong file copied) must not stop the pins going LOW."""
    path = tmp_path / "config.toml"
    path.write_bytes(b"\xff\xfe[pins]\n")
    run = FakeRunner()
    assert main(["--config", str(path)], run_cmd=run) == 2
    assert [c for c, _ in run.calls] == [["pinctrl", "set", "12,13", "op", "dl"]]
    assert capsys.readouterr().err.strip()


def test_main_with_broken_config_and_failing_command_reports_both(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = tmp_path / "config.toml"
    path.write_text("not toml [")
    run = FakeRunner(returncode=1)
    # 1 wins over 2: the pins may not be LOW (06 §2).
    assert main(["--config", str(path)], run_cmd=run) == 1
    err = capsys.readouterr().err
    assert "config" in err
    assert "pinctrl" in err


def test_main_falls_back_on_any_config_failure(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Even an error nobody foresaw while reading the config must not stop the pins going LOW."""

    def unexpected(_: Path) -> None:
        raise RuntimeError("unforeseen")

    monkeypatch.setattr("rc_agent.gpio_helper.load_config", unexpected)
    run = FakeRunner()
    assert main(["--config", str(EXAMPLE_CONFIG)], run_cmd=run) == 2
    assert [c for c, _ in run.calls] == [["pinctrl", "set", "12,13", "op", "dl"]]
    assert "unforeseen" in capsys.readouterr().err
