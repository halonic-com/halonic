// @vitest-environment jsdom
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type UnfencedYesHost, UnfencedYesService } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSandboxSection } from "./agent-sandbox-section.tsx";
import { UnfencedYesBlock } from "./unfenced-yes.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

type Status = Awaited<ReturnType<UnfencedYesHost["status"]>>;
type Allowed = Awaited<ReturnType<UnfencedYesHost["allow"]>>;

const title = "Allow plugins and integrations to run without the sandbox?";
const checkboxWords =
  "I understand plugins and integrations run without the sandbox on this computer";
const containerReason = "Halonic is running inside a container, and the sandbox can't start there.";
const needsYes: Status = { run: "needs-yes", reason: "container" };
const saved = { reason: "container", allowedAt: "2026-11-23T10:00:00" };

/** A host whose status the test sets; `allow` answers as the test says. */
function fakeHost(first: Status, allow: UnfencedYesHost["allow"] = async () => null) {
  let status = first;
  const host = {
    status: vi.fn(async () => status),
    allow: vi.fn(allow),
    takeBack: vi.fn(async () => {}),
  } satisfies UnfencedYesHost;
  return {
    host,
    setStatus: (next: Status) => {
      status = next;
    },
  };
}

async function show(host: UnfencedYesHost, announce = vi.fn()) {
  const view = render(<UnfencedYesBlock host={host} announce={announce} />);
  await act(async () => {});
  return { view, announce };
}

/** A button by its label; a button with a busy label holds both, its label first. */
function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith(label),
  );
}

const dialog = () => document.querySelector<HTMLDialogElement>("dialog[open]");
/** The dialog's confirming button, apart from Allow… under the block. */
const allowButton = () =>
  [...(dialog()?.querySelectorAll("button") ?? [])].find((each) =>
    each.textContent?.startsWith("AllowAllowing…"),
  );
const box = () => dialog()?.querySelector<HTMLInputElement>("input[type=checkbox]");

/** Presses Allow… and waits for the dialog. */
async function openAllow() {
  await click(button("Allow…") as HTMLButtonElement);
}

/** Ticks the box and presses Allow, then lets the host's answer and the read after it land. */
async function tickAndAllow() {
  await click(box() as HTMLInputElement);
  await click(allowButton() as HTMLButtonElement);
  await act(async () => {});
}

/** A refusal as the agent host client throws it: `AgentHostError`'s kind and message. */
function hostError(kind: string, message: string): Error {
  return Object.assign(new Error(message), { kind });
}

/** Agent sandbox as the settings container draws it, with only the yes. */
async function section(host: UnfencedYesHost) {
  const services = new Map<unknown, unknown>([[UnfencedYesService, host]]);
  const context = {
    services: {
      find: (key: unknown) => services.get(key),
      get: (key: unknown) => services.get(key),
    },
    announcer: { announce: () => {} },
    settingsSections: [{ id: "plugins", title: "Plugins" }],
    openSettings: vi.fn(),
  } as unknown as SettingsSectionProps["context"];
  const view = render(
    <AgentSandboxSection context={context} place="app" surface="window" closeSettings={() => {}} />,
  );
  await act(async () => {});
  return view;
}

