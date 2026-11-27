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
  options: {
    readonly fake?: FakeAgentConnections;
    readonly again?: AgentConnection;
    /** Gives the provider an `openSignIn` that counts into `signInOpened` (`kit.open-sign-in`). */
    readonly signInWindow?: boolean;
  } = {},
) {
  const fake = options.fake ?? new FakeAgentConnections({ phrase: "amber falcon river seven" });
  const opened: string[] = [];
  const signInOpened: string[] = [];
  const closed = vi.fn();
  const connected = vi.fn();
  const cancelFailed = vi.fn();
  const signInWindow = options.signInWindow
    ? {
        openSignIn: async (address: string | Promise<string>) =>
          void signInOpened.push(await address),
      }
    : {};
  render(
    <OpenExternalProvider
      openExternal={async (address) => void opened.push(await address)}
      {...signInWindow}
    >
      <ConnectDialog
        connections={fake}
        again={options.again}
        onClose={closed}
        onConnected={connected}
        onCancelFailed={cancelFailed}
      />
    </OpenExternalProvider>,
  );
  await settle();
  return { fake, opened, signInOpened, closed, connected, cancelFailed };
}

verifies("kit.open-sign-in", () => {
  it("opens the Paperclip approval page as a sign-in page, never as an outside link", async () => {
    const { opened, signInOpened } = await openDialog({ signInWindow: true });
    await connectTo("https://paperclip.acme.test");
    await press(button("Open the approval page"));
    const approvalPage = "https://paperclip.acme.test/cli-auth/fake-challenge";
    expect(signInOpened).toEqual([approvalPage, approvalPage]);
    expect(opened).toEqual([]);
  });
});

/** Types the address and presses Continue. */
async function connectTo(address: string) {
  typeInto(dialog()?.querySelector("input") ?? null, address);
  await press(button("Continue", dialog() ?? document));
}

const text = () => dialog()?.textContent ?? "";

