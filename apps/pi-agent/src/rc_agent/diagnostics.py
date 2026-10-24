"""Local wheel trials without the panel or Cloudflare (docs/spec/07 §6).

``rc-diagnostics --config PATH --duty D --all`` runs channel A, channel B and both
together, forward and reverse, each trial for a short fixed time; ``--channel`` with
``--direction`` runs one. The duty goes to the bridge as given: no calibration, no ramp.

Every trial ends with the bridge stopped, and the run always ends with ``Bridge.close()``
followed by the GPIO helper (RC-04), in that order, also after an error, Ctrl-C, SIGTERM
or SIGHUP (a dropped SSH session). Exit codes: 0 done, 1 a trial or the helper failed,
2 refused arguments or config, 128 + n after signal n (130 for Ctrl-C). A failed helper
means the enables may be high, so it wins over a signal code: the exit code is 1.
"""

from __future__ import annotations

import argparse
import contextlib
import signal
import subprocess
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from types import FrameType
from typing import Literal

from rc_agent.config import ConfigError, load_config
from rc_agent.gpio_helper import HelperError, Runner, disable_enables
from rc_agent.l298n import Bridge

# Recorded in 07 §6.
MAX_TRIAL_S = 3.0
DEFAULT_TRIAL_S = 1.0
# Duty above this waits for --power-checked: the supply is verified first (07 §6).
SAFE_MAX_DUTY = 0.9

Channel = Literal["A", "B", "AB"]
Direction = Literal["forward", "reverse"]
CHANNELS: tuple[Channel, ...] = ("A", "B", "AB")
DIRECTIONS: tuple[Direction, ...] = ("forward", "reverse")
_SIGNALS = (signal.SIGTERM, signal.SIGHUP)
_Handler = Callable[[int, FrameType | None], object] | signal.Handlers | int | None


@dataclass(frozen=True)
class Trial:
    channel: Channel
    direction: Direction
    duty: float
    duration_s: float

    def __post_init__(self) -> None:
        if self.channel not in CHANNELS:
            raise ValueError(f"channel must be one of {', '.join(CHANNELS)}")
        if self.direction not in DIRECTIONS:
            raise ValueError(f"direction must be one of {', '.join(DIRECTIONS)}")
        if not 0.0 <= self.duty <= 1.0:
            raise ValueError(f"duty must be within 0..1, got {self.duty}")
        if not 0.0 < self.duration_s <= MAX_TRIAL_S:
            raise ValueError(f"duration must be within (0, {MAX_TRIAL_S}] s, got {self.duration_s}")


def all_trials(duty: float, duration_s: float) -> tuple[Trial, ...]:
    return tuple(Trial(c, d, duty, duration_s) for c in CHANNELS for d in DIRECTIONS)


@dataclass(frozen=True)
class Args:
    config: Path
    trials: tuple[Trial, ...]
    power_checked: bool


def parse_args(argv: list[str] | None = None) -> Args:
    parser = argparse.ArgumentParser(
        prog="rc-diagnostics", description="Run wheel trials on the bridge (docs/spec/07 §6)."
    )
    parser.add_argument("--config", type=Path, required=True, help="agent config (pins, wheels)")
    parser.add_argument("--duty", type=float, required=True, help="duty 0..1")
    parser.add_argument(
        "--duration",
        type=float,
        default=DEFAULT_TRIAL_S,
        help=f"seconds per trial, up to {MAX_TRIAL_S} (default {DEFAULT_TRIAL_S})",
    )
    parser.add_argument(
        "--power-checked",
        action="store_true",
        help=f"the supply was checked; allows duty above {SAFE_MAX_DUTY}",
    )
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--all", action="store_true", help="A, B and both, both directions")
    selection.add_argument("--channel", choices=CHANNELS, help="one trial; needs --direction")
    parser.add_argument("--direction", choices=DIRECTIONS)
    args = parser.parse_args(argv)

    if args.all and args.direction is not None:
        parser.error("--direction goes with --channel, not with --all")
    if not args.all and args.direction is None:
        parser.error("--channel needs --direction")
    if args.duty > SAFE_MAX_DUTY and not args.power_checked:
        parser.error(f"duty above {SAFE_MAX_DUTY} needs --power-checked (07 §6)")
    try:
        if args.all:
            trials = all_trials(args.duty, args.duration)
        else:
            trials = (Trial(args.channel, args.direction, args.duty, args.duration),)
    except ValueError as e:
        parser.error(str(e))
    return Args(config=args.config, trials=trials, power_checked=args.power_checked)


def run_trial(bridge: Bridge, trial: Trial, sleep: Callable[[float], None] = time.sleep) -> None:
    speed = trial.duty if trial.direction == "forward" else -trial.duty
    left = speed if trial.channel in ("A", "AB") else 0.0
    right = speed if trial.channel in ("B", "AB") else 0.0
    try:
        bridge.drive(left, right)
        sleep(trial.duration_s)
    finally:
        bridge.stop()


class _Terminated(Exception):
    def __init__(self, signum: int) -> None:
        super().__init__(f"terminated by signal {signum}")
        self.signum = signum


def _raise_terminated(signum: int, frame: FrameType | None) -> None:
    raise _Terminated(signum)


def _say(message: str) -> None:
    # After SIGHUP the terminal may be gone; losing a message must not skip the cleanup.
    with contextlib.suppress(OSError):
        print(message, file=sys.stderr)


def run(
    args: Args,
    bridge: Bridge,
    run_cmd: Runner = subprocess.run,
    sleep: Callable[[float], None] = time.sleep,
) -> int:
    pins = bridge.pins
    previous: dict[int, _Handler] = {}
    code = 0
    try:
        for s in _SIGNALS:
            previous[s] = signal.signal(s, _raise_terminated)
        for trial in args.trials:
            run_trial(bridge, trial, sleep)
    except KeyboardInterrupt:
        _say("interrupted")
        code = 128 + signal.SIGINT
    except _Terminated as e:
        _say(str(e))
        code = 128 + e.signum
    except Exception as e:
        _say(f"trial failed: {e}")
        code = 1
    finally:
        # Cleanup must not be cut short by a second signal; the handlers come back at the end.
        ignored = {s: signal.signal(s, signal.SIG_IGN) for s in (*_SIGNALS, signal.SIGINT)}
        try:
            bridge.close()
        except Exception as e:
            _say(f"closing the bridge failed: {e}")
            code = code or 1
        try:
            disable_enables(pins, run_cmd)
        except HelperError as e:
            _say(f"GPIO helper failed, the enables may be high: {e}")
            code = 1
        for s, handler in ignored.items():
            signal.signal(s, previous.get(s, handler))
    return code


def main(argv: list[str] | None = None, run_cmd: Runner = subprocess.run) -> int:
    args = parse_args(argv)
    try:
        config = load_config(args.config)
    except (ConfigError, OSError) as e:
        _say(f"cannot read config: {e}")
        return 2
    try:
        bridge = Bridge(config.pins, config.wheels, config.drive.pwm_frequency_hz)
    except Exception as e:
        # Pins claimed so far are already released, and releasing leaves them as inputs.
        _say(f"cannot set up the bridge: {e}")
        try:
            disable_enables(config.pins, run_cmd)
        except HelperError as helper_error:
            _say(f"GPIO helper failed, the enables may be high: {helper_error}")
        return 1
    return run(args, bridge, run_cmd)


if __name__ == "__main__":
    raise SystemExit(main())