verifies("settings.unfenced-yes-where", () => {
  it("offers Allow… in place of a pointer to Plugins while a yes is needed", async () => {
    const { view } = await show(fakeHost(needsYes).host);

    expect(button("Allow…")).toBeDefined();
    expect(view.textContent).not.toContain("Give it from a plugin's page");
    expect(button("Open Plugins")).toBeUndefined();
  });

  it("asks with R3's reason and R5's checkbox, and Allow waits for the tick", async () => {
    const { host } = fakeHost(needsYes);
    await show(host);
    await openAllow();

    expect(dialog()?.textContent).toContain(title);
    expect(dialog()?.textContent).toContain(containerReason);
    expect(dialog()?.textContent).toContain(
      "Run Halonic on the computer itself, not in a container.",
    );
    const docs = dialog()?.querySelector<HTMLAnchorElement>("a");
    expect(docs?.textContent).toContain("Why the sandbox needs a real computer");
    expect(docs?.href).toBe("https://docs.halonic.dev/security/sandbox/#container");
    expect(dialog()?.textContent).toContain(checkboxWords);
    expect(box()?.checked).toBe(false);
    expect(allowButton()?.getAttribute("aria-disabled")).toBe("true");

    await click(allowButton() as HTMLButtonElement);
    expect(host.allow).not.toHaveBeenCalled();
  });

  it("saves the yes for the reason shown, then shows it with Take back", async () => {
    const fake = fakeHost(needsYes, async () => {
      fake.setStatus({ run: "allowed", ...saved });
      return saved;
    });
    const { view, announce } = await show(fake.host);
    await openAllow();
    await tickAndAllow();

    expect(fake.host.allow).toHaveBeenCalledExactlyOnceWith("container");
    expect(dialog()).toBeNull();
    expect(view.textContent).toContain("Allowed without the sandbox");
    expect(button("Take back")).toBeDefined();
    expect(button("Allow…")).toBeUndefined();
    expect(announce).toHaveBeenCalledWith("Allowed without the sandbox");
    expect(document.activeElement).toBe(view.querySelector("h4"));
  });

  it("saves nothing on Cancel", async () => {
    const { host } = fakeHost(needsYes);
    await show(host);
    await openAllow();
    await click(box() as HTMLInputElement);
    await click(button("Cancel") as HTMLButtonElement);
    await act(async () => {});

    expect(dialog()).toBeNull();
    expect(host.allow).not.toHaveBeenCalled();
    expect(button("Allow…")).toBeDefined();
  });

  it("keeps asking with the new reason, unticked, when the host saved nothing", async () => {
    const fake = fakeHost(needsYes, async () => {
      fake.setStatus({ run: "needs-yes", reason: "no-sandbox" });
      return null;
    });
    await show(fake.host);
    await openAllow();
    await tickAndAllow();
    await act(async () => {});

    expect(dialog()?.textContent).toContain(
      "You chose to continue without a sandbox on this computer.",
    );
    expect(dialog()?.textContent).not.toContain(containerReason);
    expect(box()?.checked).toBe(false);
    expect(document.activeElement).toBe(box());
    expect(allowButton()?.getAttribute("aria-disabled")).toBe("true");
  });

  it("says why when the host couldn't save the yes", async () => {
    const { host } = fakeHost(needsYes, async () => {
      throw hostError("allow_failed", "The yes couldn't be written.");
    });
    await show(host);
    await openAllow();
    await tickAndAllow();
    // The Dialog's alert slot fills a frame after the request ends.
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    expect(dialog()?.textContent).toContain(
      "Halonic couldn't save your yes to run plugins and integrations without the sandbox.",
    );
    expect(button("Take back")).toBeUndefined();
  });

  it("offers no Allow… while a yes is saved, the host can't say, or for a reason it has no words for", async () => {
    await show(fakeHost({ run: "allowed", ...saved }).host);
    expect(button("Allow…")).toBeUndefined();
    unmountAll();

    await show({
      status: vi.fn(async () => Promise.reject(new Error("no host"))),
      allow: vi.fn<() => Promise<Allowed>>(),
      takeBack: vi.fn(),
    });
    expect(button("Allow…")).toBeUndefined();
    unmountAll();

    await show(fakeHost({ run: "needs-yes", reason: "a-newer-reason" }).host);
    expect(button("Allow…")).toBeUndefined();
  });

  it("offers Allow… again once Take back has taken the yes back", async () => {
    const fake = fakeHost({ run: "allowed", ...saved });
    fake.host.takeBack.mockImplementation(async () => fake.setStatus(needsYes));
    await show(fake.host);

    await click(button("Take back") as HTMLButtonElement);
    await act(async () => {});

    expect(button("Take back")).toBeUndefined();
    expect(button("Allow…")).toBeDefined();
  });

  it("gives the yes from Agent sandbox through the window's one yes object", async () => {
    const fake = fakeHost(needsYes, async () => {
      fake.setStatus({ run: "allowed", ...saved });
      return saved;
    });
    const view = await section(fake.host);
    await openAllow();
    await tickAndAllow();

    expect(fake.host.allow).toHaveBeenCalledExactlyOnceWith("container");
    expect(view.textContent).toContain("Allowed without the sandbox");
  });
});
