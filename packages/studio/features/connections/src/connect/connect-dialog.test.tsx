// @vitest-environment jsdom

import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { type AgentConnection, FakeAgentConnections } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConnectionsView } from "../settings/connections-section.tsx";
import { button, dialog, polyfillDialog, press, settle, typeInto } from "../test-support/dom.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectDialog } from "./connect-dialog.tsx";

const startedAt = Date.parse("2026-11-24T14:00:00.000Z");

beforeEach(() => {
  polyfillDialog();
  // The countdown's interval, the frames and the clock: `settle` still needs the real setTimeout.
  vi.useFakeTimers({
    toFake: [
      "setInterval",
      "clearInterval",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "Date",
    ],
    now: startedAt,
  });
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const signedOut: AgentConnection = {
  id: "paperclip:halonic",
  provider: "paperclip",
  label: "Paperclip · Halonic",
  address: "https://paperclip.acme.test",
  state: { kind: "signed-out" },
};

/** The dialog over a fake, with every page it opens and every close counted. */
async function openDialog(
  options: { readonly fake?: FakeAgentConnections; readonly again?: AgentConnection } = {},
) {
  const fake = options.fake ?? new FakeAgentConnections({ phrase: "amber falcon river seven" });
  const opened: string[] = [];
  const closed = vi.fn();
  const cancelFailed = vi.fn();
  render(
    <OpenExternalProvider openExternal={async (address) => void opened.push(await address)}>
      <ConnectDialog
        connections={fake}
        again={options.again}
        onClose={closed}
        onCancelFailed={cancelFailed}
      />
    </OpenExternalProvider>,
  );
  await settle();
  return { fake, opened, closed, cancelFailed };
}

/** Types the address and presses Connect. */
async function connectTo(address: string) {
  typeInto(dialog()?.querySelector("input") ?? null, address);
  await press(button("Connect", dialog() ?? document));
}

const text = () => dialog()?.textContent ?? "";

verifies("connections.connect-dialog", () => {
  it("shows the phrase the engine returned, with 10 minutes, and opens the approval page", async () => {
    const { fake, opened } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    expect(fake.signIns).toEqual([{ address: "https://paperclip.acme.test" }]);
    expect(dialog()?.querySelector("[data-phrase]")?.textContent).toBe("amber falcon river seven");
    expect(text()).toContain("Time left to approve: 10:00");
    expect(opened).toEqual(["https://paperclip.acme.test/cli-auth/fake-challenge"]);
    expect(button("Open the approval page")).toBeDefined();
  });

  it("counts down on the clock and ends at 0:00 with the expired state", async () => {
    const { fake } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    act(() => vi.advanceTimersByTime(61_000));
    expect(text()).toContain("Time left to approve: 8:59");
    act(() => vi.advanceTimersByTime(9 * 60_000));
    expect(text()).toContain("Time left to approve: 0:00");
    expect(text()).toContain("The sign-in ended");
    expect(button("Start again")).toBeDefined();
    expect(button("Open the approval page")).toBeUndefined();
    // The engine ends it by itself; the dialog only stopped offering it.
    expect(fake.cancels).toBe(0);
  });

  it("cancels the waiting sign-in once when the dialog closes", async () => {
    const { fake, closed } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    await press(button("Close Connect Paperclip"));
    expect(fake.cancels).toBe(1);
    expect(fake.waiting).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
  });

  it("cancels the sign-in from its own Cancel too", async () => {
    const { fake, closed } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    await press(button("Cancel", dialog() ?? document));
    expect(fake.cancels).toBe(1);
    expect(closed).toHaveBeenCalledOnce();
  });

  it("opens as Sign in again with the signed-out connection's address", async () => {
    const fake = new FakeAgentConnections({ connections: [signedOut] });
    await openDialog({ fake, again: signedOut });
    expect(text()).toContain("Sign in again");
    expect(dialog()?.querySelector("input")?.value).toBe("https://paperclip.acme.test");
    await press(button("Connect", dialog() ?? document));
    expect(fake.signIns).toEqual([
      { address: "https://paperclip.acme.test", connection: "paperclip:halonic" },
    ]);
  });

  it("says Connected once the board approves", async () => {
    const { fake } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    act(() => fake.approve("Paperclip · Halonic"));
    await settle();
    expect(text()).toContain("Connected to Paperclip · Halonic.");
  });

  it("says why when the approver isn't in the company, and starts again", async () => {
    const { fake } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    act(() => fake.refuse("other-company"));
    await settle();
    expect(text()).toContain("That account isn't in this company");
    await press(button("Start again"));
    expect(dialog()?.querySelector("input")?.value).toBe("https://paperclip.acme.test");
  });

  it("starts nothing for an address that isn't a web address", async () => {
    const { fake } = await openDialog();
    await connectTo("paperclip");
    expect(fake.signIns).toEqual([]);
    expect(text()).toContain("Enter a web address that starts with https://.");
  });

  it("says why when the engine refuses the address, and opens no page", async () => {
    const fake = new FakeAgentConnections({ refuseStart: "address-not-allowed" });
    const { opened } = await openDialog({ fake });
    await connectTo("https://elsewhere.test");
    // The Dialog's alert slot fills a frame after the request ends.
    act(() => vi.advanceTimersToNextFrame());
    expect(text()).toContain("Halonic can't sign in at this address");
    expect(opened).toEqual([]);
  });
});

verifies("connections.connect-dialog", () => {
  it("opens from Settings › Connections and closes back to it", async () => {
    const fake = new FakeAgentConnections();
    render(<ConnectionsView connections={fake} announce={() => undefined} />);
    await settle();
    await press(button("Connect Paperclip"));
    expect(dialog()).not.toBeNull();
    await press(button("Close Connect Paperclip"));
    expect(dialog()).toBeNull();
  });
});
