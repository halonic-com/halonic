import type { SandboxBackendId, SandboxChoice } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostSandboxChoice, type SandboxChoiceSave } from "./sandbox-choice.ts";
import { AgentHostError } from "./transport.ts";

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

/** For the tests that only read the choice: saving fails the test. */
const unusedSave: SandboxChoiceSave = () => Promise.reject(new Error("nothing should save here"));

/** A shell that answers each save with `answer` and keeps the backends it was asked to save. */
function savingShell(answer: () => ReturnType<SandboxChoiceSave>) {
  const saved: (SandboxBackendId | "none" | null)[] = [];
  const save: SandboxChoiceSave = (backend) => {
    saved.push(backend);
    return answer();
  };
  return { saved, save };
}

verifies("agent-host-client.sandbox-choice", () => {
  describe("AgentHostSandboxChoice", () => {
    it("reads the latest choice from the host", async () => {
      const host = new FakeHost().answer("GET /v1/sandbox/choice", ok(choice));
      expect(await new AgentHostSandboxChoice(host, unusedSave).choice()).toEqual(choice);
    });

    it("asks the host to choose again, sending no setting", async () => {
      const host = new FakeHost().answer("POST /v1/sandbox/choice/settings-changed", ok(choice));
      expect(await new AgentHostSandboxChoice(host, unusedSave).settingsChanged()).toEqual(choice);
      expect(host.calls).toEqual([{ route: "POST /v1/sandbox/choice/settings-changed", body: {} }]);
    });

    it("throws the host's refusal when it can't read the saved setting", async () => {
      const host = new FakeHost().answer(
        "GET /v1/sandbox/choice",
        refused(500, "sandbox_choice_failed", "The saved setting isn't valid."),
      );
      await expect(new AgentHostSandboxChoice(host, unusedSave).choice()).rejects.toMatchObject({
        status: 500,
        kind: "sandbox_choice_failed",
      });
    });

    it("refuses a backend state or reason the engine doesn't know", async () => {
      const odd = { ...choice, backends: [{ ...choice.backends[0], state: "fine" }] };
      const host = new FakeHost().answer("GET /v1/sandbox/choice", ok(odd));
      await expect(new AgentHostSandboxChoice(host, unusedSave).choice()).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });
  });
});

verifies("agent-host-client.sandbox-choice-save", () => {
  describe("AgentHostSandboxChoice.save", () => {
    it("saves through the shell and answers the choice after it, sending the host nothing", async () => {
      const saved = { ...choice, active: "srt" as const };
      const host = new FakeHost();
      const shell = savingShell(async () => ok(saved));

      expect(await new AgentHostSandboxChoice(host, shell.save).save("srt")).toEqual(saved);
      expect(shell.saved).toEqual(["srt"]);
      expect(host.calls).toEqual([]);
    });

    it("removes the choice for null", async () => {
      const removed = { ...choice, setting: null };
      const shell = savingShell(async () => ok(removed));

      expect(await new AgentHostSandboxChoice(new FakeHost(), shell.save).save(null)).toEqual(
        removed,
      );
      expect(shell.saved).toEqual([null]);
    });

    it("throws the shell's refusal of a backend", async () => {
      const shell = savingShell(() =>
        Promise.reject(new AgentHostError(0, "invalid_choice", "not a sandbox backend")),
      );

      await expect(
        new AgentHostSandboxChoice(new FakeHost(), shell.save).save("none"),
      ).rejects.toMatchObject({ status: 0, kind: "invalid_choice" });
    });

    it("throws the host's refusal and an answer of another shape", async () => {
      const answers = [
        refused(500, "sandbox_choice_failed", "The saved setting isn't valid."),
        ok({ ...choice, active: "elsewhere" }),
      ];
      const shell = savingShell(async () => answers.shift() ?? ok(choice));
      const sandboxChoice = new AgentHostSandboxChoice(new FakeHost(), shell.save);

      await expect(sandboxChoice.save("srt")).rejects.toMatchObject({
        status: 500,
        kind: "sandbox_choice_failed",
      });
      await expect(sandboxChoice.save("srt")).rejects.toMatchObject({ kind: "answer_invalid" });
    });
  });
});
