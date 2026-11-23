// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AgentSandboxHost } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSandboxHostView } from "./agent-sandbox-section.tsx";
import type { SandboxCheckFacts, SandboxFacts } from "./sandbox-state.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const kept = { state: "needs-setup", accessKept: true } as const;
const ready = { state: "ready", checkedAt: "2026-11-09T09:12:00" } as const;
const KEPT_LINE =
  "The sandbox still has access to some of your project folders. To end it, remove the sandbox.";

/** The section over a host whose check says `check`. */
async function section(check: SandboxCheckFacts, place: SandboxFacts["place"] = "app") {
  const host = {
    available: true,
    check: async () => check,
    running: async () => null,
    setUp: async () => null,
    remove: async () => null,
    follow: async () => null,
  } satisfies AgentSandboxHost;
  const view = render(<AgentSandboxHostView host={host} place={place} announce={() => {}} />);
  await act(async () => {});
  return view;
}

/** The text of the Remove dialog that **Remove the sandbox…** opens. */
async function removeDialogText(view: HTMLElement): Promise<string> {
  const opener = [...view.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith("Remove the sandbox…"),
  );
  if (opener === undefined) throw new Error(`No Remove button in: ${view.textContent}`);
  await click(opener);
  return document.querySelector("dialog[open]")?.textContent ?? "";
}

verifies("settings.agent-sandbox-access-kept", () => {
  it("says under the lead why Remove shows while access is kept", async () => {
    const view = await section(kept);
    expect(view.textContent).toContain(KEPT_LINE);
    expect(view.textContent).toContain("The sandbox needs a one-time setup");
  });

  it("doesn't say it in served Studio, which has no Remove", async () => {
    const view = await section(kept, "served");
    expect(view.textContent).not.toContain(KEPT_LINE);
  });

  it("says in the dialog that removing ends the kept access", async () => {
    const dialog = await removeDialogText(await section(kept));
    expect(dialog).toContain(
      "This ends the access the sandbox still has to some of your project folders. Halonic must be open normally, not as administrator.",
    );
    expect(dialog).not.toContain("won't start");
  });

  it("keeps the ordinary dialog when the sandbox is Ready", async () => {
    const view = await section(ready);
    expect(view.textContent).not.toContain(KEPT_LINE);
    expect(await removeDialogText(view)).toContain(
      "Agents set to run in a sandbox won't start until you set it up again.",
    );
  });
});
