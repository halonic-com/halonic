// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialog, polyfillDialog, press, settle, typeInto } from "../test-support/dom.ts";
import {
  FakeServerEngine,
  type FakeServerEngineAnswers,
} from "../test-support/fake-server-engine.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PairDialog } from "./pair-dialog.tsx";
import { pairPollMs } from "./pair-flow.ts";

const startedAt = Date.parse("2026-11-24T14:00:00.000Z");
const address = "https://halonic.acme.test";

beforeEach(() => {
  polyfillDialog();
  vi.useFakeTimers({
    toFake: [
      "setInterval",
      "clearInterval",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "Date",
    ],
    now: startedAt,
  });
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

/** The dialog over a fake engine, with its callbacks counted. */
async function openDialog(answers: FakeServerEngineAnswers = {}, again?: { address: string }) {
  const engine = new FakeServerEngine(answers);
  const closed = vi.fn();
  const paired = vi.fn();
  const cancelFailed = vi.fn();
  render(
    <PairDialog
      engine={engine}
      again={again}
      computerName="Acme laptop"
      onClose={closed}
      onPaired={paired}
      onCancelFailed={cancelFailed}
    />,
  );
  await settle();
  return { engine, closed, paired, cancelFailed };
}

const inputs = () => [...(dialog()?.querySelectorAll("input") ?? [])];
const text = () => dialog()?.textContent ?? "";

/** Fills P1 and presses Continue. */
async function enter(code = "7kq2-m9xf", at = address) {
  const [addressField, codeField] = inputs();
  typeInto(addressField ?? null, at);
  typeInto(codeField ?? null, code);
  await press(button("Continue", dialog() ?? document));
}

/** The next frame, where the Dialog's alert slot shows a failure. */
async function nextFrame() {
  act(() => vi.advanceTimersToNextFrame());
  await settle();
}

/** One round of polling. */
async function poll() {
  act(() => vi.advanceTimersByTime(pairPollMs));
  await settle();
}

/** Starts a pairing whose status answers are `status`, and polls once. */
async function endWith(status: FakeServerEngineAnswers["status"]) {
  const opened = await openDialog({ ...(status === undefined ? {} : { status }) });
  await enter();
  await poll();
  return opened;
}

verifies("connections.server-pair-dialog", () => {
  describe("P1", () => {
    it("sends the address, the plain code and this computer's name", async () => {
      const { engine } = await openDialog();
      expect(inputs()[2]?.value).toBe("Acme laptop");
      await enter();
      expect(engine.pairs).toEqual([{ address, code: "7KQ2M9XF", deviceName: "Acme laptop" }]);
    });

    it.each([
      ["http://halonic.acme.test", "7KQ2 M9XF", "Use an https address."],
      [address, "7KQ2 M9X", "A pairing code is 8 letters and digits, like 7KQ2 M9XF."],
      [address, "7KQ2 M9X0", "A pairing code is 8 letters and digits"],
    ])("checks %s and %s before sending", async (at, code, error) => {
      const { engine } = await openDialog();
      await enter(code, at);
      expect(engine.pairs).toEqual([]);
      expect(text()).toContain(error);
    });

    it.each([
      [{ state: "unreachable" }, "Halonic couldn't reach a server at this address."],
      [{ state: "not_halonic" }, "This address didn't answer like a Halonic server."],
      [{ state: "address_not_allowed" }, "Use an https address."],
      [{ state: "code_refused" }, "This code didn't work. It may be mistyped"],
      [{ state: "lost" }, "Halonic couldn't start the pairing. Try again."],
    ] as const)("says why the server refused %o", async (pair, error) => {
      await openDialog({ pair });
      await enter();
      await nextFrame();
      expect(text()).toContain(error);
      // A field's error is plain text: a command in it reads without its backticks.
      expect(text()).not.toContain("`");
    });

    it("says when the engine couldn't be asked at all", async () => {
      await openDialog({ pair: { reject: new Error("host gone") } });
      await enter();
      await nextFrame();
      expect(text()).toContain("Halonic couldn't start the pairing. Try again.");
    });

    it("turns Continue off after too many wrong codes, until the wait is over", async () => {
      const { engine } = await openDialog({ pair: { state: "too_many", minutes: 5 } });
      await enter();
      expect(text()).toContain("Too many wrong codes. Try again in 5 minutes.");
      await press(button("Continue", dialog() ?? document));
      expect(engine.pairs).toHaveLength(1);
      act(() => vi.advanceTimersByTime(5 * 60_000 + 1000));
      await settle();
      await press(button("Continue", dialog() ?? document));
      expect(engine.pairs).toHaveLength(2);
    });

    it("says a few minutes when the server gives no time", async () => {
      await openDialog({ pair: { state: "too_many" } });
      await enter();
      expect(text()).toContain("Too many wrong codes. Try again in a few minutes.");
    });

    it("is titled Pair again with the address filled in", async () => {
      await openDialog({}, { address });
      expect(dialog()?.querySelector("h2")?.textContent).toBe("Pair again");
      expect(inputs()[0]?.value).toBe(address);
    });
  });

  describe("P2", () => {
    it("shows the check code, the time left and that it waits for Allow", async () => {
      await openDialog();
      await enter();
      const code = dialog()?.querySelector('[role="img"]');
      expect(code?.getAttribute("aria-label")).toBe("Check code: 4, F, 7, 2, K, Q");
      expect(text()).toContain("Waiting for Allow on the server…");
      expect(text()).toContain("10:00 left");
      expect(text()).toContain("The server sees this computer as Acme laptop.");
    });

    it("starts focus on the check code, so it's read first", async () => {
      await openDialog();
      await enter();
      await nextFrame();
      expect(
        document.activeElement?.querySelector('[role="img"]')?.getAttribute("aria-label"),
      ).toBe("Check code: 4, F, 7, 2, K, Q");
    });

    it("says when it can't reach the server, and goes on waiting", async () => {
      const unreachable = { state: "unreachable" } as const;
      const waiting = { state: "waiting", expiresAt: "2026-11-24T14:10:00.000Z" } as const;
      await endWith([unreachable, waiting]);
      expect(text()).toContain("Can't reach the server. Still trying…");
      await poll();
      expect(text()).toContain("Waiting for Allow on the server…");
    });

    it("hands the pairing's end and the name it paired as to the opener once allowed", async () => {
      const sessionEndsAt = "2027-02-22T14:00:00.000Z";
      const { paired } = await endWith([{ state: "paired", sessionEndsAt }]);
      expect(paired).toHaveBeenCalledWith({ address, sessionEndsAt, deviceName: "Acme laptop" });
    });

    it("cancels the pairing on Cancel and closes", async () => {
      const { engine, closed, cancelFailed } = await openDialog();
      await enter();
      await press(button("Cancel", dialog() ?? document));
      expect(engine.calls).toContain("cancel pairing-1");
      expect(closed).toHaveBeenCalledOnce();
      expect(cancelFailed).not.toHaveBeenCalled();
    });

    it("says so when the server wasn't told", async () => {
      const { closed, cancelFailed } = await openDialog({ cancel: false });
      await enter();
      await press(button("Cancel", dialog() ?? document));
      expect(closed).toHaveBeenCalledOnce();
      expect(cancelFailed).toHaveBeenCalledOnce();
    });

    it("ends as expired once the 10 minutes run out here, and cancels", async () => {
      const { engine } = await openDialog();
      await enter();
      act(() => vi.setSystemTime(startedAt + 10 * 60_000));
      await poll();
      expect(text()).toContain("The pairing code expired");
      expect(engine.calls).toContain("cancel pairing-1");
    });
  });

  describe("the endings", () => {
    it.each([
      [{ state: "expired" }, "The pairing code expired"],
      [{ state: "refused" }, "The server didn't allow this computer"],
      [{ state: "taken-over" }, "Another request used this code"],
      [{ state: "cancelled" }, "The pairing didn't finish"],
      [{ state: "lost" }, "The pairing didn't finish"],
      [{ state: "key_not_saved", signedOut: true }, "Halonic ended the pairing on the server"],
      [{ state: "key_not_saved", signedOut: false }, "Remove Acme laptop with halonic serve"],
    ] as const)("shows %o as its ending", async (status, words) => {
      await endWith([status]);
      expect(text()).toContain(words);
      expect(button("Start again", dialog() ?? document)).toBeDefined();
      expect(button("Close", dialog() ?? document)).toBeDefined();
    });

    it("names this computer as it paired when the name field was cleared", async () => {
      const { engine } = await openDialog({
        status: [{ state: "waiting", expiresAt: "2026-11-24T14:10:00.000Z" }, { state: "lost" }],
      });
      typeInto(inputs()[2] ?? null, "  ");
      await enter();
      expect(engine.pairs.map((pair) => pair.deviceName)).toEqual(["Halonic Studio"]);
      expect(text()).toContain("The server sees this computer as Halonic Studio.");
      await poll();
      await poll();
      expect(text()).toContain("If halonic serve devices lists Halonic Studio, remove it there");
    });

    it("starts again with the address and the name kept and the code empty", async () => {
      await endWith([{ state: "refused" }]);
      await press(button("Start again", dialog() ?? document));
      expect(inputs().map((input) => input.value)).toEqual([address, "", "Acme laptop"]);
    });
  });
});
