import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostIntegrationSignIns } from "./integration-sign-in.ts";

const statusRoute = "POST /v1/integrations/sign-in/status";
const startRoute = "POST /v1/integrations/sign-in/start";
const cancelRoute = "POST /v1/integrations/sign-in/cancel";
const signOutRoute = "POST /v1/integrations/sign-in/sign-out";

verifies("agent-host-client.integration-sign-in", () => {
  describe("status", () => {
    it("asks with the integration's name and answers each sign-in's state", async () => {
      const host = new FakeHost().answer(
        statusRoute,
        ok({ signIns: [{ signIn: "account", state: "signedIn" }] }),
      );

      const answer = await new AgentHostIntegrationSignIns(host).status("gitlab");

      expect(answer).toEqual([{ signIn: "account", state: "signedIn" }]);
      expect(host.calls).toEqual([{ route: statusRoute, body: { integration: "gitlab" } }]);
    });

    it("carries how the last sign-in ended", async () => {
      const cancelled = { kind: "cancelled", signIn: "account" };
      const signedIn = {
        kind: "signedIn",
        signIn: "other",
        missingScopes: ["write"],
        extraScopes: [],
        previousGrant: "notConfirmed",
      };
      const failedAtProvider = {
        kind: "providerError",
        signIn: "third",
        errorCode: "server_error",
      };
      const host = new FakeHost().answer(
        statusRoute,
        ok({
          signIns: [
            { signIn: "account", state: "signedOut", lastOutcome: cancelled },
            { signIn: "other", state: "signedIn", lastOutcome: signedIn },
            { signIn: "third", state: "approvalChanged", lastOutcome: failedAtProvider },
          ],
        }),
      );

      const answer = await new AgentHostIntegrationSignIns(host).status("gitlab");

      expect(answer.map((each) => each.lastOutcome)).toEqual([
        cancelled,
        signedIn,
        failedAtProvider,
      ]);
    });

    it("fails with answer_invalid for a state it doesn't know", async () => {
      const host = new FakeHost().answer(
        statusRoute,
        ok({ signIns: [{ signIn: "account", state: "halfSignedIn" }] }),
      );

      await expect(new AgentHostIntegrationSignIns(host).status("gitlab")).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });

    it("fails with answer_invalid for an outcome it doesn't know", async () => {
      const host = new FakeHost().answer(
        statusRoute,
        ok({
          signIns: [
            { signIn: "account", state: "signedOut", lastOutcome: { kind: "maybe", signIn: "x" } },
          ],
        }),
      );

      await expect(new AgentHostIntegrationSignIns(host).status("gitlab")).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });

    it("fails with the host's kind for an integration it runs no sign-ins for", async () => {
      const host = new FakeHost().answer(
        statusRoute,
        refused(
          404,
          "unknown_integration",
          "The agent host runs no sign-ins for this integration.",
        ),
      );

      await expect(new AgentHostIntegrationSignIns(host).status("gitlab")).rejects.toMatchObject({
        status: 404,
        kind: "unknown_integration",
      });
    });
  });

  describe("start", () => {
    it("asks with the two names and answers the address to open", async () => {
      const authorizeUrl = "https://auth.example.com/authorize?client_id=one";
      const host = new FakeHost().answer(startRoute, ok({ authorizeUrl }));

      const answer = await new AgentHostIntegrationSignIns(host).start("gitlab", "account");

      expect(answer).toBe(authorizeUrl);
      expect(host.calls).toEqual([
        { route: startRoute, body: { integration: "gitlab", signIn: "account" } },
      ]);
    });

    it("fails with the host's kind when the client secret isn't set", async () => {
      const host = new FakeHost().answer(
        startRoute,
        refused(422, "client_secret_missing", "The client secret this sign-in needs isn't set."),
      );

      await expect(
        new AgentHostIntegrationSignIns(host).start("gitlab", "account"),
      ).rejects.toMatchObject({ status: 422, kind: "client_secret_missing" });
    });

    it("fails with answer_invalid for an answer that isn't a start's", async () => {
      const host = new FakeHost().answer(startRoute, ok({ authUrl: "https://auth.example.com" }));

      await expect(
        new AgentHostIntegrationSignIns(host).start("gitlab", "account"),
      ).rejects.toMatchObject({ kind: "answer_invalid" });
    });
  });

  describe("cancel", () => {
    it("asks with the two names and succeeds on 204", async () => {
      const host = new FakeHost().answer(cancelRoute, { status: 204, body: undefined });

      await new AgentHostIntegrationSignIns(host).cancel("gitlab", "account");

      expect(host.calls).toEqual([
        { route: cancelRoute, body: { integration: "gitlab", signIn: "account" } },
      ]);
    });

    it("fails with the host's kind when the host refuses", async () => {
      const host = new FakeHost().answer(
        cancelRoute,
        refused(
          404,
          "unknown_integration",
          "The agent host runs no sign-ins for this integration.",
        ),
      );

      await expect(
        new AgentHostIntegrationSignIns(host).cancel("gitlab", "account"),
      ).rejects.toMatchObject({ kind: "unknown_integration" });
    });
  });

  describe("signOut", () => {
    it("asks with the two names and answers what the provider said", async () => {
      const host = new FakeHost().answer(
        signOutRoute,
        ok({ result: { kind: "signedOut", revoke: "notConfirmed" } }),
      );

      const answer = await new AgentHostIntegrationSignIns(host).signOut("gitlab", "account");

      expect(answer).toEqual({ kind: "signedOut", revoke: "notConfirmed" });
      expect(host.calls).toEqual([
        { route: signOutRoute, body: { integration: "gitlab", signIn: "account" } },
      ]);
    });

    it("says when the person wasn't signed in", async () => {
      const host = new FakeHost().answer(signOutRoute, ok({ result: { kind: "notSignedIn" } }));

      expect(await new AgentHostIntegrationSignIns(host).signOut("gitlab", "account")).toEqual({
        kind: "notSignedIn",
      });
    });

    it("fails with answer_invalid for a revoke word it doesn't know", async () => {
      const host = new FakeHost().answer(
        signOutRoute,
        ok({ result: { kind: "signedOut", revoke: "probably" } }),
      );

      await expect(
        new AgentHostIntegrationSignIns(host).signOut("gitlab", "account"),
      ).rejects.toMatchObject({ kind: "answer_invalid" });
    });
  });
});
