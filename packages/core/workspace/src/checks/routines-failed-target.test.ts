import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadWorkspace, type WorkspaceIssue } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

/** Each issue as `[file, code, line, message]`, the parts a person reads. */
function shown(issues: readonly WorkspaceIssue[]) {
  return issues.map((issue) => [issue.file, issue.code, issue.line, issue.message]);
}

// A routine that names a hub or an agent whose own file failed gets no error of its own for
// that: the file's errors say what to fix, and a second error would send the user to the
// routine instead (HAL-15207).
verifies("workspace.routines", () => {
  it("gives a root routine nothing when the hub it names has a hub.yaml that fails", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "hubs/billing/hub.yaml": "name: 5\n",
        "hubs/billing/agents/clerk.agent.yaml": "name: Clerk\n",
        "workflows/routines/daily.routine.yaml":
          "name: Daily\ntrigger: { schedule: '@daily' }\nrun: { agent: clerk, hub: billing, prompt: Hello. }\n",
      }),
    );
    expect(shown(workspace.issues)).toEqual([
      ["hubs/billing/hub.yaml", "invalid_type", 1, 'name is text: write "5" in quotes.'],
    ]);
  });

  it("gives a root routine nothing for a hub whose id differs from its folder, but still checks its trigger", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "hubs/billing/hub.yaml": "id: sales\nname: Billing\n",
        "workflows/routines/daily.routine.yaml":
          "name: Daily\ntrigger: { schedule: '61 * * * *' }\nrun: { agent: clerk, hub: billing, prompt: Hello. }\n",
      }),
    );
    expect(shown(workspace.issues)).toEqual([
      [
        "hubs/billing/hub.yaml",
        "id-differs-from-place",
        1,
        "The id is sales, but the folder is hubs/billing/. Use the same name, or leave id out.",
      ],
      [
        "workflows/routines/daily.routine.yaml",
        "bad-trigger",
        2,
        'Routine "daily": Minute: "61" is outside 0-59.',
      ],
    ]);
  });

  it("doesn't ask a root routine for run.hub when the root's only agent fails", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "agents/helper.agent.yaml": "name: Helper\ncolour: blue\n",
        "workflows/routines/daily.routine.yaml":
          "name: Daily\ntrigger: { schedule: '@daily' }\nrun: { agent: helper, prompt: Hello. }\n",
      }),
    );
    expect(shown(workspace.issues)).toEqual([
      [
        "agents/helper.agent.yaml",
        "unrecognized_keys",
        2,
        'There\'s no field "colour" in this file.',
      ],
    ]);
  });
});
