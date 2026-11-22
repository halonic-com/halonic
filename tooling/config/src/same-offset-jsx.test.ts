import { describe, expect, it } from "vitest";
import { parseAstAsync } from "vitest/node";
import { sameOffsetJavaScript } from "./same-offset-jsx.ts";

/** The pieces of code that must stay at their offsets: everything that can run. */
async function expectSameOffsets(
  source: string,
  kept: readonly string[],
  language: "jsx" | "tsx" = "tsx",
): Promise<string> {
  const result = await sameOffsetJavaScript(source, language);
  expect(result).toHaveLength(source.length);
  expect(result.split("\n").length).toBe(source.split("\n").length);
  for (const code of kept) {
    const offset = source.indexOf(code);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(result.slice(offset, offset + code.length)).toBe(code);
  }
  // Parsed the way Vitest's V8 provider parses: as plain JavaScript.
  await expect(parseAstAsync(result)).resolves.toBeDefined();
  return result;
}

describe("sameOffsetJavaScript", () => {
  it("strips the types and turns an element into an array holding its expressions", async () => {
    const source = [
      'import type { ReactElement } from "react";',
      "export function page(title: string): ReactElement {",
      '  return <main className="page" data-title={title.trim()}>{title.length}</main>;',
      "}",
      "",
    ].join("\n");
    const result = await expectSameOffsets(source, ["title.trim()", "title.length"]);
    expect(result).not.toContain("ReactElement");
    expect(result).not.toContain("<");
  });

  it("keeps elements next to each other apart, and the expressions between them", async () => {
    const source = [
      "export const list = (items: readonly string[]) => (",
      "  <ul>",
      "    <li/><li>first</li>{items.length}<></>",
      "    {items.map((item) => <li key={item}>{item.toUpperCase()}</li>)}",
      "  </ul>",
      ");",
      "",
    ].join("\n");
    await expectSameOffsets(source, ["items.length", "items.map((item) => ", "item.toUpperCase()"]);
  });

  it("keeps spreads, and a comment as a comment, so a coverage hint in it still counts", async () => {
    const source = [
      "export const card = (props: object, rest: string[]) => (",
      "  <section {...props}>{/* v8 ignore next */}{...rest}</section>",
      ");",
      "",
    ].join("\n");
    await expectSameOffsets(source, ["...props", "/* v8 ignore next */", "...rest"]);
  });

  it("keeps an element given as an attribute's value, and one in a condition", async () => {
    const source = [
      "export const row = (open: boolean) => (",
      "  <Row icon=<Icon /> end={open && <Close onClick={() => open} />} />",
      ");",
      "",
    ].join("\n");
    await expectSameOffsets(source, ["open && ", "() => open"]);
  });

  it("counts offsets the way V8 does, in UTF-16 units, after text outside the basic plane", async () => {
    const source = 'export const note = (n: number) => <p title="🧪 é">{n + 1}</p>;\n';
    await expectSameOffsets(source, ["n + 1"]);
  });

  it("reads a .jsx source as JavaScript, with nothing to strip", async () => {
    const source = "export const tag = (name) => <b>{name}</b>;\n";
    await expectSameOffsets(source, ["(name) => ", "name"], "jsx");
  });

  it("leaves code without JSX as Node's type stripping does", async () => {
    const source = "export const double = (value: number): number => value * 2;\n";
    const result = await expectSameOffsets(source, ["value * 2"]);
    expect(result).toBe("export const double = (value        )         => value * 2;\n");
  });

  it("refuses a source that doesn't parse, or has TypeScript Node can't strip", async () => {
    await expect(sameOffsetJavaScript("export const broken = <b>;\n", "tsx")).rejects.toThrow();
    await expect(sameOffsetJavaScript("export enum Size { Small }\n", "tsx")).rejects.toThrow();
  });
});
