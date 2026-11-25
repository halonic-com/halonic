import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostPaperclipSignIn } from "./paperclip-sign-in.ts";

const workspace = "/work/acme";
const address = "https://paperclip.acme.test";
const started = {
  outcome: "started",
  signInId: "sign-in-1",
  phrase: "amber falcon river seven",
  approvalUrl: `${address}/cli-auth/challenge-1?token=challenge-secret`,
  expiresAt: "2026-11-24T14:10:00.000Z",
};

verifies("agent-host-client.paperclip-sign-in", () => {
  describe("AgentHostPaperclipSignIn", () => {
    it("lists the workspace's connections, with the real path the host resolved", async () => {
      const row = {
        id: "paperclip:acme",
        name: "acme",
        label: "Paperclip · Acme",
        address,
        company: "acme-company",
        state: { kind: "signed-out" },
      };
      const listed = { workspace: "/real/acme", connections: [row] };
      const host = new FakeHost().answer("POST /v1/paperclip/connections", ok(listed));
      const signIn = new AgentHostPaperclipSignIn(host, workspace);
      expect(await signIn.listed()).toEqual(listed);
      expect(await signIn.connections()).toEqual([row]);
      expect(host.calls).toContainEqual({
        route: "POST /v1/paperclip/connections",
        body: { workspace },
      });
    });

    it("starts with the workspace and the address only, and answers the host's start", async () => {
      const host = new FakeHost().answer("POST /v1/paperclip/sign-in/start", ok(started));
      const signIn = new AgentHostPaperclipSignIn(host, workspace);
      expect(await signIn.start(address)).toEqual(started);
      await signIn.start(address, "acme");
      expect(host.calls.map((call) => call.body)).toEqual([
        { workspace, address },
        { workspace, address, connection: "acme" },
      ]);
    });

    it("answers a refused start with its reason, too many open sign-ins included", async () => {
      const refusal = { outcome: "refused", reason: "too-many-sign-ins" };
      const host = new FakeHost().answer("POST /v1/paperclip/sign-in/start", ok(refusal));
      expect(await new AgentHostPaperclipSignIn(host, workspace).start(address)).toEqual(refusal);
    });

    it("polls, confirms and cancels by the sign-in's ID", async () => {
      const host = new FakeHost()
        .answer("POST /v1/paperclip/sign-in/poll", ok({ status: "pending" }))
        .answer("POST /v1/paperclip/sign-in/confirm", ok({ confirmed: true }))
        .answer("POST /v1/paperclip/sign-in/cancel", ok({ status: "cancelled", keyMayWork: true }));
      const signIn = new AgentHostPaperclipSignIn(host, workspace);
      expect(await signIn.poll("sign-in-1")).toEqual({ status: "pending" });
      expect(await signIn.confirm("sign-in-1")).toBe(true);
      expect(await signIn.cancel("sign-in-1")).toEqual({ status: "cancelled", keyMayWork: true });
      expect(host.calls.map((call) => call.body)).toEqual([
        { signInId: "sign-in-1" },
        { signInId: "sign-in-1" },
        { signInId: "sign-in-1" },
      ]);
    });

    it("fails with the host's kind, or answer_invalid for another shape", async () => {
      const host = new FakeHost()
        .answer("POST /v1/paperclip/sign-in/poll", refused(403, "secret_from_other_site", "x"))
        .answer("POST /v1/paperclip/sign-in/cancel", ok({ status: "approved" }));
      const signIn = new AgentHostPaperclipSignIn(host, workspace);
      await expect(signIn.poll("sign-in-1")).rejects.toMatchObject({
        status: 403,
        kind: "secret_from_other_site",
      });
      await expect(signIn.cancel("sign-in-1")).rejects.toMatchObject({ kind: "answer_invalid" });
    });
  });
});

verifies("agent-host.paperclip-add-account", () => {
  describe("AgentHostPaperclipSignIn for another account", () => {
    it("asks for a new connection when told to", async () => {
      const host = new FakeHost().answer("POST /v1/paperclip/sign-in/start", ok(started));
      const signIn = new AgentHostPaperclipSignIn(host, workspace);
      await signIn.start(address, undefined, { newConnection: true });
      expect(host.calls.map((call) => call.body)).toEqual([
        { workspace, address, newConnection: true },
      ]);
    });
  });
});
