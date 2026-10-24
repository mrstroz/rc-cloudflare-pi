"""RC-11: protocol/vectors/token-v1.json checked by an implementation written from 02 §5 alone.

Nothing here reads protocol/tools/gen_token_vectors.py: a mistake shared by the generator and
the file would otherwise pass. openssl was used once as a third opinion (see the review evidence).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import subprocess
import sys
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from protocol_support import PROTOCOL_DIR, load_json, load_registry

VECTORS = load_json(PROTOCOL_DIR / "vectors" / "token-v1.json")
MAX_ISSUED_MS = 2**53 - 1
# Written from the table in 02 §5, not copied from common.schema.json.
TOKEN_FORMAT = re.compile(r"(0|[1-9][0-9]{0,15})\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]", re.ASCII)


def issue(key: bytes, session_id: str, issued_ms: int, version: bytes = b"v1") -> str:
    message = version + b"\n" + session_id.encode("ascii") + b"\n" + str(issued_ms).encode("ascii")
    mac = hmac.new(key, message, hashlib.sha256).digest()
    return f"{issued_ms}." + base64.urlsafe_b64encode(mac).rstrip(b"=").decode("ascii")


def verify(key: bytes, session_id: str, token: str) -> str | None:
    """None when accepted, otherwise the reason: format or mac (02 §5 order of checks)."""
    match = TOKEN_FORMAT.fullmatch(token)
    if match is None:
        return "format"
    issued_ms = int(match.group(1))
    if issued_ms > MAX_ISSUED_MS:
        return "format"
    expected = issue(key, session_id, issued_ms)
    if not hmac.compare_digest(expected.encode("ascii"), token.encode("ascii")):
        return "mac"
    return None


def schema_accepts(token: str) -> bool:
    validator = Draft202012Validator(
        {"$ref": "common.schema.json#/$defs/freshness_token"}, registry=load_registry()
    )
    return not list(validator.iter_errors(token))


def by_name(vectors: list[dict[str, Any]]) -> list[Any]:
    return [pytest.param(v, id=v["name"]) for v in vectors]


def test_vector_file_is_what_the_generator_writes() -> None:
    """Runs the generator only to catch a stale file; the vectors are checked without its code."""
    result = subprocess.run(
        [sys.executable, str(PROTOCOL_DIR / "tools" / "gen_token_vectors.py"), "--check"],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_hmac_matches_rfc_4231_case_2() -> None:
    mac = hmac.new(b"Jefe", b"what do ya want for nothing?", hashlib.sha256).hexdigest()
    assert mac == "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"


@pytest.mark.parametrize("vector", by_name(VECTORS["valid"]))
def test_valid_vector_is_what_the_pi_issues(vector: dict[str, Any]) -> None:
    key = bytes.fromhex(vector["key_hex"])
    assert len(key) == 32
    token = issue(key, vector["session_id"], vector["issued_pi_ms"])
    assert token == vector["token"]
    assert verify(key, vector["session_id"], token) is None
    assert schema_accepts(token)


@pytest.mark.parametrize("vector", by_name(VECTORS["invalid"]))
def test_invalid_vector_is_rejected_for_its_reason(vector: dict[str, Any]) -> None:
    key = bytes.fromhex(vector["key_hex"])
    assert verify(key, vector["session_id"], vector["token"]) == vector["reason"]


@pytest.mark.parametrize("vector", by_name(VECTORS["invalid"]))
def test_pattern_rejects_flag_matches_the_schema(vector: dict[str, Any]) -> None:
    assert schema_accepts(vector["token"]) is not vector["pattern_rejects"]


def test_other_version_vector_is_a_v2_token() -> None:
    """Shows the vector really differs by version only, not by some unrelated MAC."""
    vector = next(v for v in VECTORS["invalid"] if v["name"] == "other-version")
    key = bytes.fromhex(vector["key_hex"])
    assert issue(key, vector["session_id"], 4200, version=b"v2") == vector["token"]


def test_vectors_cover_the_edges_of_02_s5() -> None:
    issued = {v["issued_pi_ms"] for v in VECTORS["valid"]}
    assert {0, 1, MAX_ISSUED_MS} <= issued
    assert any(set("-_") & set(v["session_id"]) for v in VECTORS["valid"])
    assert any(set("-_") & set(v["token"].split(".")[1]) for v in VECTORS["valid"])
    assert any(not v["token"].endswith("A") for v in VECTORS["valid"])
    reasons = {v["reason"] for v in VECTORS["invalid"]}
    assert reasons == {"format", "mac"}


def test_only_the_range_step_rejects_a_token_the_pattern_accepts() -> None:
    """02 §5: issued_pi_ms above 2^53 - 1 passes the pattern and is a format error."""
    names = [
        v["name"]
        for v in VECTORS["invalid"]
        if v["reason"] == "format" and not v["pattern_rejects"]
    ]
    assert names == ["issued-above-max-safe-integer"]


def test_names_are_unique() -> None:
    names = [v["name"] for v in VECTORS["valid"] + VECTORS["invalid"]]
    assert len(names) == len(set(names))


@pytest.mark.parametrize("vector", by_name(VECTORS["valid"]))
def test_any_single_character_change_is_rejected(vector: dict[str, Any]) -> None:
    key = bytes.fromhex(vector["key_hex"])
    token = vector["token"]
    alphabet = "0123456789.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"
    for position, original in enumerate(token):
        for replacement in alphabet:
            if replacement != original:
                changed = token[:position] + replacement + token[position + 1 :]
                assert verify(key, vector["session_id"], changed) is not None, changed


@pytest.mark.parametrize("vector", by_name(VECTORS["valid"]))
def test_token_does_not_carry_to_another_session_or_key(vector: dict[str, Any]) -> None:
    key = bytes.fromhex(vector["key_hex"])
    other_session = "A" * 22 if vector["session_id"] != "A" * 22 else "B" * 22
    assert verify(key, other_session, vector["token"]) == "mac"
    assert verify(bytes(32), vector["session_id"], vector["token"]) == "mac"
