"""Local diagnostics (docs/spec/07 §6) on mock pins with an injected sleep and GPIO runner.

Trial P01 on raised wheels needs the car; these tests stand in for everything around it.
"""

from __future__ import annotations

import math
import os
import signal
import subprocess
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from gpiozero import DigitalOutputDevice
from gpiozero.pins.mock import MockFactory

from rc_agent.config import Pins, Wheels
from rc_agent.diagnostics import (
    MAX_TRIAL_S,
    SAFE_MAX_DUTY,
    TRIAL_PAUSE_S,
    Args,
    Trial,
    all_trials,
    main,
    parse_args,
    run,
    run_trial,
)
from rc_agent.l298n import Bridge

PINS = Pins(ena=12, in1=17, in2=27, in3=22, in4=23, enb=13)
STRAIGHT = Wheels(left_inverted=False, right_inverted=False)
CONFIG = Path(__file__).parent.parent / "config.example.toml"

# What a trial looks like on the pins: (ENA, IN1, IN2, ENB, IN3, IN4); 07 §2 for "forward".
EXPECTED = {
    ("A", "forward"): (0.5, 1, 0, 0.0, None, None),
    ("A", "reverse"): (0.5, 0, 1, 0.0, None, None),
    ("B", "forward"): (0.0, None, None, 0.5, 1, 0),
    ("B", "reverse"): (0.0, None, None, 0.5, 0, 1),
    ("AB", "forward"): (0.5, 1, 0, 0.5, 1, 0),
    ("AB", "reverse"): (0.5, 0, 1, 0.5, 0, 1),
}


@pytest.fixture(autouse=True)
def signal_handlers_restored() -> Iterator[None]:
    """Every test in this file must leave the signal handlers as it found them.

    Checked per test because a leak would otherwise become the "before" of the next one.
    """
    watched = (signal.SIGTERM, signal.SIGHUP, signal.SIGINT)
    before = {s: signal.getsignal(s) for s in watched}
    yield
    after = {s: signal.getsignal(s) for s in watched}
    for s, handler in before.items():
        signal.signal(s, handler)
    assert after == before, "signal handlers leaked out of the test"


class SpyBridge(Bridge):
    """Records the calls made by the code under test; calls Bridge makes to itself are not."""

    def __init__(self, *args: Any) -> None:
        self.calls: list[str] = []
        self._inside = False
        super().__init__(*args)

    def _record(self, name: str) -> bool:
        if self._inside:
            return False
        self.calls.append(name)
        self._inside = True
        return True

    def drive(self, left: float, right: float) -> None:
        outer = self._record("drive")
        try:
            super().drive(left, right)
        finally:
            self._inside = not outer and self._inside

    def stop(self) -> None:
        outer = self._record("stop")
        try:
            super().stop()
        finally:
            self._inside = not outer and self._inside

    def close(self) -> None:
        outer = self._record("close")
        try:
            super().close()
        finally:
            self._inside = not outer and self._inside


