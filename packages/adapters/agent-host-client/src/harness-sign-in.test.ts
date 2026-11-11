import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { agentHostHarnesses } from "./harness.ts";

/** An invented agent folder. */
const settingsFolder = "/data/agents/writer";

const options = { bridgeIdOf: () => undefined, environments: {} };

async function claudeCode(host: FakeHost) {
  host.answer("GET /v1/harnesses", ok([{ id: "claude-code", name: "Claude Code" }]));
  const [harness] = await agentHostHarnesses(host, options);
  if (harness === undefined) throw new Error("no harness");
  return harness;
}

verifies("agent-host-client.harness-sign-in", () => {
  describe("openSignIn", () => {
    it("asks the host to open the sign-in for the agent's folder", async () => {
      const host = new FakeHost().answer("POST /v1/harnesses/sign-in", ok({ opened: true }));
      const harness = await claudeCode(host);
      expect(await harness.openSignIn(settingsFolder)).toEqual({ opened: true });
      expect(host.calls).toContainEqual({
        route: "POST /v1/harnesses/sign-in",
        body: { harness: "claude-code", settingsFolder },
      });
    });

    it("answers the command to run by hand when no window opened", async () => {
      const notOpened = {
        opened: false,
        reason: "No terminal was found on this computer.",
        command: `CLAUDE_CONFIG_DIR='${settingsFolder}' claude auth login`,
      };
      const host = new FakeHost().answer("POST /v1/harnesses/sign-in", ok(notOpened));
      const harness = await claudeCode(host);
      expect(await harness.openSignIn(settingsFolder)).toEqual(notOpened);
    });

    it("fails with the host's kind for a harness without a sign-in", async () => {
      const host = new FakeHost().answer(
        "POST /v1/harnesses/sign-in",
        refused(422, "no_sign_in", "Claude Code has no sign-in of its own."),
      );
      const harness = await claudeCode(host);
      await expect(harness.openSignIn(settingsFolder)).rejects.toMatchObject({
        kind: "no_sign_in",
      });
    });

    it("refuses an answer of another shape", async () => {
      const host = new FakeHost().answer("POST /v1/harnesses/sign-in", ok({ opened: false }));
      const harness = await claudeCode(host);
      await expect(harness.openSignIn(settingsFolder)).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });
  });
});
