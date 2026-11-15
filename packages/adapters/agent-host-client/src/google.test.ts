import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostGoogleSetup } from "./google.ts";

const route = "POST /v1/google/disconnect";

verifies("agent-host-client.google", () => {
  describe("disconnect", () => {
    it("asks the host with the account's ref and nothing else", async () => {
      const host = new FakeHost().answer(
        route,
        ok({ disconnected: true, googleConfirmed: true, clientSecret: "removed" }),
      );

      const answer = await new AgentHostGoogleSetup(host).disconnect("gaccount_one");

      expect(answer).toEqual({ googleConfirmed: true, clientSecret: "removed" });
      expect(host.calls).toEqual([{ route, body: { accountRef: "gaccount_one" } }]);
    });

    it("says when Google didn't confirm", async () => {
      const host = new FakeHost().answer(
        route,
        ok({ disconnected: true, googleConfirmed: false, clientSecret: "kept-for-other-accounts" }),
      );

      expect(await new AgentHostGoogleSetup(host).disconnect("gaccount_one")).toEqual({
        googleConfirmed: false,
        clientSecret: "kept-for-other-accounts",
      });
    });

    it("fails with the host's kind when there is no setup", async () => {
      const host = new FakeHost().answer(
        route,
        refused(404, "google_setup_not_found", "There is no Google setup for this account."),
      );

      await expect(new AgentHostGoogleSetup(host).disconnect("gaccount_one")).rejects.toMatchObject(
        { status: 404, kind: "google_setup_not_found" },
      );
    });

    it("fails with answer_invalid for an answer that isn't a disconnect's", async () => {
      const host = new FakeHost().answer(route, ok({ disconnected: false }));

      await expect(new AgentHostGoogleSetup(host).disconnect("gaccount_one")).rejects.toMatchObject(
        { kind: "answer_invalid" },
      );
    });
  });

  describe("start", () => {
    const startRoute = "POST /v1/google/setups";
    const connector = { workspace: "acme", id: "mail" };

    it("sends the connector link and the account type, and answers the new ref", async () => {
      const host = new FakeHost().answer(startRoute, {
        status: 201,
        body: { accountRef: "gaccount_one" },
      });

      const ref = await new AgentHostGoogleSetup(host).start(connector, "personal");

      expect(ref).toBe("gaccount_one");
      expect(host.calls).toEqual([
        { route: startRoute, body: { accountType: "personal", connector } },
      ]);
    });

    it("fails with the host's kind when it can't start", async () => {
      const host = new FakeHost().answer(startRoute, refused(502, "google_failed", "No."));

      await expect(
        new AgentHostGoogleSetup(host).start(connector, "personal"),
      ).rejects.toMatchObject({
        status: 502,
        kind: "google_failed",
      });
    });

    it("fails with answer_invalid for a 201 that holds no ref", async () => {
      const host = new FakeHost().answer(startRoute, { status: 201, body: {} });

      await expect(
        new AgentHostGoogleSetup(host).start(connector, "personal"),
      ).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });
  });

  describe("edit and start over", () => {
    it("sends the ref and the one change", async () => {
      const editRoute = "POST /v1/google/setups/edit";
      const host = new FakeHost().answer(editRoute, ok({ updated: true }));
      const change = { kind: "project-id", projectId: "acme-project" };

      await new AgentHostGoogleSetup(host).edit("gaccount_one", change);

      expect(host.calls).toEqual([
        { route: editRoute, body: { accountRef: "gaccount_one", change } },
      ]);
    });

    it("fails with the host's kind when the edit's setup is gone", async () => {
      const host = new FakeHost().answer(
        "POST /v1/google/setups/edit",
        refused(404, "google_setup_not_found", "No setup."),
      );

      await expect(new AgentHostGoogleSetup(host).edit("gaccount_one", {})).rejects.toMatchObject({
        kind: "google_setup_not_found",
      });
    });

    it("answers what became of the client secret", async () => {
      const startOverRoute = "POST /v1/google/start-over";
      const host = new FakeHost().answer(startOverRoute, ok({ clientSecret: "removed" }));

      expect(await new AgentHostGoogleSetup(host).startOver("gaccount_one")).toBe("removed");
      expect(host.calls).toEqual([{ route: startOverRoute, body: { accountRef: "gaccount_one" } }]);
    });
  });

  describe("sign-in", () => {
    it("starts it and answers the address to open", async () => {
      const signInRoute = "POST /v1/google/sign-in";
      const host = new FakeHost().answer(
        signInRoute,
        ok({ authUrl: "https://accounts.example/auth" }),
      );

      expect(await new AgentHostGoogleSetup(host).startSignIn("gaccount_one")).toBe(
        "https://accounts.example/auth",
      );
      expect(host.calls).toEqual([{ route: signInRoute, body: { accountRef: "gaccount_one" } }]);
    });

    it("cancels it, whose answer is empty", async () => {
      const cancelRoute = "POST /v1/google/sign-in/cancel";
      const host = new FakeHost().answer(cancelRoute, { status: 204, body: null });

      await new AgentHostGoogleSetup(host).cancelSignIn("gaccount_one");

      expect(host.calls).toEqual([{ route: cancelRoute, body: { accountRef: "gaccount_one" } }]);
    });

    it("fails a cancel the host refuses", async () => {
      const host = new FakeHost().answer(
        "POST /v1/google/sign-in/cancel",
        refused(502, "google_failed", "No."),
      );

      await expect(
        new AgentHostGoogleSetup(host).cancelSignIn("gaccount_one"),
      ).rejects.toMatchObject({
        kind: "google_failed",
      });
    });
  });
});
