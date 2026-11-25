// @vitest-environment jsdom

import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { type AgentConnection, FakeAgentConnections } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { button, dialog, polyfillDialog, press, settle, typeInto } from "../test-support/dom.ts";
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

  it("sets the connection's name in the body-strong type", async () => {
    const { view } = await showSection(new FakeAgentConnections({ connections: [connected] }));
    const name = [...(rowOf(view, "Paperclip · Halonic")?.querySelectorAll("p") ?? [])].find(
      (line) => line.textContent === "Paperclip · Halonic",
    );
    expect(name?.className).toContain("text-body-strong");
  });

  it("says since when a connection is offline", async () => {
    const offline: AgentConnection = {
      ...connected,
      state: { kind: "offline", asOf: "2026-11-24T14:02:00.000Z" },
    };
    const { view } = await showSection(new FakeAgentConnections({ connections: [offline] }));
    const row = rowOf(view, "Paperclip · Halonic");
    expect(row?.textContent).toMatch(/Offline, as of \d\d:\d\d/);
    expect(row?.textContent).toContain("Paperclip isn't answering.");
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
    expect(view.textContent).toContain("Connect Paperclip to answer your agents' cards");
    expect(button("Connect Paperclip")).toBeDefined();
  });
});

verifies("connections.connect-dialog", () => {
  it("says Connected and puts focus on the new row's Disconnect once the board approves", async () => {
    const fake = new FakeAgentConnections();
    const { view, announced } = await showSection(fake);
    await press(button("Connect Paperclip"));
    typeInto(dialog()?.querySelector("input") ?? null, "https://paperclip.acme.test");
    await press(button("Continue", inDialog()));
    act(() => fake.approve("Paperclip · Halonic"));
    await settle();
    expect(dialog()).toBeNull();
    expect(announced).toEqual(["Connected Paperclip · Halonic."]);
    expect(document.activeElement).toBe(button("Disconnect", rowOf(view, "Paperclip · Halonic")));
  });

  it("puts focus on the new row's Disconnect, not back on Connect Paperclip under the rows", async () => {
    const fake = new FakeAgentConnections({ connections: [connected] });
    const { view } = await showSection(fake);
    const opener = button("Connect Paperclip");
    opener?.focus();
    await press(opener);
    typeInto(dialog()?.querySelector("input") ?? null, "https://paperclip.beta.test");
    await press(button("Continue", inDialog()));
    act(() => fake.approve("Paperclip · Beta"));
    await settle();
    expect(document.activeElement).toBe(button("Disconnect", rowOf(view, "Paperclip · Beta")));
  });

  it("puts focus on the row's Disconnect after Sign in again, whose opener has gone", async () => {
    const fake = new FakeAgentConnections({ connections: [signedOut] });
    const { view, announced } = await showSection(fake);
    await press(button("Sign in again", rowOf(view, "Paperclip · Acme")));
    await press(button("Continue", inDialog()));
    act(() => fake.approve("Paperclip · Acme"));
    await settle();
    expect(announced).toEqual(["Connected Paperclip · Acme."]);
    expect(document.activeElement).toBe(button("Disconnect", rowOf(view, "Paperclip · Acme")));
  });
});

verifies("connections.connection-row", () => {
  it("puts focus on Connect Paperclip after the last connection is disconnected", async () => {
    const { view } = await showSection(new FakeAgentConnections({ connections: [connected] }));
    await press(button("Disconnect", rowOf(view, "Paperclip · Halonic")));
    await press(button("Disconnect", inDialog()));
    expect(rowOf(view, "Paperclip · Halonic")).toBeUndefined();
    expect(document.activeElement).toBe(button("Connect Paperclip"));
  });

  it("puts focus on the next row's Disconnect after a Disconnect", async () => {
    const fake = new FakeAgentConnections({ connections: [connected, signedOut] });
    const { view } = await showSection(fake);
    await press(button("Disconnect", rowOf(view, "Paperclip · Halonic")));
    await press(button("Disconnect", inDialog()));
    expect(document.activeElement).toBe(button("Disconnect", rowOf(view, "Paperclip · Acme")));
  });

  it("keeps the row and its Disconnect in focus when the engine fails to disconnect", async () => {
    const fake = new FakeAgentConnections({ connections: [connected] });
    fake.disconnect = () => Promise.reject(new Error("The fake engine didn't answer."));
    const { view } = await showSection(fake);
    const opener = button("Disconnect", rowOf(view, "Paperclip · Halonic"));
    opener?.focus();
    await press(opener);
    await press(button("Disconnect", inDialog()));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("names the row each Disconnect belongs to", async () => {
    const fake = new FakeAgentConnections({ connections: [connected, signedOut] });
    const { view } = await showSection(fake);
    for (const label of ["Paperclip · Halonic", "Paperclip · Acme"]) {
      const id = button("Disconnect", rowOf(view, label))?.getAttribute("aria-describedby");
      expect(id && document.getElementById(id)?.textContent).toBe(label);
    }
  });
});

verifies("connections.list-retry", () => {
  /** A fake whose list fails until `failing` is false. */
  function failingFirst() {
    const fake = new FakeAgentConnections({ connections: [connected] });
    const read = fake.list.bind(fake);
    const state = { failing: true };
    fake.list = async () => {
      if (state.failing) throw new Error("unknown_workspace");
      return await read();
    };
    return { fake, state };
  }

  it("says it couldn't read the connections, reports why, and reads them again on Try again", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fake, state } = failingFirst();
    const { view } = await showSection(fake);
    expect(view.textContent).toContain("Halonic couldn't read the connections.");
    expect(reported).toHaveBeenCalledWith(
      "Settings › Connections couldn't read the connections",
      expect.objectContaining({ message: "unknown_workspace" }),
    );

    state.failing = false;
    await press(button("Try again", view));
    expect(rowOf(view, "Paperclip · Halonic")).toBeDefined();
    expect(view.textContent).not.toContain("couldn't read");
    reported.mockRestore();
  });
});

verifies("connections.connection-user", () => {
  it("names the user each connection to one Paperclip is signed in as", async () => {
    const asBoard: AgentConnection = {
      ...connected,
      label: "Paperclip · Halonic · Board Supervisor",
      userName: "Board Supervisor",
    };
    const asAda: AgentConnection = {
      ...connected,
      id: "paperclip:halonic-ada",
      label: "Paperclip · Halonic · Ada",
      userName: "Ada",
    };
    const { view } = await showSection(new FakeAgentConnections({ connections: [asBoard, asAda] }));
    const names = [...view.querySelectorAll("li p.text-body-strong")].map(
      (name) => name.textContent,
    );
    expect(names).toEqual(["Paperclip · Halonic · Board Supervisor", "Paperclip · Halonic · Ada"]);
  });
});
