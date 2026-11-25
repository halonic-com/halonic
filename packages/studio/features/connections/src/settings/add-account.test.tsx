// @vitest-environment jsdom

import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { type AgentConnection, FakeAgentConnections } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { button, dialog, polyfillDialog, press, settle } from "../test-support/dom.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectionsView } from "./connections-section.tsx";

beforeEach(polyfillDialog);
afterEach(unmountAll);

const connected: AgentConnection = {
  id: "paperclip:halonic",
  provider: "paperclip",
  label: "Paperclip · Halonic",
  address: "https://paperclip.acme.test",
  state: { kind: "online", asOf: "2026-11-24T14:00:00.000Z" },
};

async function showSection(fake: FakeAgentConnections) {
  const opened: string[] = [];
  const view = render(
    <OpenExternalProvider openExternal={async (address) => void opened.push(await address)}>
      <ConnectionsView connections={fake} announce={() => undefined} />
    </OpenExternalProvider>,
  );
  await settle();
  return { view, opened };
}

const rowOf = (view: HTMLElement, label: string) =>
  [...view.querySelectorAll("li")].find((row) => row.textContent?.includes(label));

verifies("connections.add-account", () => {
  describe("Add another account", () => {
    it("starts a sign-in for a new connection at a connected row's address", async () => {
      const fake = new FakeAgentConnections({ connections: [connected] });
      const { view, opened } = await showSection(fake);
      await press(button("Add another account", rowOf(view, "Paperclip · Halonic")));
      expect(dialog()?.textContent).toContain("Add another account");
      expect(dialog()?.textContent).toContain("Connect another account on this Paperclip.");
      const field = dialog()?.querySelector("input");
      expect(field?.value).toBe("https://paperclip.acme.test");
      expect(field?.readOnly).toBe(true);
      await press(button("Continue", dialog() ?? document));
      expect(fake.signIns).toEqual([
        { address: "https://paperclip.acme.test", newConnection: true },
      ]);
      expect(opened).toEqual(["https://paperclip.acme.test/cli-auth/fake-challenge"]);
      expect(dialog()?.textContent).toContain("amber falcon river seven");
    });

    it("lists the new connection beside the first once approved", async () => {
      const fake = new FakeAgentConnections({ connections: [connected] });
      const { view } = await showSection(fake);
      await press(button("Add another account", rowOf(view, "Paperclip · Halonic")));
      await press(button("Continue", dialog() ?? document));
      fake.approve("Paperclip · Halonic (Board Supervisor)");
      await settle();
      expect(dialog()).toBeNull();
      expect(view.querySelectorAll("li")).toHaveLength(2);
    });

    it("isn't offered on a connection that is offline or signed out", async () => {
      const offline: AgentConnection = {
        ...connected,
        state: { kind: "offline", asOf: "2026-11-24T14:02:00.000Z" },
      };
      const signedOut: AgentConnection = {
        ...connected,
        id: "paperclip:acme",
        label: "Paperclip · Acme",
        state: { kind: "signed-out" },
      };
      const { view } = await showSection(
        new FakeAgentConnections({ connections: [offline, signedOut] }),
      );
      expect(button("Add another account", view)).toBeUndefined();
    });
  });
});