class FakeRunner:
    """Records each call together with what the enable pins looked like at that moment."""

    def __init__(self, factory: MockFactory, returncode: int = 0) -> None:
        self.factory = factory
        self.returncode = returncode
        self.calls: list[tuple[list[str], tuple[str, str]]] = []

    def __call__(self, cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        functions = (self.factory.pin(PINS.ena).function, self.factory.pin(PINS.enb).function)
        self.calls.append((list(cmd), functions))
        return subprocess.CompletedProcess(cmd, self.returncode, "", "pinctrl: boom")


def snapshot(factory: MockFactory, pins: Pins = PINS) -> tuple[float, int, int, float, int, int]:
    s = [float(factory.pin(n).state) for n in (pins.ena, pins.in1, pins.in2)]
    s += [float(factory.pin(n).state) for n in (pins.enb, pins.in3, pins.in4)]
    return s[0], int(s[1]), int(s[2]), s[3], int(s[4]), int(s[5])


def matches(actual: tuple[float, ...], expected: tuple[float | None, ...]) -> bool:
    for wheel in (0, 3):
        if actual[wheel] != pytest.approx(expected[wheel]):
            return False
        if (
            expected[wheel + 1] is not None
            and actual[wheel + 1 : wheel + 3] != expected[wheel + 1 : wheel + 3]
        ):
            return False
    return True


def args(trials: tuple[Trial, ...]) -> Args:
    return Args(config=CONFIG, trials=trials)


def run_bridge(parsed: Args, bridge: Bridge, runner: Any, sleep: Callable[[float], None]) -> int:
    """run() with an already opened bridge."""
    return run(parsed, bridge.pins, lambda: bridge, runner, sleep)


# --- Trial values ---------------------------------------------------------------------------


@pytest.mark.parametrize("duration", [0.0, -1.0, MAX_TRIAL_S + 0.01, math.nan, math.inf])
def test_trial_rejects_duration_outside_limit(duration: float) -> None:
    with pytest.raises(ValueError):
        Trial(channel="A", direction="forward", duty=0.5, duration_s=duration)


@pytest.mark.parametrize("duty", [-0.1, 1.01, math.nan, math.inf])
def test_trial_rejects_duty_outside_unit_range(duty: float) -> None:
    with pytest.raises(ValueError):
        Trial(channel="A", direction="forward", duty=duty, duration_s=1.0)


def test_trial_accepts_limit_values() -> None:
    Trial(channel="AB", direction="reverse", duty=1.0, duration_s=MAX_TRIAL_S)


def test_all_trials_cover_each_channel_in_both_directions() -> None:
    trials = all_trials(0.5, 1.0)
    assert len(trials) == 6
    assert {(t.channel, t.direction) for t in trials} == set(EXPECTED)
    assert all(t.duty == 0.5 and t.duration_s == 1.0 for t in trials)


# --- CLI arguments: refused before any Bridge exists ----------------------------------------


@pytest.mark.parametrize(
    "argv",
    [
        ["--duty", "0.5", "--all"],  # no --config
        ["--config", str(CONFIG), "--all"],  # no --duty
        ["--config", str(CONFIG), "--duty", "0.5"],  # neither --all nor a channel
        ["--config", str(CONFIG), "--duty", "0.5", "--channel", "A"],  # no direction
        [*["--config", str(CONFIG), "--duty", "0.5", "--all"], "--channel", "A"],
        ["--config", str(CONFIG), "--duty", "0.5", "--channel", "C", "--direction", "forward"],
        ["--config", str(CONFIG), "--duty", "0.5", "--all", "--duration", str(MAX_TRIAL_S + 1)],
        ["--config", str(CONFIG), "--duty", "nan", "--all"],
        ["--config", str(CONFIG), "--duty", "1.5", "--all", "--power-checked"],
    ],
    ids=[
        "no-config",
        "no-duty",
        "no-selection",
        "no-direction",
        "all-and-channel",
        "bad-channel",
        "too-long",
        "nan-duty",
        "duty-above-1",
    ],
)
def test_parse_args_refuses_bad_arguments(argv: list[str], mock_gpio: MockFactory) -> None:
    with pytest.raises(SystemExit) as excinfo:
        parse_args(argv)
    assert excinfo.value.code == 2
    for n in (12, 13):
        assert mock_gpio.pin(n).function == "input"


def test_full_duty_requires_power_checked() -> None:
    """07 §6: duty up to 1.0 only after the supply was checked."""
    over = str(min(1.0, SAFE_MAX_DUTY + 0.05))
    with pytest.raises(SystemExit) as excinfo:
        parse_args(["--config", str(CONFIG), "--duty", over, "--all"])
    assert excinfo.value.code == 2
    parsed = parse_args(["--config", str(CONFIG), "--duty", over, "--all", "--power-checked"])
    assert all(t.duty == float(over) for t in parsed.trials)


def test_parse_args_single_trial_and_default_duration() -> None:
    parsed = parse_args(
        ["--config", str(CONFIG), "--duty", "0.4", "--channel", "B", "--direction", "reverse"]
    )
    assert parsed.config == CONFIG
    assert [(t.channel, t.direction, t.duty, t.duration_s) for t in parsed.trials] == [
        ("B", "reverse", 0.4, 1.0)
    ]


def test_parse_args_all_is_the_six_trials() -> None:
    parsed = parse_args(["--config", str(CONFIG), "--duty", "0.3", "--all", "--duration", "0.5"])
    assert parsed.trials == all_trials(0.3, 0.5)


# --- Running trials --------------------------------------------------------------------------


@pytest.mark.parametrize(("channel", "direction"), list(EXPECTED))
def test_run_trial_drives_only_its_channel_then_stops(
    mock_gpio: MockFactory, channel: Any, direction: Any
) -> None:
    seen: list[tuple[float, ...]] = []
    slept: list[float] = []

    def sleep(s: float) -> None:
        slept.append(s)
        seen.append(snapshot(mock_gpio))

    with Bridge(PINS, STRAIGHT, 100) as bridge:
        run_trial(bridge, Trial(channel, direction, 0.5, 0.7), sleep)
        assert slept == [0.7]
        assert matches(seen[0], EXPECTED[(channel, direction)]), seen[0]
        assert snapshot(mock_gpio)[0] == 0
        assert snapshot(mock_gpio)[3] == 0


def test_run_trial_stops_when_interrupted(mock_gpio: MockFactory) -> None:
    def sleep(_: float) -> None:
        raise KeyboardInterrupt

    with Bridge(PINS, STRAIGHT, 100) as bridge:
        with pytest.raises(KeyboardInterrupt):
            run_trial(bridge, Trial("AB", "forward", 0.6, 1.0), sleep)
        assert snapshot(mock_gpio)[0] == 0
        assert snapshot(mock_gpio)[3] == 0


def test_run_executes_every_trial_with_stop_between(mock_gpio: MockFactory) -> None:
    seen: list[tuple[float, ...]] = []
    bridge = SpyBridge(PINS, STRAIGHT, 100)
    runner = FakeRunner(mock_gpio)
    trials = all_trials(0.5, 0.2)

    sleeps: list[float] = []

    def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        if len(sleeps) % 2:  # trial, pause, trial, pause, ...
            seen.append(snapshot(mock_gpio))

    code = run_bridge(args(trials), bridge, runner, sleep)

    assert code == 0
    assert sleeps[1::2] == [TRIAL_PAUSE_S] * 5
    assert len(seen) == 6
    for trial, pins in zip(trials, seen, strict=True):
        assert matches(pins, EXPECTED[(trial.channel, trial.direction)]), (trial, pins)
    # Each drive is followed by its own stop; the bridge is closed once at the end.
    assert bridge.calls == ["drive", "stop"] * 6 + ["close"]


def test_run_releases_pins_then_runs_helper(mock_gpio: MockFactory) -> None:
    bridge = Bridge(PINS, STRAIGHT, 100)
    runner = FakeRunner(mock_gpio)
    assert run_bridge(args(all_trials(0.5, 0.1)), bridge, runner, lambda _: None) == 0
    assert len(runner.calls) == 1
    cmd, functions = runner.calls[0]
    assert cmd[:3] == ["pinctrl", "set", "12,13"]
    # close() first, pinctrl after: otherwise the release would undo the LOW outputs (07 §2).
    assert functions == ("input", "input")


def test_run_helper_gets_the_pins_it_was_given(mock_gpio: MockFactory) -> None:
    other = Pins(ena=18, in1=5, in2=6, in3=24, in4=25, enb=19)
    bridge = Bridge(other, STRAIGHT, 100)
    calls: list[list[str]] = []

    def runner(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, "", "")

    assert run_bridge(args(all_trials(0.5, 0.1)), bridge, runner, lambda _: None) == 0
    assert calls and calls[0][:3] == ["pinctrl", "set", "18,19"]


def _interrupting(exc: BaseException | None = None, signum: int | None = None) -> Any:
    def sleep(_: float) -> None:
        if signum is not None:
            os.kill(os.getpid(), signum)
        if exc is not None:
            raise exc

    return sleep


@pytest.mark.parametrize(
    ("sleep", "expected"),
    [
        (_interrupting(exc=RuntimeError("motor stalled")), 1),
        (_interrupting(exc=KeyboardInterrupt()), 130),
        (_interrupting(signum=signal.SIGTERM), 128 + signal.SIGTERM),
        (_interrupting(signum=signal.SIGHUP), 128 + signal.SIGHUP),
    ],
    ids=["trial-error", "ctrl-c", "sigterm", "sighup-ssh-dropped"],
)
def test_run_cleans_up_on_every_interruption(
    mock_gpio: MockFactory, sleep: Any, expected: int
) -> None:
    before = {s: signal.getsignal(s) for s in (signal.SIGTERM, signal.SIGHUP)}
    bridge = SpyBridge(PINS, STRAIGHT, 100)
    runner = FakeRunner(mock_gpio)

    code = run_bridge(args(all_trials(0.5, 1.0)), bridge, runner, sleep)

    assert code == expected
    # Interrupted in the first trial: no further drive, stop, close, then the helper.
    assert bridge.calls == ["drive", "stop", "close"]
    assert [functions for _, functions in runner.calls] == [("input", "input")]
    # The handlers do not leak out of run().
    assert {s: signal.getsignal(s) for s in before} == before


def test_run_reports_both_reasons_when_helper_fails_after_error(
    mock_gpio: MockFactory, capsys: pytest.CaptureFixture[str]
) -> None:
    bridge = Bridge(PINS, STRAIGHT, 100)
    runner = FakeRunner(mock_gpio, returncode=1)

    code = run_bridge(
        args(all_trials(0.5, 1.0)), bridge, runner, _interrupting(RuntimeError("stalled"))
    )

    assert code != 0
    err = capsys.readouterr().err
    assert "stalled" in err
    assert "pinctrl" in err or "helper" in err.lower()


def test_run_fails_when_helper_fails_after_success(
    mock_gpio: MockFactory, capsys: pytest.CaptureFixture[str]
) -> None:
    bridge = Bridge(PINS, STRAIGHT, 100)
    runner = FakeRunner(mock_gpio, returncode=1)
    assert run_bridge(args(all_trials(0.5, 0.1)), bridge, runner, lambda _: None) != 0
    assert capsys.readouterr().err.strip()


def test_duty_at_safe_limit_needs_no_power_check() -> None:
    parsed = parse_args(["--config", str(CONFIG), "--duty", str(SAFE_MAX_DUTY), "--all"])
    assert all(t.duty == SAFE_MAX_DUTY for t in parsed.trials)


@pytest.mark.parametrize("signum", [signal.SIGTERM, signal.SIGHUP, signal.SIGINT])
def test_signal_during_cleanup_does_not_cut_it_short(mock_gpio: MockFactory, signum: int) -> None:
    """A second Ctrl-C or SIGTERM while the helper runs must not skip it or escape run()."""
    before = {s: signal.getsignal(s) for s in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT)}
    bridge = Bridge(PINS, STRAIGHT, 100)
    calls: list[list[str]] = []

    def runner(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        os.kill(os.getpid(), signum)
        calls.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, "", "")

    assert run_bridge(args(all_trials(0.5, 0.1)), bridge, runner, lambda _: None) == 0
    assert len(calls) == 1
    assert {s: signal.getsignal(s) for s in before} == before


