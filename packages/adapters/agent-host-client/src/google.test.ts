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
});
