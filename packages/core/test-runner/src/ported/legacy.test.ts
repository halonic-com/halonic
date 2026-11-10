// The old runner's legacy suite loaded a workspace from before the renames
// (`org.yaml`, `projects/`, `flows/` and `flow:` keys) and passed its test.
// The new loader reads only the current layout, so such a workspace runs no
// test: see "Differences from the old runner" in the README. Migrating old
// files and old run logs is not the runner's job.

import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { fakeDeps } from "../test/fakes.ts";
import { MemorySource } from "../test/memory-source.ts";

const beforeTheRenames = {
  "org.yaml": "id: o\nname: O\n",
  "projects/p/project.yaml": "name: P\n",
  "projects/p/agents/a.agent.yaml": "name: A\n",
  "projects/p/flows/greet.flow.yaml":
    "name: Greet\ninitial: s\nstates:\n  s: { agent: a, output: out, on: [{ to: end }] }\n  end: { type: final }\n",
  "projects/p/flows/greet.test.yaml":
    "flow: greet\ncases:\n  - name: echo\n    mocks: { a: [hello] }\n    expect: { final: end, context: { out: hello } }\n",
};

verifies("test-runner.old-suites", () => {
  describe("workspaces from before the renames", () => {
    it("run no test, and the loader says the workspace file is missing", async () => {
      const workspace = await loadWorkspace(new MemorySource(beforeTheRenames));

      const suite = await runWorkspaceTests({ workspace }, fakeDeps());

      expect(workspace.issues.map((issue) => issue.code)).toEqual(["missing-workspace-file"]);
      expect(suite).toMatchObject({ tests: [], passed: 0, failed: 0 });
    });
  });
});
