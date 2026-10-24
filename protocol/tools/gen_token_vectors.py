"""Regenerates protocol/vectors/token-v1.json (docs/spec/02 §5). Standard library only.

python3 protocol/tools/gen_token_vectors.py          # rewrite the file
python3 protocol/tools/gen_token_vectors.py --check  # exit 1 when the file differs
"""

import base64
import hashlib
import hmac
import json
import sys
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / "vectors" / "token-v1.json"
MAX_MS = 2**53 - 1


def key(name: str) -> bytes:
    return hashlib.sha256(f"rc-token-v1-key-{name}".encode()).digest()


def mac_b64(k: bytes, session_id: str, issued: int, version: str = "v1") -> str:
    data = f"{version}\n{session_id}\n{issued}".encode("ascii")
    digest = hmac.new(k, data, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def token(k: bytes, session_id: str, issued: int, version: str = "v1") -> str:
    return f"{issued}.{mac_b64(k, session_id, issued, version)}"


def session_id(seed: str) -> str:
    digest = hashlib.sha256(seed.encode()).digest()[:16]
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def find_session(k: bytes, issued: int, seed: str, need_mac_symbol: bool) -> str:
    """First deterministic session id with a `-` or `_` in itself or, if asked, in its MAC.

    With `need_mac_symbol` the MAC must also not end in `A`, so that a wrong last character is
    distinguishable from the right one.
    """
    for i in range(10_000):
        sid = session_id(f"{seed}-{i}")
        mac = mac_b64(k, sid, issued)
        if need_mac_symbol:
            if ("-" in mac or "_" in mac) and mac[-1] != "A":
                return sid
        elif "-" in sid or "_" in sid:
            return sid
    raise RuntimeError(seed)


def build() -> dict[str, object]:
    k1, k2 = key("1"), key("2")
    sid = session_id("session-1")
    other = session_id("session-2")
    valid: list[dict[str, object]] = []

    def add_valid(name: str, k: bytes, s: str, issued: int) -> None:
        valid.append(
            {
                "name": name,
                "key_hex": k.hex(),
                "session_id": s,
                "issued_pi_ms": issued,
                "token": token(k, s, issued),
            }
        )

    add_valid("typical", k1, sid, 4200)
    add_valid("zero", k1, sid, 0)
    add_valid("one", k1, sid, 1)
    add_valid("max-safe-integer", k1, sid, MAX_MS)
    add_valid(
        "session-id-with-dash-or-underscore", k1, find_session(k1, 4200, "id-symbol", False), 4200
    )
    add_valid("mac-with-dash-or-underscore", k1, find_session(k1, 4200, "mac-symbol", True), 4200)

    base = token(k1, sid, 4200)
    issued_part, mac = base.split(".")
    invalid: list[dict[str, object]] = []

    def add_invalid(name: str, tok: str, reason: str, pattern_rejects: bool, s: str = sid) -> None:
        invalid.append(
            {
                "name": name,
                "key_hex": k1.hex(),
                "session_id": s,
                "token": tok,
                "reason": reason,
                "pattern_rejects": pattern_rejects,
            }
        )

    # Well-formed tokens that do not verify against (k1, sid).
    add_invalid("other-key", token(k2, sid, 4200), "mac", False)
    add_invalid("issued-plus-one", f"4201.{mac}", "mac", False)
    add_invalid("issued-minus-one", f"4199.{mac}", "mac", False)
    add_invalid("other-session", token(k1, other, 4200), "mac", False)
    add_invalid("other-version", token(k1, sid, 4200, version="v2"), "mac", False)
    # Not the last character: its low bits are fixed, so changing it would make a format error.
    index = next(i for i, c in enumerate(mac[:-1]) if c.isalpha())
    add_invalid(
        "mac-one-letter-case-changed",
        f"{issued_part}.{mac[:index]}{mac[index].swapcase()}{mac[index + 1 :]}",
        "mac",
        False,
    )
    # Malformed tokens.
    add_invalid("leading-zero", f"0{issued_part}.{mac}", "format", True)
    add_invalid("plus-sign", f"+{issued_part}.{mac}", "format", True)
    add_invalid("minus-sign", f"-{issued_part}.{mac}", "format", True)
    add_invalid("underscore-in-digits", f"4_200.{mac}", "format", True)
    add_invalid("fullwidth-digits", "\uff14\uff12\uff10\uff10." + mac, "format", True)
    add_invalid("leading-space", f" {base}", "format", True)
    add_invalid("trailing-space", f"{base} ", "format", True)
    add_invalid("trailing-newline", f"{base}\n", "format", True)
    add_invalid("two-dots", f"{issued_part}..{mac}", "format", True)
    add_invalid("empty-mac", f"{issued_part}.", "format", True)
    add_invalid("no-dot", f"{issued_part}{mac}", "format", True)
    add_invalid("mac-with-padding", f"{issued_part}.{mac}=", "format", True)
    add_invalid("mac-42-chars", f"{issued_part}.{mac[:-1]}", "format", True)
    add_invalid("mac-44-chars", f"{issued_part}.{mac}A", "format", True)
    add_invalid("issued-above-max-safe-integer", f"{MAX_MS + 1}.{mac}", "format", False)
    add_invalid("issued-17-digits", f"{10**16}.{mac}", "format", True)
    # Same MAC bytes written another way.
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    noncanonical = alphabet[alphabet.index(mac[-1]) + 1]  # sets one of the two spare bits
    add_invalid(
        "non-canonical-last-char", f"{issued_part}.{mac[:-1]}{noncanonical}", "format", True
    )
    sid_std = find_session(k1, 4200, "mac-symbol", True)
    tok_std = token(k1, sid_std, 4200)
    add_invalid(
        "standard-alphabet-same-mac",
        tok_std.replace("-", "+").replace("_", "/"),
        "format",
        True,
        s=sid_std,
    )
    return {
        "version": 1,
        "description": (
            "Token vectors for docs/spec/02 §5. valid: token is what the Pi issues for "
            "(key, session_id, issued_pi_ms). invalid: verifying token against (key, session_id) "
            "must fail with the given reason; pattern_rejects says whether the freshness_token "
            "pattern already rejects it."
        ),
        "valid": valid,
        "invalid": invalid,
    }


def render() -> str:
    return json.dumps(build(), indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    text = render()
    if "--check" in argv:
        if OUTPUT.exists() and OUTPUT.read_text(encoding="utf-8") == text:
            return 0
        print(f"{OUTPUT.name} is stale: run this script without --check", file=sys.stderr)
        return 1
    OUTPUT.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
