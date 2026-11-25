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

const rightToLeftOverride = String.fromCodePoint(0x202e);
const zeroWidthSpace = String.fromCodePoint(0x200b);

/** Settings › Remote with one phone paired under `name`. */
async function renderWithPhone(name: string) {
  const remote = new FakeRemoteControl();
  remote.addPhone({ name });
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
  return { view, announced };
}

async function openRevoke(view: HTMLElement) {
  const revoke = [...view.querySelectorAll("button")].find((found) =>
    found.textContent?.startsWith("Revoke "),
  );
  if (revoke === undefined) throw new Error("No Revoke button");
  act(() => revoke.click());
  await settle();
  return document.querySelector("dialog");
}

verifies("remote.paired-phones-name", () => {
  it("marks a direction character in the phone's row and its Revoke button", async () => {
    const { view } = await renderWithPhone(`Pixel${rightToLeftOverride}8`);

    const row = view.querySelector("li");
    expect(row?.querySelector("p.text-fg")?.textContent).toBe("Pixel⟦U+202E⟧8");
    expect(row?.querySelector("p.text-fg .text-attention")?.textContent).toBe("⟦U+202E⟧");
    expect(row?.querySelector("button")?.textContent).toBe("Revoke Pixel⟦U+202E⟧8");
    expect(view.textContent).not.toContain(rightToLeftOverride);
  });

  it("marks a zero-width character in the revoke dialog", async () => {
    const { view } = await renderWithPhone(`Pixel${zeroWidthSpace}8`);

    const dialog = await openRevoke(view);

    expect(dialog?.textContent).toContain("Revoke Pixel⟦U+200B⟧8?");
    expect(dialog?.textContent).toContain("Pixel⟦U+200B⟧8 is cut off now");
    expect(dialog?.textContent).not.toContain(zeroWidthSpace);
  });

  it("caps a long name at 64 characters in the row and the dialog", async () => {
    const { view } = await renderWithPhone("a".repeat(100));

    expect(view.querySelector("li p.text-fg")?.textContent).toBe(`${"a".repeat(64)}…`);
    const dialog = await openRevoke(view);
    expect(dialog?.textContent).toContain(`Revoke ${"a".repeat(64)}…?`);
    expect(dialog?.textContent).not.toContain("a".repeat(65));
  });
});
