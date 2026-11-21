import { verifies } from "@halonicjs/testing-spec";
import type { LoadedWorkspace, WorkspaceIssue } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { runMessages } from "./messages/run.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { refuseFileProblems, WorkspaceFileProblemsError } from "./workspace-problems.ts";

/** An error the checks found in no file. */
const errorInNoFile: WorkspaceIssue = {
  file: "",
  severity: "error",
  source: "check",
  code: "invalid-value",
  path: [],
  line: 1,
  col: 1,
  message: "Broken",
};

const dir = { root: "acme", shown: "./acme", name: "acme" } as unknown as OpenWorkspaceDir;

verifies("cli.workspace-file-problems", () => {
  // Liam's review of #4496: an empty path read "has 1 problem in . Nothing ran."
  it("says 'in its files' when the error that stops the run is in no file", () => {
    const workspace = { files: [], issues: [errorInNoFile] } as unknown as LoadedWorkspace;

    const refuse = () => refuseFileProblems(dir, workspace, runMessages.nothingRan(), undefined);

    expect(refuse).toThrow(WorkspaceFileProblemsError);
    expect(refuse).toThrow("acme has 1 problem in its files. Nothing ran.");
  });
});
