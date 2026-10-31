"""RC-12: every row of the table in docs/spec/03 §4 has a rejected example (docs/spec/02 §10).

No DO is simulated here. Each case is checked for consistency with the contract files: the
schema rows fail the schema, and every other case passes the schema, so only the rule it
covers can reject it, and it has a twin in examples/valid that differs in that rule only.
Applying the rules belongs to RC-15 (Pi) and RC-26 (DO), on these same files.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest
from protocol_support import (
    PROTOCOL_DIR,
    SCHEMAS_DIR,
    case_validator,
    hops,
    load_json,
    parse_strict,
    schema_errors,
)

SPEC_03 = PROTOCOL_DIR.parent / "docs" / "spec" / "03-worker-i-durable-object.md"
VALID_DIR = PROTOCOL_DIR / "examples" / "valid"
INVALID_DIR = PROTOCOL_DIR / "examples" / "invalid"
LIMITS = load_json(PROTOCOL_DIR / "limits.json")
MAX_FRAME_BYTES: int = LIMITS["max_frame_bytes"]

# Longest text of a wheel value in [-1, 1]. JSON.stringify writes |x| >= 1e-6 without an exponent,
# so 17 digits with 1e-6 <= |x| < 1e-5 take 25 characters (checked with node 22); json.dumps
# switches to an exponent below 1e-4, so its longest takes 24.
LONGEST_WHEEL_TEXTS = (
    "-0.0000012345678901234567",  # JSON.stringify
    "-2.2250738585072014e-308",  # json.dumps
)
# 02 §10, table of receiver rules.
REASON_OF = {
    "schema": "invalid_message",
    "range": "invalid_message",
    "role": "wrong_role",
    "size": "frame_too_large",
    "rate": "rate_limited",
    "lease": "lease_mismatch",
}
# Rows of 03 §4 by their first column, and the cases that show the examples named in the row.
ROWS = {
    "Wersja i schemat z `protocol/`": ("schema", ["schema-missing-v", "schema-unknown-type"]),
    "Rola nadawcy": ("role", ["role-drive-from-device", "role-armed-from-panel"]),
    "Zakresy i liczby skończone": ("range", ["range-left-above-one", "range-right-nan"]),
    "Rozmiar wiadomości": ("size", []),
    "Częstotliwość": ("rate", []),
    "Dzierżawa": (
        "lease",
        ["lease-drive-without-lease", "lease-arm-without-lease", "lease-stop-without-lease"],
    ),
}
CONNECTIONS = {("panel", "server"), ("server", "panel"), ("device", "server"), ("server", "device")}
LEASED_TYPES = {"arm", "stop", "drive"}


def load_cases(directory: Path) -> dict[str, dict[str, Any]]:
    return {path.name: load_json(path) for path in sorted(directory.glob("*.case.json"))}


INVALID = load_cases(INVALID_DIR)
VALID = {case["case"]: case for case in load_cases(VALID_DIR).values()}


def cases(covers: str) -> list[Any]:
    return [pytest.param(c, id=c["case"]) for c in INVALID.values() if c["covers"] == covers]


def hop_of(case: dict[str, Any]) -> tuple[str, str]:
    return case["hop"]["from"], case["hop"]["to"]


def message_type(frame: str) -> str:
    message = parse_strict(frame)
    assert isinstance(message, dict)
    kind = message["type"]
    assert isinstance(kind, str)
    return kind


def indexed_hops(kind: str) -> set[tuple[str, str]]:
    return {(h.sender, h.receiver) for h in hops() if h.type == kind}


def padded(frame: dict[str, Any]) -> str:
    """The frame as sent: spaces after the closing brace up to the limit or one byte over it."""
    text: str = frame["frame"]
    pad = frame.get("pad")
    if pad is None:
        return text
    target = MAX_FRAME_BYTES + (1 if pad == "limit+1" else 0)
    size = len(text.encode("utf-8"))
    assert size <= MAX_FRAME_BYTES, "the frame fits before padding (case.schema.json)"
    return text + " " * (target - size)


def most_in_window(times: list[int], window_ms: int) -> int:
    """Largest count of messages in any half-open window [t, t + window_ms) (02 §10)."""
    return max(sum(1 for u in times if t <= u < t + window_ms) for t in times)


def twins(case: dict[str, Any]) -> list[dict[str, Any]]:
    names = case.get("twin")
    assert names, f"{case['case']}: covers={case['covers']} needs a twin (02 §10)"
    for name in names:
        assert name in VALID, f"{case['case']}: twin {name} is not in examples/valid"
    return [VALID[name] for name in names]


def frame_texts(case: dict[str, Any]) -> list[str]:
    return [f["frame"] for f in case["frames"]]


# The set of cases as a whole.


def test_spec_03_table_has_the_six_rows_this_file_covers() -> None:
    text = SPEC_03.read_text(encoding="utf-8")
    section = text.split("## 4. Walidacja", 1)[1].split("\n## ", 1)[0]
    rows = re.findall(r"^\| ([^|]+?) \| [^|]+ \|$", section, flags=re.MULTILINE)
    assert rows[1:] == list(ROWS)  # rows[0] is the header


@pytest.mark.parametrize(("row", "covers", "names"), [(r, *v) for r, v in ROWS.items()])
def test_every_row_of_03_s4_has_a_rejected_example(row: str, covers: str, names: list[str]) -> None:
    by_name = {c["case"]: c for c in INVALID.values()}
    assert any(c["covers"] == covers for c in INVALID.values()), row
    for name in names:
        assert by_name[name]["covers"] == covers, (row, name)


def test_invalid_cases_are_well_formed() -> None:
    assert INVALID
    for file_name, case in INVALID.items():
        assert not list(case_validator().iter_errors(case)), file_name
        assert file_name == f"{case['case']}.case.json"
        assert case["covers"] != "ok", file_name
        assert case["expect"]["reason"] == REASON_OF[case["covers"]], file_name


def test_case_names_are_unique_across_valid_and_invalid() -> None:
    names = [c["case"] for c in INVALID.values()] + list(VALID)
    assert len(names) == len(set(names))


def test_every_twin_is_referenced_by_an_invalid_case() -> None:
    referenced = {name for case in INVALID.values() for name in case.get("twin", [])}
    assert {name for name in VALID if name.startswith("twin-")} <= referenced


# Rows rejected by the schema.


@pytest.mark.parametrize("case", cases("schema") + cases("range"))
def test_schema_and_range_cases_fail_the_schema(case: dict[str, Any]) -> None:
    assert hop_of(case) in CONNECTIONS
    for frame in case["frames"]:
        assert schema_errors(padded(frame), *hop_of(case)), case["case"]


@pytest.mark.parametrize("case", cases("range"))
def test_range_cases_are_drive_frames_with_one_bad_number(case: dict[str, Any]) -> None:
    """The frame differs from a valid drive in one numeric field, so only the range rejects it."""
    base = json.loads(VALID["drive-panel-server"]["frames"][0]["frame"])
    message = json.loads(case["frames"][0]["frame"])  # lenient: NaN and 1e400 load here
    changed = [key for key in base if message.get(key) != base[key]]
    assert set(message) == set(base)
    assert len(changed) == 1 and changed[0] in ("left", "right", "seq"), case["case"]


# Rows the schema cannot see: the frame passes, the rule rejects it, the twin passes it.


@pytest.mark.parametrize("case", cases("role"))
def test_role_case_is_a_valid_frame_on_a_hop_its_type_does_not_have(case: dict[str, Any]) -> None:
    assert hop_of(case) in CONNECTIONS
    for frame in frame_texts(case):
        kind = message_type(frame)
        assert hop_of(case) not in indexed_hops(kind), case["case"]
    for twin in twins(case):
        assert frame_texts(twin) == frame_texts(case)
        assert hop_of(twin) in indexed_hops(message_type(frame_texts(twin)[0]))
        assert schema_errors(frame_texts(twin)[0], *hop_of(twin)) == []


@pytest.mark.parametrize("case", cases("size"))
def test_size_case_is_one_byte_over_and_its_twin_exactly_at_the_limit(case: dict[str, Any]) -> None:
    for frame in case["frames"]:
        assert frame.get("pad") == "limit+1"
        text = padded(frame)
        assert len(text.encode("utf-8")) == MAX_FRAME_BYTES + 1
        assert schema_errors(text, *hop_of(case)) == [], case["case"]
    for twin in twins(case):
        assert hop_of(twin) == hop_of(case)
        assert frame_texts(twin) == frame_texts(case)
        for frame in twin["frames"]:
            assert frame.get("pad") == "limit"
            assert len(padded(frame).encode("utf-8")) == MAX_FRAME_BYTES


@pytest.mark.parametrize("case", cases("rate"))
def test_rate_case_is_one_message_over_the_limit_in_a_window(case: dict[str, Any]) -> None:
    kinds = {message_type(f) for f in frame_texts(case)}
    assert len(kinds) == 1
    limit = LIMITS["rate"][kinds.pop()]
    times = [f["t_ms"] for f in case["frames"]]
    assert times == sorted(times)
    assert len(times) == limit["max"] + 1
    assert most_in_window(times, limit["window_ms"]) == limit["max"] + 1
    for frame in frame_texts(case):
        assert schema_errors(frame, *hop_of(case)) == [], case["case"]
    for twin in twins(case):
        twin_times = [f["t_ms"] for f in twin["frames"]]
        assert hop_of(twin) == hop_of(case)
        assert most_in_window(twin_times, limit["window_ms"]) == limit["max"], twin["case"]
        # Either the same frames less the last one, or the same frames spread wider.
        assert frame_texts(twin) == frame_texts(case)[: len(twin["frames"])]


def test_rate_cases_include_a_twin_on_the_window_edge() -> None:
    """[t, t + W) is half-open: a message exactly W after the first starts a new window."""
    edges = [
        twin
        for case in INVALID.values()
        if case["covers"] == "rate"
        for twin in twins(case)
        if len(twin["frames"]) == len(case["frames"])
    ]
    assert edges
    for twin in edges:
        times = [f["t_ms"] for f in twin["frames"]]
        kind = message_type(twin["frames"][0]["frame"])
        assert times[-1] - times[0] == LIMITS["rate"][kind]["window_ms"]


@pytest.mark.parametrize("case", cases("lease"))
def test_lease_case_differs_from_its_twin_only_in_holding_the_lease(case: dict[str, Any]) -> None:
    assert case["context"] == {"sender_holds_lease": False}
    assert hop_of(case) == ("panel", "server")
    for frame in frame_texts(case):
        assert message_type(frame) in LEASED_TYPES
        assert schema_errors(frame, *hop_of(case)) == [], case["case"]
    for twin in twins(case):
        assert twin["context"] == {"sender_holds_lease": True}
        assert {
            k: v for k, v in twin.items() if k not in ("case", "covers", "context", "expect")
        } == {
            k: v
            for k, v in case.items()
            if k not in ("case", "covers", "context", "expect", "twin")
        }


def test_only_lease_cases_and_their_twins_carry_context() -> None:
    lease_twins = {n for c in INVALID.values() if c["covers"] == "lease" for n in c["twin"]}
    for case in INVALID.values():
        assert ("context" in case) == (case["covers"] == "lease"), case["case"]
    for name, case in VALID.items():
        assert ("context" in case) == (name in lease_twins), name


# limits.json itself.


def test_every_type_sent_by_panel_or_pi_has_a_rate_limit() -> None:
    sent = {h.type for h in hops() if h.sender in ("panel", "device")}
    assert set(LIMITS["rate"]) == sent


def test_rate_limits_are_positive_integers() -> None:
    for kind, limit in LIMITS["rate"].items():
        assert isinstance(limit["max"], int) and limit["max"] >= 1, kind
        assert isinstance(limit["window_ms"], int) and limit["window_ms"] > 0, kind


def test_stopped_limit_is_above_the_stop_limit() -> None:
    """02 §10: the Pi answers every stop with stopped, also those the DO sends on its own."""
    assert LIMITS["rate"]["stopped"]["max"] > LIMITS["rate"]["stop"]["max"]


def test_error_limit_is_above_everything_the_pi_may_reject() -> None:
    """02 §10: the Pi answers error to any message from the DO it rejects, but not to an error."""
    received = {h.type for h in hops() if (h.sender, h.receiver) == ("server", "device")}
    inbound = sum(LIMITS["rate"][kind]["max"] for kind in received - {"error"})
    assert LIMITS["rate"]["error"]["max"] > inbound


def test_armed_limit_is_above_the_arm_limit() -> None:
    """02 §10: armed answers an arm, at most one per arm received."""
    assert LIMITS["rate"]["armed"]["max"] > LIMITS["rate"]["arm"]["max"]


def test_every_valid_frame_fits_the_size_limit() -> None:
    for name, case in VALID.items():
        for frame in case["frames"]:
            assert len(padded(frame).encode("utf-8")) <= MAX_FRAME_BYTES, name


def test_largest_possible_status_fits_the_size_limit() -> None:
    """Every field at its longest: a schema change that outgrows the limit shows up here."""
    common = load_json(SCHEMAS_DIR / "common.schema.json")["$defs"]
    longest_id = "A" * 22
    longest_counter = common["counter"]["maximum"]
    longest_duration = common["duration_ms"]["maximum"]
    status = {
        "v": 1,
        "type": "status",
        "state": max(common["agent_state"]["enum"], key=len),
        "session_id": longest_id,
        "last_seq": longest_counter,
        "seq_age_ms": longest_duration,
        "command_left": "WHEEL",
        "command_right": "WHEEL",
        "output_left": "WHEEL",
        "output_right": "WHEEL",
        "stop_cause": max(common["stop_cause"]["enum"], key=len),
        "lease_id": longest_id,
        "last_heartbeat_seq": longest_counter,
        "heartbeat_age_ms": longest_duration,
    }
    wheel = max(LONGEST_WHEEL_TEXTS, key=len)
    # indent=1 is generous: whitespace a sender might add.
    text = json.dumps(status, indent=1).replace('"WHEEL"', wheel)
    assert schema_errors(text, "device", "server") == []
    assert len(text.encode("utf-8")) <= MAX_FRAME_BYTES
