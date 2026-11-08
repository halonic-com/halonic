import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCases, readCase } from "./cases.ts";
import { TestFolders } from "./test-folders.ts";

const folders = new TestFolders();
afterEach(() => folders.cleanUp());

const valid = { about: "the base", kind: "workspace", fault: "valid" };
const faulty = {
  about: "a bad type",
  kind: "agent",
  fault: "wrong-type",
  expect: { file: "a.yaml", path: "maxSteps", line: 3 },
};

function caseFolder(description: unknown, files: Record<string, string> = {}): string {
  const folder = folders.make();
  folders.write(folder, { "case.json": JSON.stringify(description) });
  for (const [path, text] of Object.entries(files)) {
    folders.write(folder, { [`files/${path}`]: text });
  }
  return folder;
}

describe("parity.case-description-checked", () => {
  it("reads a case with its expectation and its sorted files", () => {
    const folder = caseFolder(faulty, { "b.yaml": "b", "a/c.yaml": "c" });
    const parityCase = readCase("agent/x", folder);
    expect(parityCase).toEqual({
      id: "agent/x",
      folder,
      about: "a bad type",
      kind: "agent",
      fault: "wrong-type",
      remove: [],
      expect: { file: "a.yaml", path: "maxSteps", line: 3 },
      files: ["a/c.yaml", "b.yaml"],
    });
  });

  it("accepts a valid case without an expectation, and a null line", () => {
    expect(readCase("base", caseFolder(valid)).expect).toBeNull();
    const missing = { ...faulty, expect: { file: "w.yaml", path: "", line: null } };
    expect(readCase("w/missing", caseFolder(missing)).expect?.line).toBeNull();
  });

  it("refuses an unknown fault and names the case", () => {
    expect(() => readCase("agent/typo", caseFolder({ ...faulty, fault: "typo" }))).toThrow(
      /case agent\/typo: unknown fault "typo" \(one of valid, wrong-type/,
    );
  });

  it("refuses a fault without an expectation", () => {
    const { expect: _, ...withoutExpect } = faulty;
    expect(() => readCase("agent/y", caseFolder(withoutExpect))).toThrow(/needs "expect"/);
  });

  it("refuses a line below 1, a missing about, a non-list remove and a non-object", () => {
    const zero = { ...faulty, expect: { ...faulty.expect, line: 0 } };
    expect(() => readCase("a/zero", caseFolder(zero))).toThrow(
      /"expect.line" must be a line number/,
    );
    expect(() => readCase("a/about", caseFolder({ ...valid, about: "" }))).toThrow(/"about"/);
    expect(() => readCase("a/rm", caseFolder({ ...valid, remove: "x.yaml" }))).toThrow(/"remove"/);
    expect(() => readCase("a/list", caseFolder([valid]))).toThrow(/must hold an object/);
    const noPath = { ...faulty, expect: { file: "a.yaml", line: 1 } };
    expect(() => readCase("a/path", caseFolder(noPath))).toThrow(/"expect.path"/);
    expect(() => readCase("a/exp", caseFolder({ ...faulty, expect: 3 }))).toThrow(
      /"expect" must be/,
    );
  });

  it("loads the base first, then the cases by kind and name", () => {
    const fixtures = folders.make();
    const describe = (about: string) => JSON.stringify({ ...valid, about });
    folders.write(fixtures, {
      "base/case.json": describe("base"),
      "cases/routine/b/case.json": describe("b"),
      "cases/agent/a/case.json": describe("a"),
      "cases/agent/0/case.json": describe("0"),
    });
    const ids = loadCases(fixtures).map((parityCase) => parityCase.id);
    expect(ids).toEqual(["base", "agent/0", "agent/a", "routine/b"]);
    expect(loadCases(fixtures)[0]?.folder).toBe(join(fixtures, "base"));
  });
});