verifies("connections.connect-dialog", () => {
  it("shows the phrase the engine returned, with 10 minutes, and opens the approval page", async () => {
    const { fake, opened } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    expect(fake.signIns).toEqual([{ address: "https://paperclip.acme.test" }]);
    expect(dialog()?.querySelector("[data-phrase]")?.textContent).toBe("amber falcon river seven");
    expect(text()).toContain("10:00 left");
    expect(text()).toContain("Waiting for you to approve in Paperclip…");
    expect(opened).toEqual(["https://paperclip.acme.test/cli-auth/fake-challenge"]);
    await press(button("Open the approval page"));
    expect(opened).toHaveLength(2);
    expect(dialog()).not.toBeNull();
  });

  it("counts down on the clock and shows the expired state at 0:00", async () => {
    const { fake } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    act(() => vi.advanceTimersByTime(61_000));
    expect(text()).toContain("8:59 left");
    act(() => vi.advanceTimersByTime(538_000));
    expect(text()).toContain("0:01 left");
    act(() => vi.advanceTimersByTime(1_000));
    expect(text()).toContain("The sign-in expired");
    expect(button("Start again")).toBeDefined();
    expect(button("Open the approval page")).toBeUndefined();
    // Cancelled as a best effort, once; Start again and Close then have nothing left to cancel.
    await settle();
    expect(fake.cancels).toBe(1);
    expect(fake.waiting).toBe(false);
  });

  it("stays quiet when the cancel at 0:00 fails, and Close then cancels nothing", async () => {
    const fake = new FakeAgentConnections({ cancelFails: true });
    const { closed, cancelFailed } = await openDialog({ fake });
    await connectTo("https://paperclip.acme.test");
    act(() => vi.advanceTimersByTime(600_000));
    await settle();
    expect(text()).toContain("The sign-in expired");
    expect(fake.cancels).toBe(1);
    await press(button("Close Connect Paperclip"));
    expect(fake.cancels).toBe(1);
    expect(closed).toHaveBeenCalledOnce();
    expect(cancelFailed).not.toHaveBeenCalled();
  });

  it("starts again after 0:00 without touching the expired sign-in", async () => {
    const { fake } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    act(() => vi.advanceTimersByTime(600_000));
    await settle();
    await press(button("Start again"));
    await connectTo("https://paperclip.acme.test");
    expect(fake.cancels).toBe(1);
    expect(fake.signIns).toHaveLength(2);
    expect(text()).toContain("10:00 left");
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

  it("opens as Sign in again with the signed-out connection's address, read-only", async () => {
    const fake = new FakeAgentConnections({ connections: [signedOut] });
    await openDialog({ fake, again: signedOut });
    expect(text()).toContain("Sign in again");
    expect(text()).toContain("The key for Paperclip · Halonic has expired or was revoked.");
    expect(dialog()?.querySelector("input")?.value).toBe("https://paperclip.acme.test");
    expect(dialog()?.querySelector("input")?.readOnly).toBe(true);
    await press(button("Continue", dialog() ?? document));
    expect(fake.signIns).toEqual([
      { address: "https://paperclip.acme.test", connection: "paperclip:halonic" },
    ]);
  });

  it("hands the new connection to the opener once the board approves", async () => {
    const { fake, closed, connected } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    act(() => fake.approve("Paperclip · Halonic"));
    await settle();
    expect(connected).toHaveBeenCalledOnce();
    expect(connected.mock.calls[0]?.[0]).toMatchObject({ label: "Paperclip · Halonic" });
    expect(closed).not.toHaveBeenCalled();
    expect(fake.cancels).toBe(0);
  });

  it("says why when the approver isn't in the company, and starts again", async () => {
    const { fake } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    act(() => fake.refuse("other-company", "Halonic"));
    await settle();
    expect(text()).toContain("This account isn't in Halonic");
    await press(button("Start again"));
    expect(dialog()?.querySelector("input")?.value).toBe("https://paperclip.acme.test");
  });

  it("says the key wasn't saved when the keychain refused it", async () => {
    const { fake } = await openDialog();
    await connectTo("https://paperclip.acme.test");
    act(() => fake.failKeychain());
    await settle();
    expect(text()).toContain("Halonic couldn't save the key");
    expect(button("Start again")).toBeDefined();
  });

  it("starts nothing for an address that isn't https, unless it's on this computer", async () => {
    const { fake } = await openDialog();
    await connectTo("http://paperclip.acme.test");
    expect(fake.signIns).toEqual([]);
    expect(text()).toContain("Use an https address. Plain http works only for this computer");
    await connectTo("http://localhost:3100");
    expect(fake.signIns).toEqual([{ address: "http://localhost:3100" }]);
  });

  it("takes focus to the address after an error, off Continue", async () => {
    await openDialog();
    await connectTo("http://paperclip.acme.test");
    expect(document.activeElement).toBe(dialog()?.querySelector("input"));
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
    // Again on the same error, which doesn't change.
    button("Continue", dialog() ?? document)?.focus();
    await connectTo("http://paperclip.acme.test");
    expect(document.activeElement).toBe(dialog()?.querySelector("input"));
  });

  it("takes focus to the address when the engine refuses it", async () => {
    await openDialog({ fake: new FakeAgentConnections({ refuseStart: "unreachable" }) });
    await connectTo("https://elsewhere.test");
    expect(document.activeElement).toBe(dialog()?.querySelector("input"));
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
  });

  it("sets the lead in body type, the words in a 12px box, and the bar for high contrast", async () => {
    await openDialog();
    expect(dialog()?.querySelector("p")?.className).toContain("text-body");
    await connectTo("https://paperclip.acme.test");
    expect(dialog()?.querySelector("[data-phrase]")?.className).toContain("rounded-md");
    const fill = dialog()?.querySelector("[data-countdown-fill]");
    expect(fill?.className).toContain("forced-colors:bg-[CanvasText]");
    expect(fill?.parentElement?.className).toContain("forced-colors:border-[CanvasText]");
  });

  it("says why when the engine refuses the address, and opens no page", async () => {
    const fake = new FakeAgentConnections({ refuseStart: "address-not-allowed" });
    const { opened } = await openDialog({ fake });
    await connectTo("https://elsewhere.test");
    expect(text()).toContain("This address didn't answer like Paperclip.");
    expect(opened).toEqual([]);
  });

  it("says when nothing answered at the address", async () => {
    const fake = new FakeAgentConnections({ refuseStart: "unreachable" });
    await openDialog({ fake });
    await connectTo("https://elsewhere.test");
    expect(text()).toContain("Halonic couldn't reach Paperclip at this address.");
  });

  it("says when the server already has 8 sign-ins waiting, under the address", async () => {
    const fake = new FakeAgentConnections({ refuseStart: "too-many-sign-ins" });
    await openDialog({ fake });
    await connectTo("https://paperclip.acme.test");
    const field = dialog()?.querySelector("input");
    const line = document.getElementById(field?.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toBe(
      "This server already has 8 sign-ins waiting for approval. Approve or close one, or try again in 10 minutes.",
    );
    expect(text()).not.toContain("Halonic couldn't start the sign-in.");
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
