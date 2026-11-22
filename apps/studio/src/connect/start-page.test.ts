// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PhoneAppMount, PhoneTunnel } from "@halonicjs/studio-feature-remote/phone";
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

  it("shows only the tunnel screen with a tunnel, and doesn't connect", async () => {
    const shell = new FakeShell();
    const phoneApp = fakePhoneApp();
    await startPage({ ...options(shell, {} as PhoneTunnel), loadPhoneApp: phoneApp.load });
    expect(shownScreens()).toEqual(["tunnel"]);
    expect(phoneApp.mounted[0]?.container.dataset["screen"]).toBe("tunnel");
    expect(shell.asked).toEqual([]);
  });

  it("shows the connect screen, filled in, when the phone app asks for the address", async () => {
    const phoneApp = fakePhoneApp();
    await startPage({
      ...options(new FakeShell(), {} as PhoneTunnel),
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
