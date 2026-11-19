import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkLeaveOut, isLeftOut } from "./index.ts";

// The contract suite runs this rule through every store that opts in; this checks the shared helpers on their own.
verifies("ports.definition-store-left-out", () => {
  it("leaves out a folder and what is inside it, and nothing else", () => {
    const leaveOut = { folders: ["repo", "files/agents/coder"] };
    expect(isLeftOut("repo", leaveOut)).toBe(true);
    expect(isLeftOut("repo/src/a.ts", leaveOut)).toBe(true);
    expect(isLeftOut("files/agents/coder/notes.md", leaveOut)).toBe(true);
    expect(isLeftOut("repository.md", leaveOut)).toBe(false);
    expect(isLeftOut("files/agents/coder-2/notes.md", leaveOut)).toBe(false);
    expect(isLeftOut("files/agents", leaveOut)).toBe(false);
    expect(isLeftOut("hubs/a/repo/x.ts", leaveOut)).toBe(false);
  });

  it("compares folders as a file system that ignores case opens them", () => {
    expect(isLeftOut("Repo/a.ts", { folders: ["repo"] })).toBe(true);
    expect(isLeftOut("repo. /a.ts", { folders: ["REPO"] })).toBe(true);
    expect(isLeftOut("re\u200Cpo/a.ts", { folders: ["repo"] })).toBe(true);
  });

  it("leaves out a folder name at any depth", () => {
    const leaveOut = { names: ["node_modules"] };
    expect(isLeftOut("node_modules/x/index.js", leaveOut)).toBe(true);
    expect(isLeftOut("tools/Node_Modules/y.js", leaveOut)).toBe(true);
    expect(isLeftOut("tools/node_modules_notes.md", leaveOut)).toBe(false);
  });

  it("leaves out nothing without a leaveOut", () => {
    expect(isLeftOut("node_modules/x/index.js", undefined)).toBe(false);
    expect(isLeftOut("repo/a.ts", {})).toBe(false);
  });

  it("refuses an unsafe folder or a name that isn't one safe segment", () => {
    for (const leaveOut of [
      { folders: ["a/../b"] },
      { folders: ["/repo"] },
      { folders: [""] },
      { names: ["a/b"] },
      { names: [".."] },
    ]) {
      expect(() => checkLeaveOut(leaveOut), JSON.stringify(leaveOut)).toThrow(RangeError);
    }
    expect(() =>
      checkLeaveOut({ folders: ["files/agents/coder"], names: ["node_modules"] }),
    ).not.toThrow();
    expect(() => checkLeaveOut(undefined)).not.toThrow();
  });
});
