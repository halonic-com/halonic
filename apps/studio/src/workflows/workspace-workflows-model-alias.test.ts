import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup } from "./workspace-workflows.test-helper.ts";

verifies("studio.workspace-workflows", () => {
  describe("an agent's model alias (HAL-14323, S12)", () => {
    /** Acme's Writer with `model: alias`, run by the workflow's one step, and `default` in models.yaml. */
    function withWriter(alias: string) {
      const made = setup();
      Object.assign(made.store, {
        "models.yaml": "aliases:\n  default:\n    provider: mock\n    model: echo\n",
        "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
        "hubs/acme/agents/writer.agent.yaml": `id: writer\nname: Writer\nmodel: ${alias}\ninstructions: Write.\n`,
        "hubs/acme/workflows/reply.workflow.yaml":
          "id: reply\nname: Reply\ninitial: draft\nstates:\n  draft:\n    agent: writer\n    on:\n      - to: done\n  done:\n    type: final\n",
      });
      return made;
    }

    it("finds no problem for an alias models.yaml has", async () => {
      const { host } = withWriter("default");

      const settings = await host.configuration({ hubId: "acme", id: "reply" });
      const [listing] = await host.list();

      expect(settings.problems).toEqual([]);
      expect(listing?.problems.errors).toBe(0);
    });

    it("still gives an alias models.yaml doesn't have as an error of the workflow that runs the agent", async () => {
      const { host } = withWriter("smrt");

      const settings = await host.configuration({ hubId: "acme", id: "reply" });

      expect(settings.problems).toContainEqual(
        expect.objectContaining({
          severity: "error",
          message: 'Agent "writer" uses unknown model alias "smrt"',
        }),
      );
    });
  });
});
