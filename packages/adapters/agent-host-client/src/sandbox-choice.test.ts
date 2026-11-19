import type { SandboxChoice } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostSandboxChoice } from "./sandbox-choice.ts";

const choice: SandboxChoice = {
  active: null,
  setting: { backend: "srt", chosenAt: "2026-11-16T09:00:00.000Z" },
  backends: [
    {
      id: "srt",
      offered: true,
      state: "check-failed",
      reason: "did-not-start",
      setup: null,
      missing: ["The canary for this backend isn't built yet."],
      limits: ["project-folder-writable"],
      residuals: [],
    },
  ],
};

verifies("agent-host-client.sandbox-choice", () => {
  describe("AgentHostSandboxChoice", () => {
    it("reads the latest choice from the host", async () => {
      const host = new FakeHost().answer("GET /v1/sandbox/choice", ok(choice));
      expect(await new AgentHostSandboxChoice(host).choice()).toEqual(choice);
    });

    it("asks the host to choose again, sending no setting", async () => {
      const host = new FakeHost().answer("POST /v1/sandbox/choice/settings-changed", ok(choice));
      expect(await new AgentHostSandboxChoice(host).settingsChanged()).toEqual(choice);
      expect(host.calls).toEqual([{ route: "POST /v1/sandbox/choice/settings-changed", body: {} }]);
    });

    it("throws the host's refusal when it can't read the saved setting", async () => {
      const host = new FakeHost().answer(
        "GET /v1/sandbox/choice",
        refused(500, "sandbox_choice_failed", "The saved setting isn't valid."),
      );
      await expect(new AgentHostSandboxChoice(host).choice()).rejects.toMatchObject({
        status: 500,
        kind: "sandbox_choice_failed",
      });
    });

    it("refuses a backend state or reason the engine doesn't know", async () => {
      const odd = { ...choice, backends: [{ ...choice.backends[0], state: "fine" }] };
      const host = new FakeHost().answer("GET /v1/sandbox/choice", ok(odd));
      await expect(new AgentHostSandboxChoice(host).choice()).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });
  });
});