# --- main: config and bridge set-up ----------------------------------------------------------


# The handlers are on before the bridge is opened: a signal or an error while the pins are
# being claimed still ends with the helper (07 §6, 06 §2).


def _sigterm_while_opening() -> Bridge:
    if signal.getsignal(signal.SIGTERM) in (signal.SIG_DFL, signal.SIG_IGN, None):
        # A real SIGTERM now would end pytest itself: fail the test instead.
        raise RuntimeError("SIGTERM handler not installed before open_bridge")
    os.kill(os.getpid(), signal.SIGTERM)
    raise AssertionError("the SIGTERM handler did not interrupt open_bridge")


def _ctrl_c_while_opening() -> Bridge:
    raise KeyboardInterrupt


def _pin_busy_while_opening() -> Bridge:
    raise RuntimeError("pin in use")


@pytest.mark.parametrize(
    ("open_bridge", "expected"),
    [
        (_sigterm_while_opening, 128 + signal.SIGTERM),
        (_ctrl_c_while_opening, 130),
        (_pin_busy_while_opening, 1),
    ],
    ids=["sigterm", "ctrl-c", "pin-busy"],
)
def test_run_interrupted_while_opening_the_bridge_still_runs_helper(
    mock_gpio: MockFactory, open_bridge: Callable[[], Bridge], expected: int
) -> None:
    runner = FakeRunner(mock_gpio)
    assert run(args(all_trials(0.5, 1.0)), PINS, open_bridge, runner, lambda _: None) == expected
    assert [cmd[:3] for cmd, _ in runner.calls] == [["pinctrl", "set", "12,13"]]


