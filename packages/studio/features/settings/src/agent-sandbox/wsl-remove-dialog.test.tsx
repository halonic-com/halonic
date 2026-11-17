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
    expect(document.body.textContent).toContain("Your workspace files on Windows aren't touched.");
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

  it("has no Cancel choice, and says why Remove sandbox can't be used before one is picked", async () => {
    const removeWslSetup = vi.fn(async () => ({ outcome: "kept" }) as WslRemoveResult);
    await toChoice(fakeHost({ removeWslSetup }));
    expect(radio("Cancel")).toBeUndefined();
    const remove = button("Remove sandbox") as HTMLElement;
    expect(
      document.getElementById(remove.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Choose what happens to the contents first.");
    await click(remove);
    expect(removeWslSetup).not.toHaveBeenCalled();
    await click(radio("Remove without a backup") as HTMLElement);
    expect(document.body.textContent).not.toContain("Choose what happens");
  });

  it("announces Sandbox removed once, when the sandbox is gone", async () => {
    const announced: string[] = [];
    const host = fakeHost({ removeWslSetup: async () => ({ outcome: "removed" }) });
    render(
      <AgentSandboxHostView host={host} place="app" announce={(line) => announced.push(line)} />,
    );
    await act(async () => {});
    await press("Remove sandbox setup");
    await press("Continue");
    await click(radio("Remove without a backup") as HTMLElement);
    await press("Remove sandbox without a backup");
    expect(announced).toEqual(["Sandbox removed"]);
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
    expect(document.body.textContent).toContain("The sandbox couldn't be removed");
    expect(document.body.textContent).toContain("Your backup is saved at b.tar.");
    expect(document.body.textContent).toContain("Something went wrong.");
  });

  it("retries only the removal once the backup is saved", async () => {
    const requests: WslRemoveRequest[] = [];
    const host = fakeHost({
      chooseBackupFile: async () => "b.tar",
      removeWslSetup: async (request) => {
        requests.push(request);
        return { outcome: "failed", reason: "unregister-failed", detail: "" };
      },
    });
    await toChoice(host);
    await click(radio("Save a backup") as HTMLElement);
    await press("Choose location…");
    await press("Save backup and remove sandbox");
    await press("Try again");
    expect(requests).toEqual([
      { choice: "export-then-remove", file: "b.tar" },
      { choice: "remove-only" },
    ]);
  });

  it("doesn't claim a backup when the host throws, and retries the same request", async () => {
    const requests: WslRemoveRequest[] = [];
    const host = fakeHost({
      chooseBackupFile: async () => "b.tar",
      removeWslSetup: async (request) => {
        requests.push(request);
        throw new Error("busy");
      },
    });
    await toChoice(host);
    await click(radio("Save a backup") as HTMLElement);
    await press("Choose location…");
    await press("Save backup and remove sandbox");
    expect(document.body.textContent).toContain("The sandbox couldn't be removed");
    expect(document.body.textContent).not.toContain("Your backup is saved");
    expect(document.body.textContent).toContain("busy");
    await press("Try again");
    expect(requests).toEqual([
      { choice: "export-then-remove", file: "b.tar" },
      { choice: "export-then-remove", file: "b.tar" },
    ]);
  });

  it("offers another location only for a refused backup file", async () => {
    let reason: "distro-not-ours" | "bad-export-file" = "distro-not-ours";
    const host = fakeHost({
      removeWslSetup: async () => ({ outcome: "refused", reason }),
    });
    await toChoice(host);
    await click(radio("Remove without a backup") as HTMLElement);
    await press("Remove sandbox without a backup");
    expect(document.body.textContent).toContain("The sandbox wasn't removed");
    expect(button("Choose another location")).toBeUndefined();
    expect(button("Try again")).toBeUndefined();
    unmountAll();
    reason = "bad-export-file";
    await toChoice(host);
    await click(radio("Remove without a backup") as HTMLElement);
    await press("Remove sandbox without a backup");
    expect(button("Choose another location")).toBeDefined();
  });

  it("offers no backup choice when the host can't ask for a file", async () => {
    await toChoice(fakeHost({ removeWslSetup: async () => ({ outcome: "kept" }) }));
    expect(radio("Save a backup")?.disabled).toBe(true);
  });
});
