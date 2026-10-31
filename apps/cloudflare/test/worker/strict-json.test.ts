import { describe, expect, it } from "vitest";
import { parseStrict, StrictJsonError } from "../../src/worker/strict-json";

describe("parseStrict", () => {
  it.each([
    ["nan", '{"left": NaN}'],
    ["inf", '{"left": Infinity}'],
    ["minus-inf", '{"left": -Infinity}'],
    ["1e400", '{"left": 1e400}'],
    ["minus-1e400", '{"left": -1e400}'],
    ["nested-1e400", '{"a": {"b": [1, 1e400]}}'],
    ["duplicate", '{"left": 0.1, "left": 0.2}'],
    ["nested-duplicate", '{"a": {"b": 1, "b": 1}}'],
    ["duplicate-after-escape", '{"left": 1, "\\u006ceft": 2}'],
    ["duplicate-in-array-element", '[{"x": 1}, {"x": 1, "x": 2}]'],
    ["truncated", '{"left": 0.1'],
    ["empty", ""],
  ])("rejects %s", (_name, text) => {
    expect(() => parseStrict(text)).toThrow(StrictJsonError);
  });

  it("keeps ordinary JSON", () => {
    expect(parseStrict('{"left": -0.7, "seq": 1, "x": [1e300, null, true, "a,b:}"]}')).toEqual({
      left: -0.7,
      seq: 1,
      x: [1e300, null, true, "a,b:}"],
    });
  });

  it("allows the same key in sibling objects", () => {
    expect(parseStrict('[{"x": 1}, {"x": 2}]')).toEqual([{ x: 1 }, { x: 2 }]);
  });
});
