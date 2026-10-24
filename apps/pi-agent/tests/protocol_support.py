"""Reference reading of protocol/: strict parse, schema registry and per-hop validation.

The strict parser is what the Pi applies before the schema (docs/spec/02 §10); RC-15 moves
it into src/ and the tests import it from there.
"""

import json
import math
from collections.abc import Iterator
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry
from referencing.jsonschema import DRAFT202012

PROTOCOL_DIR = Path(__file__).resolve().parents[3] / "protocol"
SCHEMAS_DIR = PROTOCOL_DIR / "schemas"
CASE_SCHEMA = PROTOCOL_DIR / "examples" / "case.schema.json"


class ParseError(ValueError):
    """The frame is not acceptable JSON for the protocol, before any schema applies."""


@dataclass(frozen=True)
class Hop:
    type: str
    sender: str
    receiver: str
    schema: str


def _reject_constant(name: str) -> Any:
    raise ParseError(f"{name} is not a finite number")


def _finite_float(text: str) -> float:
    value = float(text)
    if math.isinf(value):
        raise ParseError(f"{text} is out of the float range")
    return value


def _unique_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ParseError(f"duplicate key {key!r}")
        result[key] = value
    return result


def parse_strict(text: str) -> Any:
    try:
        return json.loads(
            text,
            parse_constant=_reject_constant,
            parse_float=_finite_float,
            object_pairs_hook=_unique_keys,
        )
    except ParseError:
        raise
    except (ValueError, RecursionError) as error:
        raise ParseError(str(error)) from error


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def schema_files() -> Iterator[Path]:
    yield from sorted(SCHEMAS_DIR.glob("*.schema.json"))
    yield CASE_SCHEMA


@cache
def load_registry() -> Registry[Any]:
    registry: Registry[Any] = Registry()
    for path in schema_files():
        document = load_json(path)
        registry = registry.with_resource(document["$id"], DRAFT202012.create_resource(document))
    return registry


@cache
def hops() -> tuple[Hop, ...]:
    index = load_json(PROTOCOL_DIR / "message-types.json")
    return tuple(Hop(h["type"], h["from"], h["to"], h["schema"]) for h in index["hops"])


def hop_for(kind: str, sender: str, receiver: str) -> Hop | None:
    """The entry of message-types.json keyed by (type, from, to), if there is one."""
    for hop in hops():
        if (hop.type, hop.sender, hop.receiver) == (kind, sender, receiver):
            return hop
    return None


@cache
def validator(schema_name: str) -> Draft202012Validator:
    return Draft202012Validator(
        load_json(SCHEMAS_DIR / schema_name),
        registry=load_registry(),
    )


@cache
def case_validator() -> Draft202012Validator:
    return Draft202012Validator(load_json(CASE_SCHEMA), registry=load_registry())


def schema_errors(frame: str, sender: str, receiver: str) -> list[str]:
    """Errors of a frame at one hop; empty when it parses strictly and matches the schema."""
    try:
        message = parse_strict(frame)
    except ParseError as error:
        return [str(error)]
    if not isinstance(message, dict) or not isinstance(message.get("type"), str):
        return ["frame has no string 'type'"]
    hop = hop_for(message["type"], sender, receiver)
    if hop is None:
        return [f"no hop {sender} -> {receiver} for type {message['type']!r}"]
    return [e.message for e in validator(hop.schema).iter_errors(message)]
