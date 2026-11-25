// @vitest-environment jsdom

import { FakeRemoteControl } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PairDialog } from "./pairing/pair-dialog.tsx";
import { RemoteSection } from "./settings/remote-section.tsx";
import { remoteContext, settle } from "./test-support/context.ts";
import { render, unmountAll } from "./test-support/render.tsx";

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => undefined;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(unmountAll);

/** The refusal the agent host client gives when the person said no in the shell's dialog. */
const declined = () =>
  Promise.reject(Object.assign(new Error("Cancelled in the shell."), { kind: "declined" }));

async function press(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) throw new Error("Nothing to press");
  act(() => element.click());
  await settle();
}

async function renderSection(remote: FakeRemoteControl) {
  const announced: string[] = [];
  const view = render(
    <RemoteSection
      context={remoteContext(remote, announced)}
      closeSettings={() => undefined}
      place="app"
      surface="window"
    />,
  );
  await settle();
  const switchNamed = (name: string) =>
    view.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
  return { view, announced, switchNamed };
}

verifies("remote.shell-declined", () => {
  it("keeps remote off with no error after a no in the shell's dialog", async () => {
    const remote = new FakeRemoteControl();
    remote.setRemote = declined;
    const { view, announced, switchNamed } = await renderSection(remote);

    await press(switchNamed("Let phones reach this computer"));

    expect(switchNamed("Let phones reach this computer")?.checked).toBe(false);
    expect(view.textContent).not.toContain("Couldn't turn remote on");
    expect(view.querySelector(".text-danger")).toBeNull();
    expect(announced).toEqual([]);
  });

  it("keeps the risky switch off with no error after a no in the shell's dialog", async () => {
    const remote = new FakeRemoteControl();
    remote.setAllowRiskyRemotely = declined;
    const { view, announced, switchNamed } = await renderSection(remote);

    await press(switchNamed("Let phones answer risky approvals"));

    expect(switchNamed("Let phones answer risky approvals")?.checked).toBe(false);
    expect(view.textContent).not.toContain("Couldn't save the risky approvals setting");
    expect(announced).toEqual([]);
  });

  it("keeps Check the code waiting with no error after a no to Allow", async () => {
    const remote = new FakeRemoteControl();
    const start = remote.startPairing.bind(remote);
    vi.spyOn(remote, "startPairing").mockImplementation(async () => {
      const session = await start();
      vi.spyOn(session, "allow").mockImplementation(declined);
      return session;
    });
    render(
      <PairDialog
        remote={remote}
        provider="tailscale"
        allowRisky={false}
        openExternal={() => undefined}
        onClose={() => undefined}
        onCloseFailed={() => undefined}
      />,
    );
    await settle();
    remote.phoneUsesCode({ name: "Pixel 8" });
    await settle();

    const dialog = document.querySelector("dialog");
    await press(
      [...(dialog?.querySelectorAll("button") ?? [])].find(
        (found) => found.textContent?.trim() === "AllowAllowing…",
      ),
    );
    // The dialog's alert slot would fill a frame after the request ends.
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    expect(remote.snapshot.phones).toEqual([]);
    expect(dialog?.textContent).toContain("Check the code");
    expect(dialog?.textContent).not.toContain("Couldn't pair");
  });
});
