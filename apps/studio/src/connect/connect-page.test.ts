// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { localAddressStore } from "./bridge.ts";
import { ConnectPageView, FakeShell, MemoryStore, openPage } from "./test/connect-page-harness.ts";

const connected = { kind: "connected", url: "http://192.168.1.20:4280" } as const;
const notAnswering = { kind: "notAnswering", address: "192.168.1.20:4280" } as const;

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  localStorage.clear();
});

verifies("studio.connect.connect-screen", () => {
  it("opens on the connect screen with the focus in Address, and sends nothing", async () => {
    const shell = new FakeShell();
    const page = await openPage(shell, new MemoryStore());

    expect(page.screen).toBe("connect");
    expect(document.activeElement).toBe(page.field);
    expect(shell.asked).toEqual([]);
  });

  it("shows Address as a label, the example as the placeholder, and the hint", async () => {
    const page = await openPage(new FakeShell(), new MemoryStore());

    expect(page.field.labels?.[0]?.textContent).toBe("Address");
    // The hint doesn't give the format, so the example shows it before anything is typed.
    expect(page.field.placeholder).toBe("192.168.1.20:4280");
    expect(page.field.inputMode).toBe("url");
    expect(page.field.getAttribute("enterkeyhint")).toBe("go");
    expect(page.field.getAttribute("autocorrect")).toBe("off");
    expect(page.field.getAttribute("autocapitalize")).toBe("off");
    const hint = document.querySelector("#address-hint");
    expect(hint?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "On your computer, run halonic serve --network. It shows this address.",
    );
    expect(hint?.querySelector("code")?.textContent).toBe("halonic serve --network");
    expect(page.field.getAttribute("aria-describedby")).toContain("address-hint");
    expect(document.querySelector("h1")?.textContent).toBe("Connect to Halonic on your computer");
  });

  it("sends the trimmed address once, busy and keeping the focus, however often Connect is pressed", async () => {
    const shell = new FakeShell();
    const answer = shell.answerLater();
    const page = await openPage(shell, new MemoryStore());
    await page.type("  192.168.1.20:4280 ");

    await page.press(page.connectButton);
    await page.press(page.connectButton);

    expect(shell.asked).toEqual(["192.168.1.20:4280"]);
    expect(page.connectButton.textContent).toBe("Connecting…");
    expect(page.connectButton.getAttribute("aria-busy")).toBe("true");
    expect(page.connectButton.disabled).toBe(false);
    expect(document.activeElement).toBe(page.connectButton);

    await answer({ kind: "notAnAddress" });
    expect(page.connectButton.textContent).toBe("Connect");
    expect(page.connectButton.getAttribute("aria-busy")).toBe("false");
  });

  it("is never disabled, so an empty field gets the field error", async () => {
    const shell = new FakeShell().answer({ kind: "notAnAddress" });
    const page = await openPage(shell, new MemoryStore());

    await page.press(page.connectButton);

    expect(shell.asked).toEqual([""]);
    expect(page.fieldError.textContent).toBe("Enter an address like 192.168.1.20:4280.");
  });

  it("remembers the address and opens the confirmed one", async () => {
    const shell = new FakeShell().answer(connected);
    const store = new MemoryStore();
    const page = await openPage(shell, store);
    await page.type("192.168.1.20:4280");

    await page.press(page.connectButton);

    expect(store.address).toBe("192.168.1.20:4280");
    expect(shell.opened).toEqual(["http://192.168.1.20:4280"]);
    // The window leaves the page, so Connect stays busy.
    expect(page.connectButton.textContent).toBe("Connecting…");
  });
});

