// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { recordScrolls, settled } from "./test/connect-page-harness.ts";

const pageFile = join(process.cwd(), "connect.html");
const addressKey = "halonic.connect.address";

/** Records each call into the shell and answers it from `answer`. */
function installShell(answer: (command: string) => Promise<unknown>): ReturnType<typeof vi.fn> {
  const invoke = vi.fn((command: string) => answer(command));
  Reflect.set(window, "__TAURI_INTERNALS__", { invoke });
  return invoke;
}

/**
 * Runs `main.ts` the way the browser does: on connect.html's body, at the
 * time the module is first imported.
 */
async function runMain(): Promise<void> {
  vi.resetModules();
  const parsed = new DOMParser().parseFromString(readFileSync(pageFile, "utf8"), "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  await import("./main.ts");
  await settled();
}

function shownScreen(): string | undefined {
  return [...document.querySelectorAll<HTMLElement>("[data-screen]")].find(
    (screen) => !screen.hidden,
  )?.dataset["screen"];
}

function field(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("#address") as HTMLInputElement;
}

function press(selector: string): void {
  document.querySelector<HTMLButtonElement>(selector)?.click();
}

async function pressConnect(address: string): Promise<void> {
  field().value = address;
  document.querySelector<HTMLButtonElement>('[data-action="connect"]')?.click();
  await settled();
}

// Each test imports `main.ts` afresh, which runs it. Loading its modules once
// first keeps a loaded machine from spending a test's time on the first load.
beforeAll(async () => {
  await Promise.all([
    import("@halonicjs/studio-services"),
    import("./connect-page.ts"),
    import("./tauri-bridge.ts"),
  ]);
}, 60_000);

let restoreScrolling = (): void => undefined;

beforeEach(() => {
  location.hash = "";
  // A field error scrolls Connect into view, which jsdom can't do.
  restoreScrolling = recordScrolls().restore;
});

afterEach(() => {
  restoreScrolling();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  document.body.replaceChildren();
  localStorage.clear();
});

verifies("studio.connect.shell-bridge", () => {
  it("outside the app, ends every Connect on Can't reach without a raw error", async () => {
    await runMain();

    await pressConnect("192.168.1.20:4280");

    expect(shownScreen()).toBe("connect");
    const error = document.querySelector<HTMLElement>("#address-error");
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toContain("192.168.1.20:4280");
    expect(error?.textContent).not.toContain("Android");
    expect(localStorage.getItem(addressKey)).toBeNull();
  });

  it("outside the app, ignores Open release page", async () => {
    await runMain();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    document.querySelector<HTMLButtonElement>('[data-action="open-release-page"]')?.click();
    await settled();

    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(shownScreen()).toBe("connect");
  });

  it("in the app, asks the shell's connect command about the typed address", async () => {
    const invoke = installShell(() => Promise.resolve({ kind: "notHomeNetwork" }));
    await runMain();

    await pressConnect("8.8.8.8:4280");

    expect(invoke).toHaveBeenCalledExactlyOnceWith("connect", { address: "8.8.8.8:4280" });
    expect(shownScreen()).toBe("connect");
    expect(document.querySelector<HTMLElement>("#address-error")?.hidden).toBe(false);
  });

  it("in the app, on success remembers the address and marks the history entry", async () => {
    // jsdom can only navigate within the page, so the shell confirms a hash.
    installShell(() => Promise.resolve({ kind: "connected", url: "#studio" }));
    const replaceState = vi.spyOn(history, "replaceState");
    await runMain();

    await pressConnect("192.168.1.20:4280");

    expect(localStorage.getItem(addressKey)).toBe("192.168.1.20:4280");
    expect(replaceState).toHaveBeenCalledWith(null, "", "#change-address");
    expect(location.hash).toBe("#studio");
    replaceState.mockRestore();
  });

  it("in the app, on failure reads a refused call as Can't reach and remembers nothing", async () => {
    installShell(() => Promise.reject(new Error("The shell refused.")));
    await runMain();

    await pressConnect("192.168.1.20:4280");

    const error = document.querySelector<HTMLElement>("#address-error");
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).not.toContain("refused");
    expect(localStorage.getItem(addressKey)).toBeNull();
  });
});

verifies("studio.connect.remembered-address", () => {
  it("opens on the connect screen with the address filled in for #change-address, and asks nothing", async () => {
    localStorage.setItem(addressKey, "192.168.1.20:4280");
    location.hash = "#change-address";
    const invoke = installShell(() => Promise.resolve({ kind: "notAnswering", address: "" }));

    await runMain();

    expect(shownScreen()).toBe("connect");
    expect(field().value).toBe("192.168.1.20:4280");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("asks about a remembered address at start when the hash is not #change-address", async () => {
    localStorage.setItem(addressKey, "192.168.1.20:4280");
    const invoke = installShell(() =>
      Promise.resolve({ kind: "notAnswering", address: "192.168.1.20:4280" }),
    );

    await runMain();

    expect(invoke).toHaveBeenCalledExactlyOnceWith("connect", { address: "192.168.1.20:4280" });
    expect(shownScreen()).toBe("not-answering");
  });

  it("on cancel, drops the late answer and stays on the connect screen", async () => {
    localStorage.setItem(addressKey, "192.168.1.20:4280");
    const late = Promise.withResolvers<unknown>();
    const answers = [
      Promise.resolve({ kind: "notAnswering", address: "192.168.1.20:4280" }),
      late.promise,
    ];
    installShell(() => answers.shift() ?? Promise.reject(new Error("Asked too often.")));
    await runMain();
    press('[data-screen="not-answering"] [data-action="try-again"]');
    await settled();

    press('[data-screen="not-answering"] [data-action="change-address"]');
    late.resolve({ kind: "connected", url: "#studio" });
    await settled();

    expect(shownScreen()).toBe("connect");
    expect(location.hash).not.toBe("#studio");
    expect(localStorage.getItem(addressKey)).toBe("192.168.1.20:4280");
  });
});
