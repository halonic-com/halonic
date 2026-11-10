import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

const source = join(import.meta.dirname, "..");

/**
 * Where a sentence the user reads may not be written: every command, and
 * `printError` (Liam on HAL-2194, cli-output section 5, checklist item 2).
 * Their sentences come from `src/messages`.
 */
const checked = [...sourceFiles(join(source, "commands")), join(source, "print-error.ts")];

/**
 * Two words of letters with a space between them, such as "Wrote the": text
 * a person reads. Names a program reads are one word each: JSON field names,
 * flags such as `--json`, file names such as `agent.schema.json`.
 */
const sentence = /\p{L}{2,}[  ]+\p{L}{2,}/u;

verifies("cli.messages", () => {
  it("finds no sentence written inline in a command or in printError", () => {
    const found = checked.flatMap((file) =>
      textsIn(file)
        .filter(({ text }) => sentence.test(text))
        .map(({ text, line }) => `${relative(source, file)}:${line}: ${JSON.stringify(text)}`),
    );
    expect(found).toEqual([]);
  });

  it("finds a sentence written inline", () => {
    const code = [
      "// A comment may say anything at all.",
      'const field = { count: 1, name: "count" };',
      "const line = `Wrote ${count > 1 ? `${count} files` : 'one file'} to the folder.`;",
    ].join("\n");
    const texts = textsOf(code).map(({ text }) => text);
    expect(texts).toEqual(["count", "Wrote ", "", " files", "one file", " to the folder."]);
    expect(texts.filter((text) => sentence.test(text))).toEqual(["one file", " to the folder."]);
  });
});

/** The `.ts` files under `folder`, without their tests. */
function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => join(folder, name));
}

interface Text {
  readonly text: string;
  readonly line: number;
}

function textsIn(file: string): Text[] {
  return textsOf(readFileSync(file, "utf8"));
}

/**
 * Every string and every text piece of a template in the code, with comments
 * skipped. A small scanner, not a parser: a regular expression holding a
 * quote would confuse it, and none of the checked files has one.
 */
function textsOf(code: string): Text[] {
  const scanner = new TextScanner(code);
  while (!scanner.done()) {
    scanner.step();
  }
  return scanner.texts;
}

/** Walks code one token at a time, collecting the texts of its strings and templates. */
class TextScanner {
  readonly texts: Text[] = [];
  // For each template whose `${` is open, how many `{` inside it are still open.
  private readonly openTemplates: number[] = [];
  private index = 0;
  private readonly code: string;

  constructor(code: string) {
    this.code = code;
  }

  done(): boolean {
    return this.index >= this.code.length;
  }

  step(): void {
    const char = this.code[this.index] ?? "";
    if (this.code.startsWith("//", this.index)) {
      this.skipPast("\n");
    } else if (this.code.startsWith("/*", this.index)) {
      this.skipPast("*/");
    } else if (char === '"' || char === "'" || char === "`") {
      this.index += 1;
      this.readText(char);
    } else if (char === "}" && this.openTemplates.at(-1) === 0) {
      // The `}` that ends a template's `${`: its text goes on.
      this.openTemplates.pop();
      this.index += 1;
      this.readText("`");
    } else {
      this.countBrace(char);
      this.index += 1;
    }
  }

  /** Moves past the next `end`, or to the end of the code when there's none. */
  private skipPast(end: string): void {
    const at = this.code.indexOf(end, this.index);
    this.index = at === -1 ? this.code.length : at + end.length;
  }

  /** Keeps count of the braces inside a template's `${`, so its own `}` is found. */
  private countBrace(char: string): void {
    const depth = this.openTemplates.at(-1);
    if (depth === undefined) {
      return;
    }
    if (char === "{") {
      this.openTemplates[this.openTemplates.length - 1] = depth + 1;
    } else if (char === "}") {
      this.openTemplates[this.openTemplates.length - 1] = depth - 1;
    }
  }

  /** Reads text up to `end`, past escaped characters; a template's text also ends at `${`. */
  private readText(end: string): void {
    const start = this.index;
    while (this.index < this.code.length && this.code[this.index] !== end) {
      if (end === "`" && this.code.startsWith("${", this.index)) {
        this.openTemplates.push(0);
        this.addText(start);
        this.index += 2;
        return;
      }
      this.index += this.code[this.index] === "\\" ? 2 : 1;
    }
    this.addText(start);
    this.index += 1;
  }

  private addText(start: number): void {
    const line = this.code.slice(0, start).split("\n").length;
    this.texts.push({ text: this.code.slice(start, this.index), line });
  }
}
