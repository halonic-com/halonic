// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { localAddressStore } from "./bridge.ts";
import { FakeShell } from "./fake-phone-shell.test-helper.ts";
import type { PairingScanner } from "./pair-scan.ts";
import { startPage } from "./start-page.ts";
import { tauriBridge } from "./tauri-bridge.ts";
import { TauriPhoneTunnel } from "./tauri-phone-tunnel.ts";

/*
 * B7 items 3 and 5 of the D7 design (HAL-15159): the real page, the real phone app and the real
 * tunnel adapter, with only the shell faked. An address is remembered in every test with a paired
 * computer, so the page could fall back to the computer's LAN page if it ever tried; it must not.
 */

const remembered = "192.168.1.20:4280";

const laptop = {
  id: "c-1",
  standing: "paired",
  name: "Tim's laptop",
  endpoints: ["wss://studio.tail1234.ts.net"],
  pairedAtMs: 1_763_114_400_000,
  lastConnectedAtMs: 1_763_114_400_000,
};

/** Where the page could leave the app's own page: the 0.1 bridge's Open Studio. */
const left = { assigned: [] as string[], replaced: [] as (string | URL | null | undefined)[] };
const pageWindow = {
  location: { assign: (url: string | URL) => left.assigned.push(String(url)) },
  history: {
    replaceState: (_: unknown, __: string, url?: string | URL | null) => left.replaced.push(url),
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  const parsed = new DOMParser().parseFromString(
    readFileSync(join(process.cwd(), "connect.html"), "utf8"),
    "text/html",
  );
  document.body.innerHTML = parsed.body.innerHTML;
  localStorage.clear();
  localAddressStore(localStorage).save(remembered);
  left.assigned.length = 0;
  left.replaced.length = 0;
  Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

/** Lets the shell's answers and React's renders run, without letting time pass. */
const settle = () => vi.advanceTimersByTimeAsync(0);

/** Starts the Android page on a shell with a tunnel that answers `answers`. */
async function launch(answers: Record<string, unknown>, scanner?: PairingScanner) {
  const shell = new FakeShell();
  shell.answers.set("phone_tunnel_watch", true);
  for (const [command, answer] of Object.entries(answers)) shell.answers.set(command, answer);
  const reported: string[] = [];
  const report = (line: string) => reported.push(line);
  const start = location.href;
  await startPage({
    document,
    bridge: tauriBridge(shell, pageWindow),
    store: localAddressStore(localStorage),
    changeAddress: false,
    pageNotShown: false,
    tunnel: new TauriPhoneTunnel(shell, report),
    scanner: scanner ?? {
      scan: () => new Promise(() => undefined),
      close: () => Promise.resolve(),
    },
    window,
    openSettings: () => undefined,
    openTailscale: () => undefined,
    report,
  });
  await settle();
  return { shell, reported, start };
}

/** The page is still the app's own page, and nothing asked the shell for the LAN path. */
function expectStayedHome({ shell, start }: { shell: FakeShell; start: string }): void {
  expect(location.href).toBe(start);
  expect(left).toEqual({ assigned: [], replaced: [] });
  expect(shell.commands().filter((command) => !command.startsWith("phone_"))).toEqual([]);
  expect(document.querySelector<HTMLElement>('[data-screen="connect"]')?.hidden).toBe(true);
  const tunnel = document.querySelector<HTMLElement>('[data-screen="tunnel"]');
  expect(tunnel?.hidden).toBe(false);
  // No link, frame, image or form in the phone app points away from the app's origin.
  for (const element of tunnel?.querySelectorAll("[href], [src], [action]") ?? []) {
    const url =
      element.getAttribute("href") ?? element.getAttribute("src") ?? element.getAttribute("action");
    expect(new URL(url ?? "", location.href).origin).toBe(location.origin);
  }
}

const shownText = () => document.querySelector('[data-screen="tunnel"]')?.textContent ?? "";

async function press(name: string): Promise<void> {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-screen="tunnel"] button'),
  ].find((each) => each.textContent?.trim() === name);
  expect(button, name).toBeDefined();
  button?.click();
  await settle();
}

const connects = (shell: FakeShell) =>
  shell.calls.filter((call) => call.command === "phone_connect").map((call) => call.args);

verifies("studio.connect.tunnel-stays-home", () => {
  it("opens the paired computer at launch on the app's own page", async () => {
    const page = await launch({
      phone_computers: { kind: "computers", computers: [laptop] },
      phone_connect: { kind: "connecting" },
    });
    page.shell.sendStatus(0, "c-1", { state: "connected" });
    await settle();

    expect(connects(page.shell)).toEqual([{ computer: "c-1" }]);
    expect(shownText()).toContain("Tim's laptop");
    expectStayedHome(page);
  });

  it("opens a computer just paired, with Open agents, on the app's own page", async () => {
    const hostKey = Uint8Array.from({ length: 32 }, () => 0xfb);
    const payload = {
      hostKey,
      code: "7KQ2M9XF4HTA",
      hostName: "Tim's laptop",
      endpoints: laptop.endpoints,
    };
    // With nothing paired, a remembered address keeps the 0.1 launch (HAL-16439): start without one.
    localStorage.clear();
    const page = await launch(
      {
        phone_computers: { kind: "computers", computers: [] },
        phone_pair_start: { kind: "check", computerName: "Tim's laptop", checkCode: "4F72KQ" },
        phone_pair_wait: { kind: "paired", computer: laptop },
        phone_connect: { kind: "connecting" },
      },
      {
        scan: () => Promise.resolve({ kind: "pairingCode", payload }),
        close: () => Promise.resolve(),
      },
    );
    await press("Scan code");
    page.shell.answers.set("phone_computers", { kind: "computers", computers: [laptop] });
    await press("Open agents");

    expect(connects(page.shell)).toEqual([{ computer: "c-1" }]);
    expectStayedHome(page);
  });

  it("shows that the computer isn't answering, and Try again stays in the tunnel", async () => {
    const page = await launch({
      phone_computers: { kind: "computers", computers: [laptop] },
      phone_connect: { kind: "cant-reach", reason: "unreachable" },
    });
    page.shell.sendStatus(0, "c-1", { state: "reconnecting", lastTry: "refused" });
    await settle();
    expect(shownText()).toContain("Tim's laptop isn't answering");

    await press("Try again");

    expect(connects(page.shell)).toEqual([{ computer: "c-1" }, { computer: "c-1" }]);
    expectStayedHome(page);
  });

  it("stays in the tunnel when the shell refuses to connect", async () => {
    const page = await launch({ phone_computers: { kind: "computers", computers: [laptop] } });

    expect(page.reported).toContain("connect was refused");
    expectStayedHome(page);
  });

  it("stays in the tunnel when the first reach gives up after 30 seconds", async () => {
    const page = await launch({
      phone_computers: { kind: "computers", computers: [laptop] },
      phone_connect: { kind: "connecting" },
    });

    await vi.advanceTimersByTimeAsync(31_000);

    expect(shownText()).toContain("Tim's laptop isn't answering");
    expectStayedHome(page);
  });
});
