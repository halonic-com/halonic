// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentSandboxHost, WslRemoveRequest, WslRemoveResult } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSandboxHostView } from "./agent-sandbox-section.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

function fakeHost(over: Partial<AgentSandboxHost>): AgentSandboxHost {
  return {
    available: true,
    check: async () => ({ state: "needs-setup" }),
    running: async () => null,
    setUp: async () => null,
    remove: async () => null,
    follow: async () => null,
    ...over,
  };
}

/** The open dialog's buttons first; a button's text carries its busy label after its own. */
const button = (label: string) => {
  const root = document.querySelector("dialog[open]") ?? document;
  return [...root.querySelectorAll("button")].find((each) => each.textContent?.startsWith(label));
};
const press = (label: string) => {
  const found = button(label);
  if (!found) throw new Error(`No button ${label}`);
  return click(found);
};

async function open(host: AgentSandboxHost, place: "app" | "served" = "app") {
  render(<AgentSandboxHostView host={host} place={place} announce={() => {}} />);
  await act(async () => {});
}

async function toChoice(host: AgentSandboxHost) {
  await open(host);
  await press("Remove sandbox setup");
  await press("Continue");
}

const radio = (label: string) =>
  [...document.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((each) =>
    each.closest("label")?.textContent?.startsWith(label),
  );

verifies("settings.wsl-remove-dialog", () => {
  it("offers the removal only when the host can do it and Studio isn't served", async () => {
    await open(fakeHost({}));
    expect(button("Remove sandbox setup")).toBeUndefined();
    unmountAll();
    await open(fakeHost({ removeWslSetup: async () => ({ outcome: "kept" }) }), "served");
    expect(button("Remove sandbox setup")).toBeUndefined();
  });

  it("explains first and removes nothing on Cancel", async () => {
    const removeWslSetup = vi.fn(async () => ({ outcome: "kept" }) as WslRemoveResult);
    await open(fakeHost({ removeWslSetup }));
    await press("Remove sandbox setup");
    expect(document.body.textContent).toContain("Your workspaces on Windows are not touched.");
    await press("Cancel");
    expect(removeWslSetup).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Your workspaces on Windows");
  });

  it("starts with nothing picked and removes nothing until confirmed", async () => {
    const removeWslSetup = vi.fn(async () => ({ outcome: "kept" }) as WslRemoveResult);
    await toChoice(fakeHost({ removeWslSetup }));
    expect(document.body.textContent).toContain("What should happen to the sandbox contents?");
    expect(radio("Remove without a backup")?.checked).toBe(false);
    expect(button("Remove sandbox")).toBeDefined();
    expect(removeWslSetup).not.toHaveBeenCalled();
  });

  it("removes without a backup and says it's gone", async () => {
    const requests: WslRemoveRequest[] = [];
    const removeWslSetup = async (request: WslRemoveRequest): Promise<WslRemoveResult> => {
      requests.push(request);
      return { outcome: "removed" };
    };
    await toChoice(fakeHost({ removeWslSetup }));
    await click(radio("Remove without a backup") as HTMLElement);
    await press("Remove sandbox without a backup");
    expect(requests).toEqual([{ choice: "remove-only" }]);
    expect(document.body.textContent).toContain("Sandbox removed");
    expect(document.body.textContent).toContain("Halonic's sandbox is gone from this computer.");
  });

  it("closes on the Cancel choice without asking the host", async () => {
    const removeWslSetup = vi.fn(async () => ({ outcome: "kept" }) as WslRemoveResult);
    await toChoice(fakeHost({ removeWslSetup }));
    await click(radio("Cancel") as HTMLElement);
    expect(document.body.textContent).not.toContain("What should happen");
    expect(removeWslSetup).not.toHaveBeenCalled();
  });

  it("saves a backup to the chosen file, then shows where it is", async () => {
    const requests: WslRemoveRequest[] = [];
    const shown: string[] = [];
    const host = fakeHost({
      chooseBackupFile: async () => "backups/halonic.tar",
      removeWslSetup: async (request) => {
        requests.push(request);
        return { outcome: "removed", exportedTo: "backups/halonic.tar" };
      },
      showInFolder: async (path) => void shown.push(path),
    });
    await toChoice(host);
    await click(radio("Save a backup") as HTMLElement);
    await press("Choose location…");
    expect(document.body.textContent).toContain("Save to: backups/halonic.tar");
    await press("Save backup and remove sandbox");
    expect(requests).toEqual([{ choice: "export-then-remove", file: "backups/halonic.tar" }]);
    expect(document.body.textContent).toContain("Your backup is saved at backups/halonic.tar.");
    await press("Show in folder");
    expect(shown).toEqual(["backups/halonic.tar"]);
  });

  it("says nothing was removed when the backup fails, and keeps the details", async () => {
    const host = fakeHost({
      chooseBackupFile: async () => "backups/halonic.tar",
      removeWslSetup: async () => ({
        outcome: "failed",
        reason: "export-failed",
        detail: "disk is full",
      }),
    });
    await toChoice(host);
    await click(radio("Save a backup") as HTMLElement);
    await press("Choose location…");
    await press("Save backup and remove sandbox");
    expect(document.body.textContent).toContain("The backup didn't work, so nothing was removed");
    expect(document.body.textContent).toContain("Your sandbox is unchanged.");
    expect(document.body.textContent).toContain("disk is full");
    expect(button("Try again")).toBeDefined();
    expect(button("Choose another location")).toBeDefined();
  });

  it("keeps the backup in the message when the removal fails after it", async () => {
    const host = fakeHost({
      chooseBackupFile: async () => "b.tar",
      removeWslSetup: async () => ({
        outcome: "failed",
        reason: "unregister-failed",
        detail: "",
      }),
    });
    await toChoice(host);
    await click(radio("Save a backup") as HTMLElement);
    await press("Choose location…");
    await press("Save backup and remove sandbox");
    expect(document.body.textContent).toContain("The sandbox could not be removed");
    expect(document.body.textContent).toContain("Your backup is saved at b.tar.");
    expect(document.body.textContent).toContain("Something went wrong.");
  });

  it("offers no backup choice when the host can't ask for a file", async () => {
    await toChoice(fakeHost({ removeWslSetup: async () => ({ outcome: "kept" }) }));
    expect(radio("Save a backup")?.disabled).toBe(true);
  });
});
