"""Drive ENA and ENB low as outputs, from outside the agent process (docs/spec/06 §2).

Run it before the agent starts and after every exit (``ExecStartPre`` and
``ExecStopPost``), and after any program that closed a ``Bridge``: closing releases the
pins, and lgpio leaves them as inputs that the L298N pulls high (07 §2). It uses
``pinctrl`` (07 §1, ADR-0008), because it sets the pad state and that state outlives the
process. Measured on the Pi (08 §3): after ``kill -9`` the enables keep their last level
and this helper sets both LOW; offline only the command and the exit codes are tested.

Exit codes: 0 done, 1 the command failed, 2 bad arguments or a config that cannot be
used. The pins are switched off in every case: those from ``[pins]`` when that table is
valid, otherwise the defaults; code 2 still blocks the service from starting (06 §2).
1 wins over 2: the pins may not have been switched off.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

from rc_agent.config import DEFAULT_ENABLE_PINS, Pins, parse_config, parse_pins, read_toml

# T4 in docs/spec/08 §4: the helper ends within 500 ms.
COMMAND_TIMEOUT_S = 0.4

Runner = Callable[..., subprocess.CompletedProcess[str]]


class HelperError(RuntimeError):
    pass


def _command(*pins: int) -> list[str]:
    return ["pinctrl", "set", ",".join(str(p) for p in pins), "op", "dl"]


def enable_off_command(pins: Pins) -> list[str]:
    return _command(pins.ena, pins.enb)


def _run(command: list[str], run_cmd: Runner) -> None:
    try:
        result = run_cmd(command, capture_output=True, text=True, timeout=COMMAND_TIMEOUT_S)
    except subprocess.TimeoutExpired as e:
        raise HelperError(f"{command[0]} did not finish within {COMMAND_TIMEOUT_S} s") from e
    except OSError as e:
        raise HelperError(f"cannot run {command[0]}: {e}") from e
    if result.returncode != 0:
        detail = result.stderr.strip() or "no output"
        raise HelperError(f"{command[0]} exited with {result.returncode}: {detail}")


def disable_enables(pins: Pins, run_cmd: Runner = subprocess.run) -> None:
    _run(enable_off_command(pins), run_cmd)


def _finish(pins: tuple[int, int], problem: str | None, run_cmd: Runner) -> int:
    """Switch the pins off whatever the problem was; 1 (command failed) wins over 2."""
    code = 2 if problem else 0
    if problem:
        print(problem, file=sys.stderr)
    try:
        _run(_command(*pins), run_cmd)
    except HelperError as e:
        print(e, file=sys.stderr)
        code = 1
    return code


def main(argv: list[str] | None = None, run_cmd: Runner = subprocess.run) -> int:
    parser = argparse.ArgumentParser(
        prog="rc-gpio-helper",
        description="Switch ENA and ENB low (docs/spec/06 §2).",
        exit_on_error=False,
    )
    parser.add_argument(
        "--config",
        type=Path,
        help="agent config; without it the default enable pins are used",
    )
    pins = DEFAULT_ENABLE_PINS
    try:
        args = parser.parse_args(argv)
    except argparse.ArgumentError as e:
        parser.print_usage(sys.stderr)
        return _finish(
            pins, f"bad arguments, switching off GPIO {pins[0]} and {pins[1]}: {e}", run_cmd
        )

    if args.config is None:
        return _finish(pins, None, run_cmd)
    try:
        data = read_toml(args.config)
        found = parse_pins(data)
        pins = (found.ena, found.enb)
        parse_config(data)
    # Any failure keeps the pins found so far: switching the enables off comes first.
    except Exception as e:
        return _finish(
            pins, f"cannot use config, switching off GPIO {pins[0]} and {pins[1]}: {e}", run_cmd
        )
    return _finish(pins, None, run_cmd)


if __name__ == "__main__":
    raise SystemExit(main())
