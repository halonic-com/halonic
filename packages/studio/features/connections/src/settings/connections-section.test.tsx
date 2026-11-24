// @vitest-environment jsdom

import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { type AgentConnection, FakeAgentConnections } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
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
  keyExpiresAt: "2026-12-24T12:00:00.000Z",
};
const signedOut: AgentConnection = {
  ...connected,
  id: "paperclip:acme",
  label: "Paperclip · Acme",
  state: { kind: "signed-out" },
};

async function showSection(fake: FakeAgentConnections) {
  const announced: string[] = [];
  const opened: string[] = [];
  const view = render(
    <OpenExternalProvider openExternal={async (address) => void opened.push(await address)}>
      <ConnectionsView connections={fake} announce={(line) => announced.push(line)} />
    </OpenExternalProvider>,
  );
  await settle();
  return { view, announced, opened };
}

const rowOf = (view: HTMLElement, label: string) =>
  [...view.querySelectorAll("li")].find((row) => row.textContent?.includes(label));

const inDialog = () => dialog() ?? undefined;

verifies("connections.connection-row", () => {
  it("shows a connected connection's state and what its key can do", async () => {
    const { view } = await showSection(new FakeAgentConnections({ connections: [connected] }));
    const row = rowOf(view, "Paperclip · Halonic");
    expect(row?.textContent).toContain("paperclip.acme.test · Checked ");
    expect(row?.textContent).toContain("key expires 24 Dec 2026");
    expect(row?.textContent).toContain("Read-only");
    expect(row?.textContent).toContain("Connected");
    expect(row?.textContent).toContain("This key can do everything the board can in Paperclip");
    expect(button("Sign in again", row)).toBeUndefined();
    expect(button("Disconnect", row)).toBeDefined();
  });

  it("says since when a connection is offline", async () => {
    const offline: AgentConnection = {
      ...connected,
      state: { kind: "offline", asOf: "2026-11-24T14:02:00.000Z" },
    };
    const { view } = await showSection(new FakeAgentConnections({ connections: [offline] }));
    const row = rowOf(view, "Paperclip · Halonic");
    expect(row?.textContent).toMatch(/Offline, as of \d\d:\d\d/);
    expect(row?.textContent).toContain("Paperclip isn’t answering.");
  });

  it("offers Sign in again on a signed-out connection, which opens the dialog for it", async () => {
    const { view } = await showSection(new FakeAgentConnections({ connections: [signedOut] }));
    const row = rowOf(view, "Paperclip · Acme");
    expect(row?.textContent).toContain("Signed out");
    expect(row?.textContent).toContain("key expired or revoked");
    await press(button("Sign in again", row));
    expect(dialog()?.textContent).toContain("Sign in again");
    expect(dialog()?.querySelector("input")?.value).toBe("https://paperclip.acme.test");
  });

  it("asks first, then asks the engine once to disconnect, and says the key stays valid", async () => {
    const fake = new FakeAgentConnections({
      connections: [connected],
      disconnect: { revoked: false, validUntil: "2026-12-24T12:00:00.000Z" },
    });
    const { view, announced, opened } = await showSection(fake);
    await press(button("Disconnect", rowOf(view, "Paperclip · Halonic")));
    expect(dialog()?.textContent).toContain("Disconnect Paperclip · Halonic?");
    expect(fake.disconnects).toEqual([]);
    const confirm = button("Disconnect", inDialog());
    act(() => {
      confirm?.click();
      confirm?.click();
    });
    await settle();
    expect(fake.disconnects).toEqual(["paperclip:halonic"]);
    expect(dialog()).toBeNull();
    expect(view.textContent).toContain(
      "Disconnected Paperclip · Halonic, but its key is still valid.",
    );
    expect(view.textContent).toContain(
      "The key stays valid until 24 Dec 2026; revoke it in Paperclip to end it sooner.",
    );
    expect(announced).toHaveLength(1);
    expect(rowOf(view, "Paperclip · Halonic")).toBeUndefined();
    await press(button("Open Paperclip"));
    expect(opened).toEqual(["https://paperclip.acme.test"]);
  });

  it("says the key was revoked when the revoke worked", async () => {
    const fake = new FakeAgentConnections({ connections: [connected] });
    const { view } = await showSection(fake);
    await press(button("Disconnect", rowOf(view, "Paperclip · Halonic")));
    await press(button("Disconnect", inDialog()));
    expect(view.textContent).toContain(
      "Disconnected Paperclip · Halonic. Its key is revoked in Paperclip and deleted from this computer.",
    );
  });

  it("disconnects nothing when the person cancels", async () => {
    const fake = new FakeAgentConnections({ connections: [connected] });
    const { view } = await showSection(fake);
    await press(button("Disconnect", rowOf(view, "Paperclip · Halonic")));
    await press(button("Cancel", inDialog()));
    expect(fake.disconnects).toEqual([]);
    expect(rowOf(view, "Paperclip · Halonic")).toBeDefined();
  });

  it("says when there is no connection yet", async () => {
    const { view } = await showSection(new FakeAgentConnections());
    expect(view.textContent).toContain("No connections");
    expect(view.textContent).toContain("Connect Paperclip to answer your agents’ cards");
    expect(button("Connect Paperclip")).toBeDefined();
  });
});
