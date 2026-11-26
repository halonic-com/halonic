import type { AgentMessaging, TeamStatus } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type Desktop, startDesktop } from "../messaging/desktop-messaging.test-helper.ts";
import type { WorkspaceMessaging } from "../messaging/workspace-messaging.ts";
import { phoneWorkspaceMessaging } from "./phone-workspace.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** A workspace whose messaging and team status answer with its name. */
function namedWorkspace(name: string): WorkspaceMessaging {
  const messaging = { listSources: async () => [name] } as unknown as AgentMessaging;
  const team = { seats: async () => [name] } as unknown as TeamStatus;
  return { workspace: name, messaging, team } as unknown as WorkspaceMessaging;
}

describe("phoneWorkspaceMessaging", () => {
  verifies("agent-host.phone-workspace", () => {
    it("reads the workspace Studio last asked for, and the first one before Studio asks", async () => {
      desktop = await startDesktop();
      const { messaging, workspace, otherWorkspace } = desktop;

      expect((await messaging.lastAsked())?.workspace).toBe(workspace);
      await messaging.of(otherWorkspace);
      expect((await messaging.lastAsked())?.workspace).toBe(otherWorkspace);
      // The phone's own look-up picks nothing.
      await messaging.lastAsked();
      expect((await messaging.lastAsked())?.workspace).toBe(otherWorkspace);
    });

    it("looks the workspace up again on every read", async () => {
      let current = namedWorkspace("acme");
      const phone = phoneWorkspaceMessaging(async () => current);

      expect(await phone.listSources()).toEqual(["acme"]);
      current = namedWorkspace("acme-other");
      expect(await phone.listSources()).toEqual(["acme-other"]);
      expect(await phone.team.seats()).toEqual(["acme-other"]);
    });

    it("fails a read when no workspace is open", async () => {
      const phone = phoneWorkspaceMessaging(async () => undefined);

      await expect(phone.listSources()).rejects.toThrow(/No workspace/);
    });
  });
});
