import type { SyncDiagnostics } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

async function diagnosticsOf(on: Desktop): Promise<{ status: number; text: string }> {
  const answer = await on.transport.request("GET /v1/sync/diagnostics");
  return { status: answer.status, text: JSON.stringify(answer.body) };
}

verifies("agent-host.sync-diagnostics", () => {
  describe("GET /v1/sync/diagnostics", () => {
    it("answers three poll-sourced and one event-sourced update as a 75 % / 25 % split", async () => {
      desktop = await startDesktop();
      desktop.counters.applied("poll", "2026-11-24T13:59:50.000Z");
      desktop.counters.applied("poll", "2026-11-24T13:59:50.000Z");
      desktop.counters.applied("poll", "2026-11-24T13:59:50.000Z");
      desktop.counters.applied("event", "2026-11-24T13:59:59.000Z");

      const { status, text } = await diagnosticsOf(desktop);
      const { updates } = JSON.parse(text) as SyncDiagnostics;

      expect(status).toBe(200);
      expect(updates.poll).toEqual({ count: 3, share: 0.75 });
      expect(updates.event).toEqual({ count: 1, share: 0.25 });
    });

    it("answers counts and timings of an Acme sync, with no task title, body, ID or key", async () => {
      desktop = await startDesktop();
      desktop.paperclip.servesInbox = true;
      desktop.paperclip.canary = "acme-canary-value";
      await desktop.paperclipKey.handOver({
        workspace: desktop.workspace,
        connection: "halonic",
        key: testKey,
        ...acme,
      });
      await desktop.wait(30_000);
      const [chat] = await desktop.studio.listConversations();
      await desktop.studio.send(chat?.id ?? "", "Ship the Acme release on Friday");

      const { status, text } = await diagnosticsOf(desktop);
      const diagnostics = JSON.parse(text) as SyncDiagnostics;

      expect(status).toBe(200);
      expect(diagnostics.updates["catch-up"].count).toBeGreaterThan(0);
      expect(diagnostics.updates.write.count).toBe(1);
      expect(diagnostics.routes.map((route) => route.route)).toContain("companies/:company/chats");
      for (const secret of [
        "Chat with Ada",
        "Ship the Acme release",
        "ACME-7",
        "task-1",
        "agent-ada",
        acme.company,
        "paperclip.acme.test",
        "acme-canary-value",
        testKey,
      ]) {
        expect(text).not.toContain(secret);
      }
    });
  });
});