def test_run_reports_a_failed_bridge_setup_as_such(
    mock_gpio: MockFactory, capsys: pytest.CaptureFixture[str]
) -> None:
    runner = FakeRunner(mock_gpio)
    assert run(args(all_trials(0.5, 1.0)), PINS, _pin_busy_while_opening, runner) == 1
    err = capsys.readouterr().err
    assert "cannot set up the bridge: pin in use" in err
    assert "trial failed" not in err


def test_helper_failure_wins_over_interrupted_bridge_setup(mock_gpio: MockFactory) -> None:
    runner = FakeRunner(mock_gpio, returncode=1)
    assert run(args(all_trials(0.5, 1.0)), PINS, _ctrl_c_while_opening, runner) == 1
    assert len(runner.calls) == 1


# Between two trials the bridge stays stopped for TRIAL_PAUSE_S, so a wheel coasts before it
# is reversed; there is no pause after the last trial (07 §6).


def test_run_pauses_between_trials_with_both_enables_off(mock_gpio: MockFactory) -> None:
    enables_in_pause: list[tuple[float, float]] = []

    def sleep(seconds: float) -> None:
        if seconds == TRIAL_PAUSE_S:
            enables_in_pause.append(snapshot(mock_gpio)[::3])

    bridge = Bridge(PINS, STRAIGHT, 100)
    assert run_bridge(args(all_trials(0.5, 0.2)), bridge, FakeRunner(mock_gpio), sleep) == 0
    assert enables_in_pause == [(0.0, 0.0)] * 5


