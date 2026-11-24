import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostPaperclipKey } from "./paperclip-key.ts";

const route = "POST /v1/paperclip/key";
// A fake key only these tests use, so its absence from messages means something.
const fakeKey = "pcp_board_fake-key-for-tests-only";
const entry = {
  workspace: "/work/acme",
  connection: "halonic",
  key: fakeKey,
  address: "https://paperclip.acme.test",
  company: "acme-company",
};

verifies("agent-host-client.paperclip-key", () => {
  describe("handOver", () => {
    it("asks the host with the connection, the key, the address and the company, and nothing else", async () => {
      const host = new FakeHost().answer(route, ok({ kept: true }));

      await new AgentHostPaperclipKey(host).handOver({ ...entry, extra: "x" } as typeof entry);

      expect(host.calls).toEqual([{ route, body: entry }]);
    });

    it("says plainly that a key is taken only from Halonic's own window, and names no key", async () => {
      const host = new FakeHost().answer(route, refused(403, "secret_from_other_site", "x"));

      const failure = new AgentHostPaperclipKey(host).handOver(entry);

      await expect(failure).rejects.toMatchObject({
        status: 403,
        kind: "secret_from_other_site",
        message: "Halonic takes a Paperclip key only from its own window.",
      });
    });

    it("fails with the host's kind for a body it refuses, and names no key", async () => {
      const host = new FakeHost().answer(route, refused(400, "body_invalid", "not valid"));

      const failure = new AgentHostPaperclipKey(host).handOver(entry);

      await expect(failure).rejects.toMatchObject({ status: 400, kind: "body_invalid" });
      await expect(failure).rejects.not.toMatchObject({
        message: expect.stringContaining(fakeKey),
      });
    });

    it("fails with answer_invalid when the host answers something else", async () => {
      const host = new FakeHost().answer(route, ok({ kept: 1 }));

      await expect(new AgentHostPaperclipKey(host).handOver(entry)).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });
  });

  describe("disconnect", () => {
    const disconnect = "POST /v1/paperclip/disconnect";
    const ref = { workspace: "/work/acme", connection: "halonic" };

    it("asks the host with the workspace and the connection, and says whether the key was revoked", async () => {
      const host = new FakeHost().answer(disconnect, ok({ revoked: false }));

      const result = await new AgentHostPaperclipKey(host).disconnect({
        ...ref,
        extra: "x",
      } as typeof ref);

      expect(result).toEqual({ revoked: false });
      expect(host.calls).toEqual([{ route: disconnect, body: ref }]);
    });

    it("fails with the host's kind when it refuses", async () => {
      const host = new FakeHost().answer(disconnect, refused(404, "unknown_workspace", "x"));

      await expect(new AgentHostPaperclipKey(host).disconnect(ref)).rejects.toMatchObject({
        status: 404,
        kind: "unknown_workspace",
      });
    });
  });
});
