import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { AgentHostDoctor } from "./doctor.ts";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";

const report = {
  checks: [
    {
      check: "workspace",
      status: "warning",
      name: "Acme",
      trust: "new",
      actions: ["review-trust"],
    },
    {
      check: "sandbox",
      status: "ok",
      capabilities: { files: "shared", strength: "os" },
      actions: [],
    },
  ],
  summary: { problems: 0, warnings: 1, needsFixing: false },
};

verifies("agent-host-client.doctor", () => {
  describe("AgentHostDoctor", () => {
    it("sends the workspace folder and returns the lines with their actions", async () => {
      const host = new FakeHost().answer("POST /v1/doctor", ok(report));

      expect(await new AgentHostDoctor(host).doctor("/work/acme")).toEqual(report);
      expect(host.calls).toEqual([{ route: "POST /v1/doctor", body: { workspace: "/work/acme" } }]);
    });

    it("sends an empty body to check only the computer", async () => {
      const host = new FakeHost().answer("POST /v1/doctor", ok({ ...report, checks: [] }));

      await new AgentHostDoctor(host).doctor();

      expect(host.calls).toEqual([{ route: "POST /v1/doctor", body: {} }]);
    });

    it("throws the host's refusal while another check runs", async () => {
      const host = new FakeHost().answer(
        "POST /v1/doctor",
        refused(429, "busy", "The agent host is already checking."),
      );

      await expect(new AgentHostDoctor(host).doctor()).rejects.toMatchObject({
        status: 429,
        kind: "busy",
      });
    });

    it("refuses a line with an action the engine doesn't know", async () => {
      const odd = { ...report, checks: [{ check: "disk", status: "ok", actions: ["fix-it"] }] };
      const host = new FakeHost().answer("POST /v1/doctor", ok(odd));

      await expect(new AgentHostDoctor(host).doctor()).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });
  });
});
