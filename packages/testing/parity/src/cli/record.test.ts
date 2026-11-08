import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Recording } from "../recording.ts";
import { fakeOldRepo } from "../test/fake-old-repo.ts";
import { TestFolders } from "../test-folders.ts";
import { main } from "./record.ts";

const folders = new TestFolders();
afterEach(() => folders.cleanUp());

let printed: string[];
beforeEach(() => {
  printed = [];
  const keep = (...args: unknown[]): void => {
    printed.push(args.join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(keep);
  vi.spyOn(console, "error").mockImplementation(keep);
});

/**
 * A base of two files and two cases: an agent whose bad key the old loader
 * puts on another line than the fixture says, and a missing workspace file.
 */
function fixtures(): string {
  const folder = folders.make();
  folders.write(folder, {
    "base/case.json": JSON.stringify({ about: "base", kind: "workspace", fault: "valid" }),
    "base/files/workspace.yaml": "id: acme\n",
    "base/files/agent.yaml": "name: helper\n",
    "cases/agent/bad-name/case.json": JSON.stringify({
      about: "a name that is no number",
      kind: "agent",
      fault: "wrong-type",
      expect: { file: "agent.yaml", path: "name", line: 2 },
    }),
    "cases/agent/bad-name/files/agent.yaml": "name: BAD\n",
    "cases/workspace/gone/case.json": JSON.stringify({
      about: "no workspace file",
      kind: "workspace",
      fault: "missing-required",
      remove: ["workspace.yaml"],
      expect: { file: "workspace.yaml", path: "", line: null },
    }),
  });
  return folder;
}

function recording(folder: string): Recording {
  return JSON.parse(readFileSync(join(folder, "recorded.json"), "utf8")) as Recording;
}

describe("parity.recording-is-machine-free", () => {
  it("writes a recording for every case, with the scratch folder replaced", () => {
    const { clone, head } = fakeOldRepo(folders);
    const fixtureFolder = fixtures();
    expect(main(["--old", clone], { fixtures: fixtureFolder, reference: head })).toBe(0);
    expect(printed).toContain("Recorded 3 case(s) from the old repo.");

    const base = recording(join(fixtureFolder, "base"));
    expect(base.reference).toBe("784f78d");
    expect(base.valid).toBe(true);
    expect(base.files.map((f) => [f.file, f.status])).toEqual([
      ["agent.yaml", "pass"],
      ["workspace.yaml", "pass"],
    ]);
    expect(base.validate).toEqual({
      exitCode: 1,
      stdout: "checked <workspace>\n",
      stderr: "1 problem\n",
    });
    const text = readFileSync(join(fixtureFolder, "base/recorded.json"), "utf8");
    expect(text).toBe(`${JSON.stringify(base, null, 2)}\n`);
  });

  it("records only the cases asked for, and leaves the line notes alone", () => {
    const { clone, head } = fakeOldRepo(folders);
    const fixtureFolder = fixtures();
    const argv = ["--old", clone, "--case", "agent/bad-name"];
    expect(main(argv, { fixtures: fixtureFolder, reference: head })).toBe(0);
    expect(printed).toContain("Recorded 1 case(s) from the old repo.");
    expect(existsSync(join(fixtureFolder, "cases/agent/bad-name/recorded.json"))).toBe(true);
    expect(existsSync(join(fixtureFolder, "base/recorded.json"))).toBe(false);
    expect(existsSync(join(fixtureFolder, "old-line-notes.json"))).toBe(false);
  });
});

describe("parity.line-verdict", () => {
  it("records each case's verdict and lists only the differing lines in the notes", () => {
    const { clone, head } = fakeOldRepo(folders);
    const fixtureFolder = fixtures();
    expect(main(["--old", clone], { fixtures: fixtureFolder, reference: head })).toBe(0);

    const badName = recording(join(fixtureFolder, "cases/agent/bad-name"));
    expect(badName.valid).toBe(false);
    expect(badName.files).toEqual([
      expect.objectContaining({ file: "agent.yaml", status: "fail", schema: "agent" }),
    ]);
    expect(badName.line).toEqual({ expected: 2, recorded: 1, verdict: "different" });
    const gone = recording(join(fixtureFolder, "cases/workspace/gone"));
    expect(gone.line).toEqual({ expected: null, recorded: null, verdict: "same" });

    const notes: unknown = JSON.parse(
      readFileSync(join(fixtureFolder, "old-line-notes.json"), "utf8"),
    );
    expect(notes).toEqual([
      {
        case: "agent/bad-name",
        about: "a name that is no number",
        file: "agent.yaml",
        expected: 2,
        recorded: 1,
        verdict: "different",
      },
    ]);
  });
});

describe("parity.record-only-from-reference", () => {
  it("shows how to call it when no clone is given", () => {
    const setup = { fixtures: fixtures(), reference: "0".repeat(40) };
    expect(main([], setup)).toBe(2);
    expect(main(["--old"], setup)).toBe(2);
    expect(printed[0]).toMatch(/^Usage: record --old /);
  });

  it("records nothing from a clone at another commit and says why", () => {
    const { clone } = fakeOldRepo(folders);
    const fixtureFolder = fixtures();
    expect(main(["--old", clone], { fixtures: fixtureFolder, reference: "0".repeat(40) })).toBe(1);
    expect(printed[0]).toContain(`Cannot record from ${clone}:`);
    expect(printed[0]).toContain("not at the reference 0000000");
    expect(existsSync(join(fixtureFolder, "base/recorded.json"))).toBe(false);
  });

  it("fails without writing when the old runner fails", () => {
    const { clone, head } = fakeOldRepo(folders, ["Hub"]);
    const fixtureFolder = fixtures();
    expect(() => main(["--old", clone], { fixtures: fixtureFolder, reference: head })).toThrow(
      /^The old runner failed \(exit 1\)$/,
    );
    expect(existsSync(join(fixtureFolder, "base/recorded.json"))).toBe(false);
  });
});
