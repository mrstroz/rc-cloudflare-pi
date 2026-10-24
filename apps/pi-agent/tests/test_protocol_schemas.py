"""RC-10: every v1 message type has a schema and a valid example (docs/spec/02 §2, §10).

The list of types is read from the table in the spec itself, so the index in protocol/ is checked
against the spec rather than against itself.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from protocol_support import (
    PROTOCOL_DIR,
    SCHEMAS_DIR,
    ParseError,
    case_validator,
    hop_for,
    hops,
    load_json,
    parse_strict,
    schema_errors,
    schema_files,
)

SPEC_02 = PROTOCOL_DIR.parent / "docs" / "spec" / "02-protokol-v1.md"
VALID_DIR = PROTOCOL_DIR / "examples" / "valid"

# Connections that exist: the panel and the Pi only ever talk to the DO.
CONNECTIONS = {("panel", "server"), ("server", "panel"), ("device", "server"), ("server", "device")}


def spec_types() -> list[str]:
    text = SPEC_02.read_text(encoding="utf-8")
    section = text.split("## 2. Typy wiadomości", 1)[1].split("\n## ", 1)[0]
    return re.findall(r"^\| `([a-z_]+)` \|", section, flags=re.MULTILINE)


def spec_dialect() -> set[str]:
    """Keywords listed in the dialect point of 02 §10, the subset Ajv and jsonschema share."""
    text = SPEC_02.read_text(encoding="utf-8")
    point = text.split("- **Dialekt.**", 1)[1].split("\n", 1)[0]
    listed = point.split(": ", 1)[1].split("Bez `format`", 1)[0]
    return set(re.findall(r"`([$A-Za-z]+)`", listed))


def valid_cases() -> list[dict[str, Any]]:
    return [load_json(path) for path in sorted(VALID_DIR.glob("*.case.json"))]


def message_schemas() -> list[Path]:
    return [p for p in sorted(SCHEMAS_DIR.glob("*.schema.json")) if p.name != "common.schema.json"]


def schema_nodes(node: Any) -> Iterator[dict[str, Any]]:
    """Every subschema, skipping the names under properties/$defs, which are not keywords."""
    if not isinstance(node, dict):
        return
    yield node
    for key, value in node.items():
        if key in ("properties", "$defs"):
            for child in value.values():
                yield from schema_nodes(child)
        elif key == "items":
            yield from schema_nodes(value)
        elif key == "oneOf":
            for child in value:
                yield from schema_nodes(child)


def first_frame(case: dict[str, Any]) -> dict[str, Any]:
    message = parse_strict(case["frames"][0]["frame"])
    assert isinstance(message, dict)
    return message


def errors_of(message: dict[str, Any], case: dict[str, Any]) -> list[str]:
    return schema_errors(json.dumps(message), case["hop"]["from"], case["hop"]["to"])


def test_spec_table_has_twelve_types() -> None:
    # Guards the parser of the table: a reformatted spec must not silently shrink the list.
    assert len(spec_types()) == 12


def test_spec_dialect_lists_twenty_keywords() -> None:
    # Guards the parser of the dialect point, as for the table of types.
    assert len(spec_dialect()) == 20
    assert {"$ref", "additionalProperties", "pattern", "oneOf"} <= spec_dialect()
    assert "format" not in spec_dialect()


def test_index_lists_exactly_the_types_of_the_spec() -> None:
    assert sorted({h.type for h in hops()}) == sorted(spec_types())


def test_every_hop_is_an_existing_connection_with_a_schema_file() -> None:
    for hop in hops():
        assert (hop.sender, hop.receiver) in CONNECTIONS, hop
        assert (SCHEMAS_DIR / hop.schema).is_file(), hop


def test_hops_are_unique() -> None:
    keys = [(h.type, h.sender, h.receiver) for h in hops()]
    assert len(keys) == len(set(keys))


def test_every_message_schema_is_used_by_a_hop() -> None:
    used = {h.schema for h in hops()}
    assert {p.name for p in message_schemas()} == used


def test_every_schema_is_valid_2020_12_with_id_equal_to_file_name() -> None:
    for path in schema_files():
        document = load_json(path)
        Draft202012Validator.check_schema(document)
        assert document["$schema"] == "https://json-schema.org/draft/2020-12/schema"
        assert document["$id"] == path.name


def test_schemas_use_only_the_dialect_of_02_s10() -> None:
    allowed = spec_dialect()
    for path in schema_files():
        for node in schema_nodes(load_json(path)):
            assert set(node) <= allowed, (path.name, set(node) - allowed)


def test_every_pattern_is_anchored_for_both_engines() -> None:
    """`$` alone lets a trailing newline through in Python, not in JavaScript (02 §10)."""
    patterns = [
        (path.name, node["pattern"])
        for path in schema_files()
        for node in schema_nodes(load_json(path))
        if "pattern" in node
    ]
    assert patterns
    for name, pattern in patterns:
        assert pattern.startswith("^"), name
        assert pattern.endswith("$(?!\\n)"), name


def test_every_object_closes_additional_properties() -> None:
    for path in schema_files():
        for node in schema_nodes(load_json(path)):
            if node.get("type") == "object" or "properties" in node:
                assert node.get("additionalProperties") is False, path.name


def test_every_message_schema_requires_version_and_its_type() -> None:
    for hop in hops():
        schema = load_json(SCHEMAS_DIR / hop.schema)
        branches = schema.get("oneOf", [schema])
        for branch in branches:
            assert {"v", "type"} <= set(branch["required"]), hop
            assert branch["properties"]["type"] == {"const": hop.type}, hop
            assert branch["properties"]["v"] == {"$ref": "common.schema.json#/$defs/version"}


@pytest.mark.parametrize("kind", ["heartbeat", "arm", "drive", "stop"])
def test_forwarded_form_is_the_client_form_plus_lease_id(kind: str) -> None:
    client = load_json(SCHEMAS_DIR / f"{kind}.client.schema.json")
    forwarded = load_json(SCHEMAS_DIR / f"{kind}.forwarded.schema.json")
    lease_id = {"$ref": "common.schema.json#/$defs/id"}
    assert forwarded["properties"] == client["properties"] | {"lease_id": lease_id}
    assert set(forwarded["required"]) == set(client["required"]) | {"lease_id"}


def test_lease_branches_match_the_lease_state_enum() -> None:
    lease = load_json(SCHEMAS_DIR / "lease.schema.json")
    common = load_json(SCHEMAS_DIR / "common.schema.json")
    states = [branch["properties"]["state"]["const"] for branch in lease["oneOf"]]
    assert sorted(states) == sorted(common["$defs"]["lease_state"]["enum"])


def test_lease_id_is_forbidden_from_the_panel_and_required_towards_the_pi() -> None:
    """02 §1: the DO adds lease_id; a panel frame carrying one is rejected."""
    for hop in hops():
        schema = load_json(SCHEMAS_DIR / hop.schema)
        if hop.sender == "panel":
            assert "lease_id" not in schema.get("properties", {}), hop
        if hop.receiver == "device" and hop.type in ("heartbeat", "arm", "drive", "stop"):
            assert "lease_id" in schema["required"], hop


def test_every_hop_has_a_valid_example() -> None:
    covered = set()
    for case in valid_cases():
        covered.add((first_frame(case)["type"], case["hop"]["from"], case["hop"]["to"]))
    assert {(h.type, h.sender, h.receiver) for h in hops()} <= covered


@pytest.mark.parametrize("state", ["granted", "lost", "busy", "free"])
def test_every_lease_state_has_an_example(state: str) -> None:
    states = {
        first_frame(c).get("state") for c in valid_cases() if first_frame(c)["type"] == "lease"
    }
    assert state in states


@pytest.mark.parametrize("state", ["disarmed", "armed"])
def test_every_agent_state_has_a_status_example(state: str) -> None:
    states = {
        first_frame(c).get("state") for c in valid_cases() if first_frame(c)["type"] == "status"
    }
    assert state in states


def test_valid_cases_are_well_formed_and_accepted() -> None:
    names = set()
    for path in sorted(VALID_DIR.glob("*.case.json")):
        case = load_json(path)
        assert not list(case_validator().iter_errors(case)), path.name
        assert path.name == f"{case['case']}.case.json"
        assert case["covers"] == "ok", path.name
        assert case["expect"]["reason"] is None, path.name
        for frame in case["frames"]:
            assert schema_errors(frame["frame"], case["hop"]["from"], case["hop"]["to"]) == [], (
                path.name
            )
        names.add(case["case"])
    assert len(names) == len(list(VALID_DIR.glob("*.case.json")))


def test_protocol_json_files_are_canonical() -> None:
    """One formatting (python3 -m json.tool --no-ensure-ascii --indent 2) keeps diffs reviewable."""
    for path in sorted(PROTOCOL_DIR.rglob("*.json")):
        text = path.read_text(encoding="utf-8")
        assert text == json.dumps(json.loads(text), indent=2, ensure_ascii=False) + "\n", path


# Mutations of every valid example: the schema has to notice each one.


def valid_messages() -> list[tuple[str, dict[str, Any], dict[str, Any]]]:
    return [(c["case"], c, first_frame(c)) for c in valid_cases()]


@pytest.mark.parametrize(
    ("name", "case", "message"), valid_messages(), ids=[name for name, _, _ in valid_messages()]
)
def test_every_required_field_is_required(
    name: str, case: dict[str, Any], message: dict[str, Any]
) -> None:
    for key in message:
        reduced = {k: v for k, v in message.items() if k != key}
        assert errors_of(reduced, case), (name, key)


@pytest.mark.parametrize(
    ("name", "case", "message"), valid_messages(), ids=[name for name, _, _ in valid_messages()]
)
def test_unknown_field_is_rejected(
    name: str, case: dict[str, Any], message: dict[str, Any]
) -> None:
    assert errors_of({**message, "extra": 1}, case), name


@pytest.mark.parametrize(
    ("name", "case", "message"), valid_messages(), ids=[name for name, _, _ in valid_messages()]
)
def test_other_version_is_rejected(
    name: str, case: dict[str, Any], message: dict[str, Any]
) -> None:
    for version in (0, 2, "1", True, None):
        assert errors_of({**message, "v": version}, case), (name, version)


def nullable_fields(schema: dict[str, Any]) -> list[str]:
    return [
        key
        for key, node in schema.get("properties", {}).items()
        if {"type": "null"} in node.get("oneOf", [])
    ]


def test_every_nullable_field_has_an_example_with_null_and_with_a_value() -> None:
    """Nullable is a property of the schema file, so examples are pooled over its hops."""
    messages: dict[str, list[dict[str, Any]]] = {}
    for case in valid_cases():
        message = first_frame(case)
        hop = hop_for(message["type"], case["hop"]["from"], case["hop"]["to"])
        assert hop is not None, case["case"]
        messages.setdefault(hop.schema, []).append(message)
    checked = 0
    for schema in sorted({h.schema for h in hops()}):
        for field in nullable_fields(load_json(SCHEMAS_DIR / schema)):
            values = [m[field] for m in messages[schema]]
            assert None in values, (schema, field)
            assert any(v is not None for v in values), (schema, field)
            checked += 1
    assert checked


def test_panel_frame_with_its_own_lease_id_is_rejected() -> None:
    for name, case, message in valid_messages():
        if case["hop"]["from"] == "panel":
            assert errors_of({**message, "lease_id": "r8JfA0sUo5GxN1tVqBhY6w"}, case), name


def drive_case() -> tuple[dict[str, Any], dict[str, Any]]:
    case = load_json(VALID_DIR / "drive-panel-server.case.json")
    return case, first_frame(case)


@pytest.mark.parametrize(
    "value",
    [1.5, -1.0000001, 2, True, "0.5", None, 10**400],
    ids=["1.5", "below-1", "int-2", "bool", "string", "null", "huge-int"],
)
def test_wheel_out_of_range_or_wrong_type_is_rejected(value: object) -> None:
    case, message = drive_case()
    assert errors_of({**message, "left": value}, case)


@pytest.mark.parametrize("value", [-1, 1, 0, 0.0, -0.0, 0.5])
def test_wheel_edges_are_accepted(value: float) -> None:
    case, message = drive_case()
    assert errors_of({**message, "right": value}, case) == []


@pytest.mark.parametrize(
    "value", [-1, 2**53, True, 1.5, "1"], ids=["negative", "2^53", "bool", "fraction", "string"]
)
def test_seq_out_of_range_or_wrong_type_is_rejected(value: object) -> None:
    case, message = drive_case()
    assert errors_of({**message, "seq": value}, case)


def test_seq_upper_edge_is_accepted() -> None:
    case, message = drive_case()
    assert errors_of({**message, "seq": 2**53 - 1}, case) == []


@pytest.mark.parametrize("field", ["session_id", "freshness_token"], ids=["id", "token"])
@pytest.mark.parametrize("suffix", ["\n", "\n\n", " ", "\r"])
def test_trailing_whitespace_in_patterned_field_is_rejected(field: str, suffix: str) -> None:
    case, message = drive_case()
    assert errors_of({**message, field: message[field] + suffix}, case)


# The strict parser the Pi applies before any schema (02 §10).


@pytest.mark.parametrize(
    "text",
    [
        '{"left": NaN}',
        '{"left": Infinity}',
        '{"left": -Infinity}',
        '{"left": 1e400}',
        '{"left": -1e400}',
        '{"a": {"b": [1, 1e400]}}',
        '{"left": 0.1, "left": 0.2}',
        '{"a": {"b": 1, "b": 1}}',
        '{"left": 0.1',
        "",
    ],
    ids=[
        "nan",
        "inf",
        "minus-inf",
        "1e400",
        "minus-1e400",
        "nested-1e400",
        "duplicate",
        "nested-duplicate",
        "truncated",
        "empty",
    ],
)
def test_strict_parser_rejects(text: str) -> None:
    with pytest.raises(ParseError):
        parse_strict(text)


def test_strict_parser_rejects_integer_too_long_to_convert() -> None:
    """CPython refuses ints over 4300 digits with a bare ValueError; that is a ParseError too."""
    with pytest.raises(ParseError):
        parse_strict('{"seq": ' + "1" * 5000 + "}")


def test_strict_parser_keeps_ordinary_json() -> None:
    assert parse_strict('{"left": -0.7, "seq": 1, "x": [1e300, null, true]}') == {
        "left": -0.7,
        "seq": 1,
        "x": [1e300, None, True],
    }


def test_frame_that_is_not_an_object_is_rejected() -> None:
    for text in ("[]", "1", '"drive"', "null", '{"type": 1}'):
        assert schema_errors(text, "panel", "server"), text
