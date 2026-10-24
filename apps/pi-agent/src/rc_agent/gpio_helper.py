"""Drive ENA and ENB low as outputs, from outside the agent process (docs/spec/06 §2).

Run it before the agent starts and after every exit (``ExecStartPre`` and
``ExecStopPost``), and after any program that closed a ``Bridge``: closing releases the
pins, and lgpio leaves them as inputs that the L298N pulls high (07 §2). It uses
``pinctrl``, the candidate backend from 07 §1, because it sets the pad state and that
state outlives the process. Whether it really holds after ``kill -9`` is the hardware
check of RC-04; offline only the command and the exit codes are tested.

Exit codes: 0 done, 1 the command failed, 2 the config could not be read. In the last
case the default enable pins are switched off anyway and the nonzero code still blocks
the service from starting (06 §2). 1 wins over 2: the pins may not have been switched off.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

from rc_agent.config import DEFAULT_ENABLE_PINS, Pins, load_config

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


def main(argv: list[str] | None = None, run_cmd: Runner = subprocess.run) -> int:
    parser = argparse.ArgumentParser(
        prog="rc-gpio-helper", description="Switch ENA and ENB low (docs/spec/06 §2)."
    )
    parser.add_argument(
        "--config",
        type=Path,
        help="agent config; without it the default enable pins are used",
    )
    args = parser.parse_args(argv)

    command = _command(*DEFAULT_ENABLE_PINS)
    config_error: str | None = None
    if args.config is not None:
        try:
            command = enable_off_command(load_config(args.config).pins)
        # Any failure to read the config falls back: switching the enables off comes first.
        except Exception as e:
            config_error = f"cannot read config, switching off the default pins: {e}"

    code = 2 if config_error else 0
    if config_error:
        print(config_error, file=sys.stderr)
    try:
        _run(command, run_cmd)
    except HelperError as e:
        print(e, file=sys.stderr)
        code = 1
    return code


if __name__ == "__main__":
    raise SystemExit(main())
