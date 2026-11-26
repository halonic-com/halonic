import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ServiceRegistry } from "@halonicjs/app";
import { AgentNotifierService } from "@halonicjs/studio-feature-inbox/api";
import type { AgentNotice, Notifier } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { provideAgentMessaging } from "./provide-agent-messaging.ts";
import { provideAgentNotifier } from "./provide-agent-notifier.ts";

/** A host that answers every call with nothing. */
const quietHost: AgentHostTransport = {
  request: async () => ({ status: 200, body: {} }),
  stream: () => Promise.reject(new Error("No stream route is used here.")),
};

/** A notifier that only records whether it was disposed. */
class DisposableNotifier implements Notifier {
  disposed = false;

  show(_notice: AgentNotice, _onClick: () => void): Promise<void> {
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    this.disposed = true;
    return Promise.resolve();
  }
}

verifies("inbox.agent-notifications-start", () => {
  describe("provideAgentNotifier", () => {
    it("gives the Inbox the folder's notifier, and disposes it with the folder", async () => {
      const services = new ServiceRegistry();
      provideAgentMessaging(services, quietHost, "/work/acme", new EventTarget());
      const notifier = new DisposableNotifier();
      provideAgentNotifier(services, notifier);

      // Without this, the Inbox's notice host starts no watch and no card shows a notification.
      expect(services.get(AgentNotifierService)).toBe(notifier);
      await services.dispose();
      expect(notifier.disposed).toBe(true);
    });

    it("gives nothing without the agents' messaging", async () => {
      const services = new ServiceRegistry();
      provideAgentNotifier(services, new DisposableNotifier());

      expect(services.has(AgentNotifierService)).toBe(false);
      await services.dispose();
    });
  });
});
