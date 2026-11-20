// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { FakeShell, MemoryStore, openPage } from "./test/connect-page-harness.ts";

const connected = { kind: "connected", url: "http://192.168.1.20:4280" } as const;
const notAnswering = { kind: "notAnswering", address: "192.168.1.20:4280" } as const;

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

verifies("studio.connect.version-screens", () => {
  it("shows app too old with the computer's version, the focus on the message", async () => {
    const shell = new FakeShell().answer({ kind: "appTooOld", computerVersion: "0.2.0" });
    const store = new MemoryStore();
    const page = await openPage(shell, store);
    await page.type("192.168.1.20:4280");

    await page.press(page.connectButton);

    expect(page.screen).toBe("app-too-old");
    expect(page.message.textContent).toBe(
      "This app is too old for Halonic on your computer (0.2.0). Install the new app to continue.",
    );
    expect(document.activeElement).toBe(page.message);
    expect(page.button("open-release-page").textContent).toBe("Open release page");
    expect(page.button("change-address").textContent).toBe("Change address");
    expect(store.address).toBe("192.168.1.20:4280");
  });

  it("asks the shell to open the release page", async () => {
    const shell = new FakeShell().answer({ kind: "appTooOld", computerVersion: "0.2.0" });
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));

    await page.press(page.button("open-release-page"));

    expect(shell.releasePageOpened).toBe(1);
    expect(shell.opened).toEqual([]);
  });

  it("stays quiet when the shell can't open the release page", async () => {
    const shell = new FakeShell().answer({ kind: "appTooOld", computerVersion: "0.2.0" });
    shell.releasePageFails = true;
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));

    // An unhandled rejection here would fail the run.
    await page.press(page.button("open-release-page"));

    expect(page.screen).toBe("app-too-old");
  });

  it("shows computer too old with the computer's version, the focus on the message", async () => {
    const shell = new FakeShell().answer({ kind: "computerTooOld", computerVersion: "0.1.0" });
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));

    expect(page.screen).toBe("computer-too-old");
    expect(page.message.textContent).toBe(
      "Halonic on your computer (0.1.0) is too old for this app. Update Halonic on your computer, then try again.",
    );
    expect(document.activeElement).toBe(page.message);
    expect(page.button("try-again").textContent).toBe("Try again");
    expect(page.button("change-address").textContent).toBe("Change address");
  });

  it("opens the workspace when Try again finds the computer updated", async () => {
    const shell = new FakeShell().answer(
      { kind: "computerTooOld", computerVersion: "0.1.0" },
      connected,
    );
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));

    await page.press(page.button("try-again"));

    expect(shell.asked).toEqual(["192.168.1.20:4280", "192.168.1.20:4280"]);
    expect(shell.opened).toEqual(["http://192.168.1.20:4280"]);
  });

  it("moves the focus to the message when Try again ends on isn't answering", async () => {
    const shell = new FakeShell().answer(
      { kind: "computerTooOld", computerVersion: "0.1.0" },
      notAnswering,
    );
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));

    await page.press(page.button("try-again"));

    expect(page.screen).toBe("not-answering");
    expect(document.activeElement).toBe(page.message);
  });

  it("keeps the focus on Try again when the computer is still too old", async () => {
    const tooOld = { kind: "computerTooOld", computerVersion: "0.1.0" } as const;
    const shell = new FakeShell().answer(tooOld, tooOld);
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));
    const tryAgain = page.button("try-again");

    await page.press(tryAgain);

    expect(page.screen).toBe("computer-too-old");
    expect(document.activeElement).toBe(tryAgain);
  });

  it("puts the primary button right after the message, then Change address", async () => {
    const shell = new FakeShell().answer({ kind: "computerTooOld", computerVersion: "0.1.0" });
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));

    const order = [
      ...document.querySelectorAll(
        '[data-screen="computer-too-old"] p, [data-screen="computer-too-old"] button',
      ),
    ];
    expect(order).toEqual([page.message, page.button("try-again"), page.button("change-address")]);
  });
});
