/** A frame that is not acceptable JSON for the protocol, before any schema (docs/spec/02 §10). */
export class StrictJsonError extends Error {}

const WHITESPACE = /[ \t\n\r]*/y;
const STRING = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
const LITERAL = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null/y;

/**
 * Walks the text once to find duplicate object keys, which `JSON.parse` would silently resolve
 * to the last value. Syntax errors are left to `JSON.parse`, which runs afterwards.
 */
class DuplicateKeyScanner {
  private position = 0;

  constructor(private readonly text: string) {}

  scan(): void {
    this.value();
  }

  private skip(pattern: RegExp): string | null {
    pattern.lastIndex = this.position;
    const match = pattern.exec(this.text);
    if (match === null) {
      return null;
    }
    this.position = pattern.lastIndex;
    return match[0];
  }

  private peek(): string | undefined {
    this.skip(WHITESPACE);
    return this.text[this.position];
  }

  private value(): void {
    switch (this.peek()) {
      case "{":
        this.object();
        return;
      case "[":
        this.array();
        return;
      case '"':
        this.skip(STRING);
        return;
      default:
        this.skip(LITERAL);
    }
  }

  private object(): void {
    this.position += 1;
    const keys = new Set<string>();
    if (this.peek() === "}") {
      this.position += 1;
      return;
    }
    for (;;) {
      if (this.peek() !== '"') {
        return;
      }
      const raw = this.skip(STRING);
      if (raw === null) {
        return;
      }
      const key = JSON.parse(raw) as string;
      if (keys.has(key)) {
        throw new StrictJsonError(`duplicate key ${raw}`);
      }
      keys.add(key);
      if (this.peek() !== ":") {
        return;
      }
      this.position += 1;
      this.value();
      const next = this.peek();
      this.position += 1;
      if (next !== ",") {
        return;
      }
    }
  }

  private array(): void {
    this.position += 1;
    if (this.peek() === "]") {
      this.position += 1;
      return;
    }
    for (;;) {
      this.value();
      const next = this.peek();
      this.position += 1;
      if (next !== ",") {
        return;
      }
    }
  }
}

function rejectNonFinite(_key: string, value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new StrictJsonError("number out of the float range");
  }
  return value;
}

/**
 * The parse both receivers apply (docs/spec/02 §10): `JSON.parse` already refuses `NaN` and
 * `Infinity`; this also refuses duplicate keys and numbers like `1e400` that overflow.
 */
export function parseStrict(text: string): unknown {
  new DuplicateKeyScanner(text).scan();
  try {
    return JSON.parse(text, rejectNonFinite);
  } catch (error) {
    if (error instanceof StrictJsonError) {
      throw error;
    }
    throw new StrictJsonError(error instanceof Error ? error.message : String(error));
  }
}
