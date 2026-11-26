// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ListedComputer,
  PhoneAppMount,
  PhoneTunnel,
} from "@halonicjs/studio-feature-remote/phone";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, expect, it, vi } from "vitest";
import type { PairingScanner } from "./pair-scan.ts";
import { type PageOptions, startPage } from "./start-page.ts";
import { FakeShell, MemoryStore, settled } from "./test/connect-page-harness.ts";

const pageFile = join(process.cwd(), "connect.html");

beforeEach(() => {
  const parsed = new DOMParser().parseFromString(readFileSync(pageFile, "utf8"), "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
});

const scanner: PairingScanner = {
  scan: () => Promise.resolve({ kind: "closed" }),
  close: () => Promise.resolve(),
};

const laptop = { id: "computer-1", name: "Tim's laptop" } as unknown as ListedComputer;

/** A tunnel that lists `computers` (or throws it), all the launch rule asks of it. */
function tunnelListing(computers: readonly ListedComputer[] | Error): PhoneTunnel {
  return {
    pairedComputers: () =>
      computers instanceof Error ? Promise.reject(computers) : Promise.resolve(computers),
  } as PhoneTunnel;
}

/** The page's options; `tunnel` decides which page it is. */
function options(shell: FakeShell, tunnel: PhoneTunnel | undefined): PageOptions {
  return {
    document,
    bridge: shell,
    store: new MemoryStore("192.168.1.20:4280"),
    changeAddress: false,
    pageNotShown: false,
    tunnel,
    scanner,
    window,
    openSettings: () => undefined,
    openTailscale: () => undefined,
    report: () => undefined,
  };
}

const shownScreens = () =>
  [...document.querySelectorAll<HTMLElement>("[data-screen]")]
    .filter((screen) => !screen.hidden)
    .map((screen) => screen.dataset["screen"]);

/** A phone app that records how it was mounted, in place of the real one. */
function fakePhoneApp() {
  const mounted: { container: HTMLElement; mount: PhoneAppMount }[] = [];
  const load = vi.fn(async () => ({
    mountPhoneApp: (container: HTMLElement, mount: PhoneAppMount) => {
      mounted.push({ container, mount });
      return () => undefined;
    },
  }));
  return { mounted, load };
}

verifies("studio.connect.phone-tunnel-screens", () => {
  it("is the 0.1 connect page without a tunnel, and loads no phone app", async () => {
    const shell = new FakeShell().answer({ kind: "notAnswering", address: "192.168.1.20:4280" });
    const phoneApp = fakePhoneApp();
    await startPage({ ...options(shell, undefined), loadPhoneApp: phoneApp.load });
    expect(shell.asked).toEqual(["192.168.1.20:4280"]);
    expect(document.querySelector('[data-screen="tunnel"]')).toBeNull();
    expect(shownScreens()).toEqual(["not-answering"]);
    expect(phoneApp.load).not.toHaveBeenCalled();
  });

  it("shows only the tunnel screen with a paired computer, and doesn't connect", async () => {
    const shell = new FakeShell();
    const phoneApp = fakePhoneApp();
    await startPage({ ...options(shell, tunnelListing([laptop])), loadPhoneApp: phoneApp.load });
    expect(shownScreens()).toEqual(["tunnel"]);
    expect(phoneApp.mounted[0]?.container.dataset["screen"]).toBe("tunnel");
    expect(shell.asked).toEqual([]);
  });

  it("shows the connect screen, filled in, when the phone app asks for the address", async () => {
    const phoneApp = fakePhoneApp();
    await startPage({
      ...options(new FakeShell(), tunnelListing([laptop])),
      loadPhoneApp: phoneApp.load,
    });
    const mount = phoneApp.mounted[0]?.mount;
    mount?.onAddress(true);
    await settled();
    expect(shownScreens()).toEqual(["connect"]);
    expect(document.querySelector<HTMLInputElement>("#address")?.value).toBe("192.168.1.20:4280");
    mount?.onAddress(false);
    expect(shownScreens()).toEqual(["tunnel"]);
    mount?.onAddress(true);
    expect(shownScreens()).toEqual(["connect"]);
  });
});

/** Starts the page with a tunnel listing `computers`; returns the shell and the phone app. */
async function launch(
  computers: readonly ListedComputer[] | Error,
  remembered: string | undefined,
  hash: { changeAddress?: boolean; pageNotShown?: boolean } = {},
) {
  const shell = new FakeShell().answer({ kind: "notAnswering", address: "192.168.1.20:4280" });
  const phoneApp = fakePhoneApp();
  await startPage({
    ...options(shell, tunnelListing(computers)),
    store: new MemoryStore(remembered),
    ...hash,
    loadPhoneApp: phoneApp.load,
  });
  return { shell, phoneApp };
}

// The launch rule decided on HAL-16439, one test per row and hash.
verifies("studio.connect.phone-tunnel-screens", () => {
  it("opens the phone app with nothing paired and no remembered address", async () => {
    const { shell, phoneApp } = await launch([], undefined);
    expect(shownScreens()).toEqual(["tunnel"]);
    expect(phoneApp.mounted).toHaveLength(1);
    expect(shell.asked).toEqual([]);
  });

  it("keeps the 0.1 launch with nothing paired and a remembered address", async () => {
    const { shell, phoneApp } = await launch([], "192.168.1.20:4280");
    expect(shell.asked).toEqual(["192.168.1.20:4280"]);
    expect(shownScreens()).toEqual(["not-answering"]);
    expect(phoneApp.load).not.toHaveBeenCalled();
  });

  it("opens the phone app with a paired computer and no remembered address", async () => {
    const { shell, phoneApp } = await launch([laptop], undefined);
    expect(shownScreens()).toEqual(["tunnel"]);
    expect(phoneApp.mounted).toHaveLength(1);
    expect(shell.asked).toEqual([]);
  });

  it("opens the phone app with a paired computer and a remembered address", async () => {
    const { shell, phoneApp } = await launch([laptop], "192.168.1.20:4280");
    expect(shownScreens()).toEqual(["tunnel"]);
    expect(phoneApp.mounted).toHaveLength(1);
    expect(shell.asked).toEqual([]);
  });

  it("checks again at every launch: after the last computer is gone, the address connects", async () => {
    await launch([laptop], "192.168.1.20:4280");
    expect(shownScreens()).toEqual(["tunnel"]);
    document.querySelector('[data-screen="tunnel"]')?.remove();

    const { shell, phoneApp } = await launch([], "192.168.1.20:4280");

    expect(shell.asked).toEqual(["192.168.1.20:4280"]);
    expect(phoneApp.load).not.toHaveBeenCalled();
  });

  it("keeps the 0.1 launch when the paired list can't be read and an address is remembered", async () => {
    const { shell } = await launch(new Error("The shell refused."), "192.168.1.20:4280");
    expect(shell.asked).toEqual(["192.168.1.20:4280"]);
  });

  for (const hash of [{ changeAddress: true }, { changeAddress: true, pageNotShown: true }]) {
    it(`opens the connect screen, filled in, for ${hash.pageNotShown ? "#page-not-shown" : "#change-address"} even when paired`, async () => {
      const { shell, phoneApp } = await launch([laptop], "192.168.1.20:4280", hash);
      expect(shownScreens()).toEqual(["connect"]);
      expect(document.querySelector<HTMLInputElement>("#address")?.value).toBe("192.168.1.20:4280");
      expect(document.querySelector<HTMLElement>("#page-not-shown")?.hidden).toBe(
        hash.pageNotShown !== true,
      );
      expect(phoneApp.load).not.toHaveBeenCalled();
      expect(shell.asked).toEqual([]);
    });
  }
});

verifies("studio.connect.app-shortcuts", () => {
  it("keeps the 0.1 launch for a shortcut, and takes its screen", async () => {
    const shell = new FakeShell().answer({ kind: "notAnswering", address: "192.168.1.20:4280" });
    const phoneApp = fakePhoneApp();
    const takeOpening = vi.fn(() => Promise.resolve({ screen: "inbox" as const }));
    await startPage({
      ...options(shell, tunnelListing([])),
      shortcuts: {
        takeOpening,
        setLastChat: () => undefined,
        canPin: () => Promise.resolve(true),
        pin: () => undefined,
      },
      loadPhoneApp: phoneApp.load,
    });
    expect(takeOpening).toHaveBeenCalledOnce();
    expect(shell.asked).toEqual(["192.168.1.20:4280"]);
    expect(shownScreens()).toEqual(["not-answering"]);
    expect(phoneApp.load).not.toHaveBeenCalled();
  });
});
