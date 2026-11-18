import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostError } from "./transport.ts";
import { AgentHostUnfencedRuns } from "./unfenced-runs.ts";

const allowedAt = "2026-11-18T09:00:00.000Z";

verifies("agent-host-client.unfenced-runs", () => {
  describe("AgentHostUnfencedRuns", () => {
    it("answers the host's status as codes", async () => {
      const host = new FakeHost().answer(
        "GET /v1/unfenced-runs",
        ok({ run: "needs-yes", reason: "container" }),
      );
      expect(await new AgentHostUnfencedRuns(host).status()).toEqual({
        run: "needs-yes",
        reason: "container",
      });
    });

    it("fails on a status with an extra field", async () => {
      const host = new FakeHost().answer(
        "GET /v1/unfenced-runs",
        ok({ run: "fenced", message: "Runs in the sandbox." }),
      );
      const failure = await new AgentHostUnfencedRuns(host)
        .status()
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AgentHostError);
      expect((failure as AgentHostError).kind).toBe("answer_invalid");
    });

    it("sends only the reason shown, and answers the saved yes", async () => {
      const saved = { run: "allowed", reason: "container", allowedAt };
      const host = new FakeHost().answer("POST /v1/unfenced-runs/allow", ok(saved));
      expect(await new AgentHostUnfencedRuns(host).allow("container")).toEqual(saved);
      expect(host.calls).toEqual([
        { route: "POST /v1/unfenced-runs/allow", body: { reason: "container" } },
      ]);
    });

    it("answers null when the reason changed, so Studio reads the status again", async () => {
      const host = new FakeHost().answer(
        "POST /v1/unfenced-runs/allow",
        refused(409, "reason_changed", "The reason isn't the current one."),
      );
      expect(await new AgentHostUnfencedRuns(host).allow("container")).toBeNull();
    });

    it("sends an empty body on Take back, and fails with the host's kind", async () => {
      const host = new FakeHost().answer(
        "POST /v1/unfenced-runs/take-back",
        refused(500, "take_back_incomplete", "Some plugins didn't stop."),
      );
      const failure = await new AgentHostUnfencedRuns(host)
        .takeBack()
        .catch((error: unknown) => error);
      expect((failure as AgentHostError).kind).toBe("take_back_incomplete");
      expect(host.calls).toEqual([{ route: "POST /v1/unfenced-runs/take-back", body: {} }]);
    });
  });
});