verifies("studio.connect.field-errors", () => {
  it.each([
    [{ kind: "notAnAddress" } as const, "Enter an address like 192.168.1.20:4280."],
    [
      { kind: "notHomeNetwork" } as const,
      "Use an address on your home network, like 192.168.1.20:4280.",
    ],
    [
      { kind: "notAnswering", address: "192.168.1.20:4280" } as const,
      "Can't reach Halonic at 192.168.1.20:4280. Check that your phone and computer are on the same network and that halonic serve --network is running.",
    ],
    [
      { kind: "notHalonic", address: "192.168.1.1" } as const,
      "Something answered at 192.168.1.1, but it isn't Halonic. Check the address.",
    ],
  ])("shows %o as one field error, read when it appears", async (result, text) => {
    const page = await openPage(new FakeShell().answer(result), new MemoryStore());
    await page.type("typed");

    await page.press(page.connectButton);

    expect(page.screen).toBe("connect");
    expect(page.fieldError.hidden).toBe(false);
    expect(page.fieldError.textContent).toBe(text);
    expect(page.fieldError.getAttribute("role")).toBe("alert");
    expect(page.field.getAttribute("aria-invalid")).toBe("true");
    expect(page.field.getAttribute("aria-describedby")).toContain("address-error");
    // The connect screen was already showing, so the focus stays on Connect.
    expect(document.activeElement).toBe(page.connectButton);
  });

  it("sits between the field and the hint, so the hint stays visible", async () => {
    const page = await openPage(new FakeShell(), new MemoryStore());

    expect(page.field.nextElementSibling).toBe(page.fieldError);
    expect(page.fieldError.nextElementSibling?.id).toBe("address-hint");
  });

  it("sets the command in the code font in Can't reach", async () => {
    const shell = new FakeShell().answer(notAnswering);
    const page = await openPage(shell, new MemoryStore());

    await page.press(page.connectButton);

    expect(page.fieldError.querySelector("code")?.textContent).toBe("halonic serve --network");
  });

  it("stays until the field changes", async () => {
    const page = await openPage(
      new FakeShell().answer({ kind: "notAnAddress" }),
      new MemoryStore(),
    );
    await page.press(page.connectButton);

    await page.type("192.168.1.20:4280");

    expect(page.fieldError.hidden).toBe(true);
    expect(page.fieldError.textContent).toBe("");
    expect(page.field.hasAttribute("aria-invalid")).toBe(false);
  });

  it("goes when Connect is pressed again, and shows the new answer", async () => {
    const shell = new FakeShell().answer({ kind: "notAnAddress" });
    const answer = shell.answerLater();
    const page = await openPage(shell, new MemoryStore());
    await page.press(page.connectButton);

    await page.press(page.connectButton);
    expect(page.fieldError.hidden).toBe(true);

    await answer({ kind: "notHomeNetwork" });
    expect(page.fieldError.textContent).toBe(
      "Use an address on your home network, like 192.168.1.20:4280.",
    );
  });

  it("shows Can't reach, and no raw error, when the call into the shell fails", async () => {
    const shell = new FakeShell().answer(new Error("ECONNREFUSED 192.168.1.20:4280"));
    const page = await openPage(shell, new MemoryStore());
    await page.type(" 192.168.1.20:4280");

    await page.press(page.connectButton);

    expect(page.fieldError.textContent).toMatch(/^Can't reach Halonic at 192\.168\.1\.20:4280\. /);
    expect(page.fieldError.textContent).not.toContain("ECONNREFUSED");
  });
});

verifies("studio.connect.remembered-address", () => {
  it("stores only the address, under one key in the page's storage", async () => {
    const store = localAddressStore(localStorage);
    expect(store.load()).toBeUndefined();
    const page = await openPage(new FakeShell().answer(connected), store);
    await page.type("192.168.1.20:4280");

    await page.press(page.connectButton);

    expect(Object.entries(localStorage)).toEqual([
      ["halonic.connect.address", "192.168.1.20:4280"],
    ]);
    expect(store.load()).toBe("192.168.1.20:4280");
  });

  it("opens the remembered address without showing the connect screen", async () => {
    const shell = new FakeShell();
    const answer = shell.answerLater();
    // The page is in the document before it waits for the shell.
    const opening = openPage(shell, new MemoryStore("192.168.1.20:4280"));
    const page = new ConnectPageView();

    expect(page.screen).toBe("starting");
    await answer(connected);
    await opening;
    expect(shell.asked).toEqual(["192.168.1.20:4280"]);
    expect(shell.opened).toEqual(["http://192.168.1.20:4280"]);
    expect(page.screen).toBe("starting");
  });

  it("shows only the logo for a second, then says Connecting… while it waits", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const shell = new FakeShell();
    const answer = shell.answerLater();
    const opening = openPage(shell, new MemoryStore("192.168.1.20:4280"));
    const page = new ConnectPageView();

    await vi.advanceTimersByTimeAsync(999);
    expect(page.startingStatus.textContent).toBe("");
    await vi.advanceTimersByTimeAsync(1);
    expect(page.startingStatus.textContent).toBe("Connecting…");
    expect(page.startingStatus.getAttribute("role")).toBe("status");

    vi.useRealTimers();
    await answer(connected);
    await opening;
    expect(shell.opened).toEqual(["http://192.168.1.20:4280"]);
  });

  it("shows its own isn't answering screen when the remembered address doesn't answer", async () => {
    const shell = new FakeShell().answer(notAnswering);
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));

    expect(page.screen).toBe("not-answering");
    expect(page.message.textContent).toBe("Halonic on your computer isn't answering.");
    expect(document.activeElement).toBe(page.message);
    expect(page.button("try-again").textContent).toBe("Try again");
    expect(page.button("change-address").textContent).toBe("Change address");
  });

  it("keeps the focus on a busy Try again, and opens the workspace when the computer answers", async () => {
    const shell = new FakeShell().answer(notAnswering);
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));
    const tryAgain = page.button("try-again");
    const answer = shell.answerLater();

    await page.press(tryAgain);
    expect(tryAgain.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(tryAgain);

    await answer(connected);
    expect(shell.opened).toEqual(["http://192.168.1.20:4280"]);
  });

  it("stays on isn't answering, with the focus on Try again, when it still doesn't answer", async () => {
    const shell = new FakeShell().answer(notAnswering, notAnswering);
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));
    const tryAgain = page.button("try-again");

    await page.press(tryAgain);

    expect(page.screen).toBe("not-answering");
    expect(tryAgain.getAttribute("aria-busy")).toBe("false");
    expect(document.activeElement).toBe(tryAgain);
  });

  it("shows a field error on the connect screen when the remembered address is now wrong", async () => {
    const shell = new FakeShell().answer({ kind: "notHalonic", address: "192.168.1.20:4280" });
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));

    expect(page.screen).toBe("connect");
    expect(page.field.value).toBe("192.168.1.20:4280");
    expect(page.fieldError.textContent).toContain("but it isn't Halonic");
    expect(document.activeElement).toBe(page.field);
  });

  it("moves the focus to the field when Try again gets a field error", async () => {
    const shell = new FakeShell().answer(notAnswering, {
      kind: "notHalonic",
      address: "192.168.1.20:4280",
    });
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));

    await page.press(page.button("try-again"));

    expect(page.screen).toBe("connect");
    expect(page.fieldError.textContent).toContain("but it isn't Halonic");
    expect(document.activeElement).toBe(page.field);
  });

  it("opens the connect screen with the address filled in on Change address", async () => {
    const shell = new FakeShell().answer(notAnswering);
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"));

    await page.press(page.button("change-address"));

    expect(page.screen).toBe("connect");
    expect(page.field.value).toBe("192.168.1.20:4280");
    expect(document.activeElement).toBe(page.field);
  });

  it("sends nothing when the shell opens the page to change the address", async () => {
    const shell = new FakeShell();
    const page = await openPage(shell, new MemoryStore("192.168.1.20:4280"), {
      changeAddress: true,
    });

    expect(shell.asked).toEqual([]);
    expect(page.screen).toBe("connect");
    expect(page.field.value).toBe("192.168.1.20:4280");
    expect(document.activeElement).toBe(page.field);
  });
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