def test_run_single_trial_has_no_pause(mock_gpio: MockFactory) -> None:
    sleeps: list[float] = []
    trial = (Trial("A", "forward", 0.5, 0.2),)
    bridge = Bridge(PINS, STRAIGHT, 100)
    assert run_bridge(args(trial), bridge, FakeRunner(mock_gpio), sleeps.append) == 0
    assert sleeps == [0.2]


def test_run_interrupted_during_the_pause_cleans_up(mock_gpio: MockFactory) -> None:
    def sleep(seconds: float) -> None:
        if seconds == TRIAL_PAUSE_S:
            raise KeyboardInterrupt

    bridge = SpyBridge(PINS, STRAIGHT, 100)
    runner = FakeRunner(mock_gpio)
    assert run_bridge(args(all_trials(0.5, 0.2)), bridge, runner, sleep) == 130
    assert bridge.calls == ["drive", "stop", "close"]
    assert [functions for _, functions in runner.calls] == [("input", "input")]


def _config(tmp_path: Path, **pins: int) -> Path:
    text = CONFIG.read_text()
    for name, value in pins.items():
        default = {"ena": 12, "in1": 17, "in2": 27, "in3": 22, "in4": 23, "enb": 13}[name]
        text = text.replace(f"{name} = {default}\n", f"{name} = {value}\n")
    path = tmp_path / "config.toml"
    path.write_text(text)
    return path


def _recording_runner(calls: list[list[str]]) -> Any:
    def runner(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, "", "")

    return runner


ONE_SHORT_TRIAL = [
    "--duty",
    "0.5",
    "--channel",
    "A",
    "--direction",
    "forward",
    "--duration",
    "0.01",
]


