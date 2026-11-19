// @vitest-environment jsdom

import { FakeRemoteControl } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { remoteContext, settle } from "../test-support/context.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RemoteSection } from "./remote-section.tsx";

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

const twoDaysAgo = () => new Date(Date.now() - 2 * 86_400_000).toISOString();

/** A fake with Pixel 8 connected and Tim's Galaxy S22 last seen two days ago. */
async function twoPhones(on = true) {
  const remote = new FakeRemoteControl();
  if (on) await remote.setRemote(true);
  remote.addPhone({ name: "Pixel 8", connected: true });
  remote.addPhone({ name: "Tim's Galaxy S22", lastSeenAt: twoDaysAgo() });
  return remote;
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
  const press = async (element: Element | undefined) => {
    if (!(element instanceof HTMLElement)) throw new Error("Nothing to press");
    act(() => element.click());
    await settle();
  };
  const button = (label: string, within: ParentNode = view) =>
    [...within.querySelectorAll("button")].find((found) => found.textContent?.trim() === label);
  const dialog = () => document.querySelector("dialog");
  // The confirming button holds its busy label too, to keep its width: "RevokeRevoking…".
  const confirm = (label: string) =>
    [...(dialog()?.querySelectorAll("button") ?? [])].find((found) =>
      found.textContent?.startsWith(`${label}Revoking…`),
    );
  return { view, announced, press, button, dialog, confirm };
}

verifies("remote.paired-phones", () => {
  it("lists each phone with what it can do and whether it is connected", async () => {
    const { view, button } = await renderSection(await twoPhones());

    expect(view.querySelector("h3")?.textContent).toBe("Paired phones · 2");
    const rows = [...view.querySelectorAll("li")].map((row) => row.textContent);
    expect(rows[0]).toContain("Pixel 8");
    expect(rows[0]).toMatch(/Android · Paired \d+ [A-Z][a-z]{2}/u);
    expect(rows[0]).toContain("Can: view agents, approve, send prompts");
    expect(rows[0]).toContain("Connected now");
    expect(rows[1]).toContain("Last seen 2 days ago");
    expect(button("Revoke Pixel 8")).toBeDefined();
    expect(button("Revoke all")).toBeDefined();
    expect(view.textContent).not.toContain("No phones paired");
  });

  it("says Remote is off on every row while it is, and Revoke still works", async () => {
    const remote = await twoPhones(false);
    const { view, press, button, confirm } = await renderSection(remote);

    const rows = [...view.querySelectorAll("li")].map((row) => row.textContent);
    expect(rows.every((row) => row?.includes("Remote is off"))).toBe(true);

    await press(button("Revoke Pixel 8"));
    await press(confirm("Revoke"));

    expect(remote.snapshot.phones.map((phone) => phone.name)).toEqual(["Tim's Galaxy S22"]);
  });

  it("shows Revoke all only from two phones", async () => {
    const remote = new FakeRemoteControl();
    remote.addPhone({ name: "Pixel 8" });
    const { button } = await renderSection(remote);

    expect(button("Revoke Pixel 8")).toBeDefined();
    expect(button("Revoke all")).toBeUndefined();
  });

  it("asks once before revoking a phone, then announces it", async () => {
    const remote = new FakeRemoteControl();
    remote.addPhone({ name: "Pixel 8" });
    const { view, announced, press, button, dialog, confirm } = await renderSection(remote);

    await press(button("Revoke Pixel 8"));

    expect(dialog()?.textContent).toContain("Revoke Pixel 8?");
    expect(dialog()?.textContent).toContain(
      "Pixel 8 is cut off now: its open sessions close and it can't reconnect. Your agents keep running on this computer, and anything waiting for an answer waits for you here.",
    );
    expect(dialog()?.textContent).toContain("To use it again, pair it again.");
    expect(remote.snapshot.phones).toHaveLength(1);

    await press(confirm("Revoke"));

    expect(remote.snapshot.phones).toEqual([]);
    expect(announced).toEqual(["Pixel 8 revoked."]);
    expect(dialog()).toBeNull();
    expect(view.textContent).toContain("No phones paired");
  });

  it("asks once before revoking every phone", async () => {
    const remote = await twoPhones();
    const { announced, press, button, dialog, confirm } = await renderSection(remote);

    await press(button("Revoke all"));

    expect(dialog()?.textContent).toContain("Revoke all 2 phones?");
    expect(dialog()?.textContent).toContain(
      "Both phones are cut off now: open sessions close and neither can reconnect.",
    );
    expect(dialog()?.textContent).toContain("To use a phone again, pair it again.");

    await press(confirm("Revoke all"));

    expect(remote.snapshot.phones).toEqual([]);
    expect(announced).toEqual(["All phones revoked."]);
  });

  it("keeps the dialog open and says so when a revoke fails", async () => {
    const remote = new FakeRemoteControl();
    remote.addPhone({ name: "Pixel 8" });
    remote.revoke = () => Promise.reject(new Error("the host didn't answer"));
    const { announced, press, button, dialog, confirm } = await renderSection(remote);

    await press(button("Revoke Pixel 8"));
    await press(confirm("Revoke"));
    // The dialog's alert slot fills a frame after the request ends.
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    expect(dialog()?.textContent).toContain("Couldn't revoke Pixel 8. Try again.");
    expect(dialog()?.textContent).not.toContain("the host didn't answer");
    expect(remote.snapshot.phones).toHaveLength(1);
    expect(announced).toEqual([]);
  });
});
