// @vitest-environment jsdom

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
};
const signedOut: AgentConnection = {
  ...connected,
  id: "paperclip:acme",
  label: "Paperclip · Acme",
  state: { kind: "signed-out" },
};

async function showSection(fake: FakeAgentConnections) {
  const announced: string[] = [];
  const view = render(
    <ConnectionsView connections={fake} announce={(line) => announced.push(line)} />,
  );
  await settle();
  return { view, announced };
}

const rowOf = (view: HTMLElement, label: string) =>
  [...view.querySelectorAll("li")].find((row) => row.textContent?.includes(label));

verifies("connections.connection-row", () => {
  it("shows a connected connection's state and what its key can do", async () => {
    const { view } = await showSection(new FakeAgentConnections({ connections: [connected] }));
    const row = rowOf(view, "Paperclip · Halonic");
    expect(row?.textContent).toContain("https://paperclip.acme.test");
    expect(row?.textContent).toContain("Connected");
    expect(row?.textContent).toContain("This key can do everything the board can in Paperclip");
    expect(button("Sign in again", row)).toBeUndefined();
    expect(button("Disconnect", row)).toBeDefined();
  });

  it("offers Sign in again on a signed-out connection, which opens the dialog for it", async () => {
    const { view } = await showSection(new FakeAgentConnections({ connections: [signedOut] }));
    const row = rowOf(view, "Paperclip · Acme");
    expect(row?.textContent).toContain("Signed out");
    await press(button("Sign in again", row));
    expect(dialog()?.textContent).toContain("Sign in again");
    expect(dialog()?.querySelector("input")?.value).toBe("https://paperclip.acme.test");
  });

  it("asks the engine once to disconnect, then says the key stays valid until its expiry", async () => {
    const fake = new FakeAgentConnections({
      connections: [connected],
      disconnect: { revoked: false, validUntil: "2026-12-24T12:00:00.000Z" },
    });
    const { view, announced } = await showSection(fake);
    const disconnect = button("Disconnect", rowOf(view, "Paperclip · Halonic"));
    act(() => {
      disconnect?.click();
      disconnect?.click();
    });
    await settle();
    expect(fake.disconnects).toEqual(["paperclip:halonic"]);
    const note =
      "Disconnected Paperclip · Halonic. Its key stays valid until 24 Dec 2026; you can revoke it in Paperclip.";
    expect(view.textContent).toContain(note);
    expect(announced).toEqual([note]);
    expect(rowOf(view, "Paperclip · Halonic")).toBeUndefined();
  });

  it("says the key was revoked when the revoke worked", async () => {
    const fake = new FakeAgentConnections({ connections: [connected] });
    const { view } = await showSection(fake);
    await press(button("Disconnect", rowOf(view, "Paperclip · Halonic")));
    expect(view.textContent).toContain(
      "Disconnected Paperclip · Halonic. Paperclip has revoked its key.",
    );
  });

  it("says when there is no connection yet", async () => {
    const { view } = await showSection(new FakeAgentConnections());
    expect(view.textContent).toContain("No connections yet.");
    expect(button("Connect Paperclip")).toBeDefined();
  });
});