@pytest.mark.parametrize(
    "content", [b"not toml [", b"\xff\xfe[pins]\n", None], ids=["syntax", "not-utf8", "missing"]
)
def test_main_refuses_unreadable_config_before_touching_pins(
    tmp_path: Path,
    mock_gpio: MockFactory,
    capsys: pytest.CaptureFixture[str],
    content: bytes | None,
) -> None:
    path = tmp_path / "config.toml"
    if content is not None:
        path.write_bytes(content)
    calls: list[list[str]] = []
    assert main(["--config", str(path), *ONE_SHORT_TRIAL], _recording_runner(calls)) == 2
    assert calls == []
    for n in (12, 13, 17, 27, 22, 23):
        assert mock_gpio.pin(n).function == "input", n
    assert capsys.readouterr().err.strip()


def test_main_runs_with_pins_and_wheels_from_config(tmp_path: Path, mock_gpio: MockFactory) -> None:
    path = _config(tmp_path, ena=18, in1=5, in2=6, in3=24, in4=25, enb=19)
    calls: list[list[str]] = []
    assert main(["--config", str(path), *ONE_SHORT_TRIAL], _recording_runner(calls)) == 0
    assert [c[:3] for c in calls] == [["pinctrl", "set", "18,19"]]
    for n in (18, 5, 6, 24, 25, 19):
        assert mock_gpio.pin(n).function == "input", f"{n} not released"
    # The default wiring was never claimed: the bridge really came from the config.
    for n in (12, 13, 17, 27, 22, 23):
        assert mock_gpio.pin(n).function == "input", n
        assert mock_gpio.pin(n).states[1:] == [], f"{n} was driven"
    # Channel A forward on the configured pins: IN1 (GPIO5) went high, ENA (GPIO18) pulsed.
    assert any(s.state for s in mock_gpio.pin(5).states)
    assert any(s.state > 0 for s in mock_gpio.pin(18).states)


def test_main_bridge_failure_releases_pins_and_runs_helper(
    tmp_path: Path, mock_gpio: MockFactory, capsys: pytest.CaptureFixture[str]
) -> None:
    path = _config(tmp_path)
    calls: list[list[str]] = []
    # Another program holds IN2 (GPIO27), so the bridge fails half-way through its set-up.
    with DigitalOutputDevice(27):
        assert main(["--config", str(path), *ONE_SHORT_TRIAL], _recording_runner(calls)) == 1
        for n in (12, 13, 17):
            assert mock_gpio.pin(n).function == "input", f"{n} left claimed"
    assert [c[:3] for c in calls] == [["pinctrl", "set", "12,13"]]
    assert capsys.readouterr().err.strip()


def test_main_refused_arguments_exit_2_without_bridge(
    tmp_path: Path, mock_gpio: MockFactory
) -> None:
    calls: list[list[str]] = []
    with pytest.raises(SystemExit) as excinfo:
        main(
            ["--config", str(_config(tmp_path)), "--duty", "0.95", "--all"],
            _recording_runner(calls),
        )
    assert excinfo.value.code == 2
    assert calls == []
    for n in (12, 13):
        assert mock_gpio.pin(n).function == "input"


def test_helper_failure_wins_over_signal_code(mock_gpio: MockFactory) -> None:
    """The enables may be high after a failed helper, so the exit code says 1, not 143."""
    bridge = Bridge(PINS, STRAIGHT, 100)
    runner = FakeRunner(mock_gpio, returncode=1)
    assert (
        run_bridge(args(all_trials(0.5, 1.0)), bridge, runner, _interrupting(signum=signal.SIGTERM))
        == 1
    )


class _GoneTerminal:
    def write(self, _: str) -> int:
        raise OSError("terminal gone")

    def flush(self) -> None:
        raise OSError("terminal gone")


def test_cleanup_runs_when_the_terminal_is_gone(
    mock_gpio: MockFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """SIGHUP after a dropped SSH session: writing the reason fails, the helper still runs."""
    monkeypatch.setattr("sys.stderr", _GoneTerminal())
    bridge = Bridge(PINS, STRAIGHT, 100)
    runner = FakeRunner(mock_gpio)
    code = run_bridge(
        args(all_trials(0.5, 1.0)), bridge, runner, _interrupting(signum=signal.SIGHUP)
    )
    assert code == 128 + signal.SIGHUP
    assert [functions for _, functions in runner.calls] == [("input", "input")]
