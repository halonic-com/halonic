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
  const texts: Text[] = [];
  // For each template whose `${` is open, how many `{` inside it are still open.
  const openTemplates: number[] = [];
  let index = 0;
  const lineAt = (position: number) => code.slice(0, position).split("\n").length;

  /** Reads text up to `end`, past escaped characters; a template's text also ends at `${`. */
  const readText = (end: string): void => {
    const start = index;
    while (index < code.length && code[index] !== end) {
      if (end === "`" && code.startsWith("${", index)) {
        openTemplates.push(0);
        texts.push({ text: code.slice(start, index), line: lineAt(start) });
        index += 2;
        return;
      }
      index += code[index] === "\\" ? 2 : 1;
    }
    texts.push({ text: code.slice(start, index), line: lineAt(start) });
    index += 1;
  };

  while (index < code.length) {
    const char = code[index] ?? "";
    if (code.startsWith("//", index)) {
      index = code.indexOf("\n", index) === -1 ? code.length : code.indexOf("\n", index);
    } else if (code.startsWith("/*", index)) {
      index = code.indexOf("*/", index) + 2;
    } else if (char === '"' || char === "'" || char === "`") {
      index += 1;
      readText(char);
    } else if (char === "{" && openTemplates.length > 0) {
      openTemplates[openTemplates.length - 1] = (openTemplates.at(-1) ?? 0) + 1;
      index += 1;
    } else if (char === "}" && openTemplates.at(-1) === 0) {
      // The `}` that ends a template's `${`: its text goes on.
      openTemplates.pop();
      index += 1;
      readText("`");
    } else {
      if (char === "}" && openTemplates.length > 0) {
        openTemplates[openTemplates.length - 1] = (openTemplates.at(-1) ?? 1) - 1;
      }
      index += 1;
    }
  }
  return texts;
}
