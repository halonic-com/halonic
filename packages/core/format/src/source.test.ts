import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readSource } from "./source.ts";
import { problemsOf, summary, yaml } from "./test/parse.spec.ts";

function read(syntax: "yaml" | "front-matter", text: string) {
  const result = readSource(syntax, text);
  if (!result.ok) {
    expect.fail(`expected ${syntax} to read, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

verifies("format.parse-file-positions", () => {
  it("reads an empty YAML file as an empty map, with problems at line 1", () => {
    const source = read("yaml", "");
    expect(source.data).toEqual({});
    expect(source.positionOf(["id"])).toEqual({ line: 1, col: 1 });
  });

  it("gives the start of a value, or of its nearest parent", () => {
    const source = read("yaml", yaml("id: acme", "budget:", "  perRun: 2"));
    expect(source.positionOf(["budget", "perRun"])).toEqual({ line: 3, col: 11 });
    expect(source.positionOf(["budget", "currency"])).toEqual({ line: 2, col: 1 });
  });

  it("reports YAML that doesn't parse at its line, with no path", () => {
    const [problem] = problemsOf("workspace", yaml("id: acme", "name: [Acme"));
    expect(problem).toMatchObject({ severity: "error", source: "syntax", path: [] });
    expect(problem?.line).toBeGreaterThanOrEqual(2);
  });

  it("points a missing key of an empty file at line 1", () => {
    expect(summary(problemsOf("workspace", ""))).toEqual([
      "id invalid_type 1",
      "name invalid_type 1",
    ]);
  });

  it("reads front matter and the trimmed body after it", () => {
    const source = read("front-matter", "---\nname: Notes\n---\n\n# Notes\n");
    expect(source.data).toEqual({ name: "Notes", body: "# Notes" });
    expect(source.positionOf(["name"])).toEqual({ line: 2, col: 7 });
    expect(source.positionOf(["body"])).toEqual({ line: 4, col: 1 });
    expect(source.positionOf(["description"])).toEqual({ line: 2, col: 1 });
  });

  it("counts lines with Windows line endings as with \\n", () => {
    const source = read("front-matter", "---\r\nname: Notes\r\ndescription: Short\r\n---\r\nBody");
    expect(source.positionOf(["description"])).toEqual({ line: 3, col: 14 });
    expect(source.data).toMatchObject({ body: "Body" });
  });

  it("reads a file without front matter as only its body, untrimmed", () => {
    const source = read("front-matter", "  # Notes\n");
    expect(source.data).toEqual({ body: "  # Notes\n" });
    expect(source.positionOf(["name"])).toEqual({ line: 1, col: 1 });
  });

  it("keeps front matter that is no map as it is", () => {
    expect(read("front-matter", "---\n- one\n---\nBody").data).toEqual(["one"]);
  });

  it("reports front matter that doesn't parse at its line in the file", () => {
    const result = readSource("front-matter", "---\nname: Notes\nlist: [a\n---\nBody");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.line).toBeGreaterThanOrEqual(3);
  });
});
