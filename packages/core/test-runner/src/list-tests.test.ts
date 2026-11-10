import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { listWorkspaceTests } from "./list-tests.ts";
import { MemorySource } from "./test/memory-source.ts";

const approvalTest = `workflow: approval
cases:
  - name: approve
    events: [approve]
    expect: { final: approved }
  - name: one day is not enough
    events: [{ advance: 1d }]
    expect: { status: waiting }
`;

const files = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/billing/hub.yaml": "id: billing\nname: Billing\n",
  "hubs/billing/workflows/approval.workflow.yaml": `id: approval
initial: decide
states:
  decide:
    type: wait
    on:
      - { to: approved, event: approve }
      - { to: expired, after: 2d }
  approved: { type: final }
  expired: { type: final }
`,
  "hubs/billing/workflows/approval.test.yaml": approvalTest,
};

const source = new MemorySource(files);
const textOf = (path: string) => source.read(path);

verifies("test-runner.list-tests", () => {
  describe("listWorkspaceTests", () => {
    it("lists every case in file order, with its line", async () => {
      const workspace = await loadWorkspace(source);

      const listed = await listWorkspaceTests({ workspace, textOf });

      expect(listed).toEqual([
        {
          hub: "billing",
          workflow: "approval",
          name: "approve",
          file: "hubs/billing/workflows/approval.test.yaml",
          line: 3,
        },
        {
          hub: "billing",
          workflow: "approval",
          name: "one day is not enough",
          file: "hubs/billing/workflows/approval.test.yaml",
          line: 6,
        },
      ]);
    });

    it("keeps only the case whose name equals the filter's, exactly", async () => {
      const workspace = await loadWorkspace(source);
      const listed = (name: string) => listWorkspaceTests({ workspace, filter: { name } });

      expect((await listed("one day is not enough")).map((test) => test.name)).toEqual([
        "one day is not enough",
      ]);
      expect(await listed("day")).toEqual([]);
      expect(await listed("One day is not enough")).toEqual([]);
    });

    it("keeps nothing when the hub or the workflow differs", async () => {
      const workspace = await loadWorkspace(source);

      expect(await listWorkspaceTests({ workspace, filter: { hub: "support" } })).toEqual([]);
      expect(await listWorkspaceTests({ workspace, filter: { workflow: "invoice" } })).toEqual([]);
      expect(
        await listWorkspaceTests({ workspace, filter: { hub: "billing", workflow: "approval" } }),
      ).toHaveLength(2);
    });

    it("leaves lines out without the file's text", async () => {
      const workspace = await loadWorkspace(source);

      const listed = await listWorkspaceTests({ workspace });

      expect(listed.map((test) => test.line)).toEqual([undefined, undefined]);
      expect(listed[0]).not.toHaveProperty("line");
    });

    it("leaves lines out when the text is gone or no longer reads", async () => {
      const workspace = await loadWorkspace(source);

      const gone = await listWorkspaceTests({ workspace, textOf: async () => null });
      const broken = await listWorkspaceTests({ workspace, textOf: async () => "cases: [" });

      expect(gone.map((test) => test.line)).toEqual([undefined, undefined]);
      expect(broken.map((test) => test.line)).toEqual([undefined, undefined]);
    });

    it("leaves out a test file at the workspace root, which has no hub", async () => {
      const rootSource = new MemorySource({
        ...files,
        "workflows/approval.workflow.yaml": files["hubs/billing/workflows/approval.workflow.yaml"],
        "workflows/approval.test.yaml": approvalTest,
      });
      const workspace = await loadWorkspace(rootSource);

      const listed = await listWorkspaceTests({ workspace });

      expect(listed.map((test) => test.hub)).toEqual(["billing", "billing"]);
    });
  });
});
