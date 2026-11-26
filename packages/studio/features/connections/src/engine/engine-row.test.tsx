// @vitest-environment jsdom

import type { ServerPairState } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialog, polyfillDialog, press, settle, typeInto } from "../test-support/dom.ts";
import {
  FakeServerEngine,
  type FakeServerEngineAnswers,
} from "../test-support/fake-server-engine.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { EngineRow } from "./engine-row.tsx";
import { pairPollMs } from "./pair-flow.ts";

const startedAt = Date.parse("2026-11-24T14:00:00.000Z");
const address = "https://halonic.acme.test";
const server = { engine: "server", address, pairing: "kept" } as const;
const sessionEndsAt = "2027-02-22T14:00:00.000Z";
/** What the host answers once it checked the server at 14:02. */
const checked = (state: "online" | "offline" | "signed-out") =>
  ({ ...server, sessionEndsAt, server: { state, checkedAt: "2026-11-24T14:02:00.000Z" } }) as const;

beforeEach(() => {
  polyfillDialog();
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "requestAnimationFrame", "Date"],
    now: startedAt,
  });
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The row over a fake engine, with what it announced. */
async function showRow(answers: FakeServerEngineAnswers = {}) {
  const engine = new FakeServerEngine(answers);
  const said: string[] = [];
  const root = render(<EngineRow engine={engine} announce={(line) => said.push(line)} />);
  await settle();
  return { engine, said, root };
}

const radio = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
    (input) => input.closest("label")?.textContent?.startsWith(label) ?? false,
  );

/** Picks the option, as a click on it does. */
async function pick(input: HTMLInputElement | undefined) {
  await press(input);
}

verifies("connections.engine-row", () => {
  describe("the row", () => {
    it("starts on This computer", async () => {
      const { root } = await showRow();
      expect(root.textContent).toContain("Messaging engine");
      expect(radio(root, "This computer")?.checked).toBe(true);
      expect(radio(root, "Server")?.checked).toBe(false);
    });

    it("shows the server's host and Connected while the pairing is kept", async () => {
      const { root } = await showRow({ state: server });
      expect(radio(root, "Server")?.checked).toBe(true);
      expect(root.textContent).toContain("halonic.acme.test");
      expect(root.textContent).toContain("Connected");
    });

    it("says Signed out, with Pair again, when the keychain holds no pairing", async () => {
      const { root } = await showRow({ state: { ...server, pairing: "missing" } });
      expect(root.textContent).toContain("Signed out");
      expect(root.textContent).toContain("pairing expired or removed");
      expect(root.textContent).toContain(
        "This computer's pairing with halonic.acme.test has ended.",
      );
      await press(button("Pair again", root));
      expect(dialog()?.querySelector("h2")?.textContent).toBe("Pair again");
      expect(dialog()?.querySelector("input")?.value).toBe(address);
    });

    it("shows when it checked and the pairing's end from the host, as after a restart", async () => {
      const { root } = await showRow({ state: checked("online") });
      expect(root.textContent).toContain("Connected");
      expect(root.textContent).toContain("Checked 14:02 · pairing ends 22 Feb 2027");
    });

    it("shows Offline with the server's callout when the server isn't answering", async () => {
      const { root } = await showRow({ state: checked("offline") });
      expect(root.textContent).toContain("Offline");
      expect(root.textContent).toContain("Offline, as of 14:02");
      expect(root.textContent).toContain(
        "The server isn't answering. Inbox and Messenger show what was read last; answering is off until it's back.",
      );
      expect(button("Pair again", root)).toBeUndefined();
      expect(radio(root, "Server")?.checked).toBe(true);
    });

    it("says Signed out, with Pair again, when the server ended the pairing", async () => {
      const { root } = await showRow({ state: checked("signed-out") });
      expect(root.textContent).toContain("Signed out");
      expect(root.textContent).toContain("pairing expired or removed");
      expect(root.textContent).toContain(
        "This computer's pairing with halonic.acme.test has ended.",
      );
      expect(button("Pair again", root)).toBeDefined();
    });

    it("says it couldn't read this computer's pairing from the keychain", async () => {
      const { root } = await showRow({ state: { ...server, pairing: "unreadable" } });
      expect(root.textContent).toContain(
        "Halonic couldn't read this computer's pairing from the keychain.",
      );
      expect(button("Pair again", root)).toBeDefined();
    });

    it("lists Server as unavailable when the host has no keychain", async () => {
      const { root } = await showRow({ state: { engine: "keychain-needed" } });
      expect(radio(root, "Server")?.disabled).toBe(true);
      expect(root.textContent).toContain("Needs this computer's keychain");
    });
  });

  describe("pairing", () => {
    it("opens Pair with a server on Server, and stays on This computer until paired", async () => {
      const answers: FakeServerEngineAnswers = { status: [{ state: "paired", sessionEndsAt }] };
      const { root, said, engine } = await showRow(answers);
      await pick(radio(root, "Server"));
      expect(dialog()?.querySelector("h2")?.textContent).toBe("Pair with a server");
      expect(radio(root, "This computer")?.checked).toBe(true);
      const [addressField, codeField] = [...(dialog()?.querySelectorAll("input") ?? [])];
      typeInto(addressField ?? null, address);
      typeInto(codeField ?? null, "7KQ2M9XF");
      engine.answers.state = checked("online");
      await press(button("Continue", dialog() ?? document));
      act(() => vi.advanceTimersByTime(pairPollMs));
      await settle();
      expect(dialog()).toBeNull();
      expect(radio(root, "Server")?.checked).toBe(true);
      expect(root.textContent).toContain("Checked 14:02 · pairing ends 22 Feb 2027");
      expect(said).toEqual([
        "Paired with halonic.acme.test. Inbox and Messenger now read from the server.",
      ]);
    });

    it("fills in this computer's name as the host gives it", async () => {
      const state = { engine: "this-computer", computerName: "Ada's MacBook" } as const;
      const { root } = await showRow({ state });
      await pick(radio(root, "Server"));
      const fields = [...(dialog()?.querySelectorAll("input") ?? [])];
      expect(fields.at(-1)?.value).toBe("Ada's MacBook");
    });

    it("says so when a cancelled pairing couldn't be dropped on the server", async () => {
      const { root } = await showRow({ cancel: false });
      await pick(radio(root, "Server"));
      const [addressField, codeField] = [...(dialog()?.querySelectorAll("input") ?? [])];
      typeInto(addressField ?? null, address);
      typeInto(codeField ?? null, "7KQ2M9XF");
      await press(button("Continue", dialog() ?? document));
      await press(button("Cancel", dialog() ?? document));
      expect(root.textContent).toContain("Halonic couldn't cancel the pairing.");
      expect(radio(root, "This computer")?.checked).toBe(true);
    });
  });

  describe("switching back", () => {
    it("asks, then ends the pairing and says so", async () => {
      const { root, engine } = await showRow({ state: server });
      await pick(radio(root, "This computer"));
      expect(dialog()?.textContent).toContain("Use this computer for messaging?");
      engine.answers.state = { engine: "this-computer" };
      await press(button("Use this computer", dialog() ?? document));
      expect(engine.calls).toContain("useThisComputer");
      expect(radio(root, "This computer")?.checked).toBe(true);
      expect(root.textContent).toContain(
        "Switched to this computer. The pairing with halonic.acme.test has ended.",
      );
    });

    it("says the pairing is still valid when the server couldn't be reached", async () => {
      const { root, engine } = await showRow({ state: server, left: { stillValid: true } });
      await pick(radio(root, "This computer"));
      engine.answers.state = { engine: "this-computer" };
      await press(button("Use this computer", dialog() ?? document));
      expect(root.textContent).toContain(
        "Switched to this computer. The pairing is still valid on the server.",
      );
    });

    it("names the computer as the server lists it, never the name filled in by default", async () => {
      const state = { ...server, computerName: "Work laptop" };
      const { root, engine } = await showRow({ state, left: { stillValid: true } });
      await pick(radio(root, "This computer"));
      engine.answers.state = { engine: "this-computer" };
      await press(button("Use this computer", dialog() ?? document));
      expect(root.textContent).toContain("Remove Work laptop with halonic serve devices");
      expect(root.textContent).not.toContain("Halonic Studio");
    });

    it("says what the keychain kept", async () => {
      const left = { stillValid: true, keychainEntryKept: true } as const;
      const { root, engine, said } = await showRow({ state: server, left });
      await pick(radio(root, "This computer"));
      engine.answers.state = { engine: "this-computer" };
      await press(button("Use this computer", dialog() ?? document));
      expect(root.textContent).toContain("the keychain still holds the pairing");
      const codes = [...root.querySelectorAll("code")].map((code) => code.textContent);
      expect(codes).toContain("server-pairing");
      expect(said).toEqual([
        "Switched, but the keychain still holds the pairing. Halonic couldn't delete it from this computer's keychain. Unlock the keychain and remove the entry whose name starts with server-pairing.",
      ]);
    });

    it("stays on Server when the person cancels", async () => {
      const { root, engine } = await showRow({ state: server });
      await pick(radio(root, "This computer"));
      await press(button("Cancel", dialog() ?? document));
      expect(engine.calls).not.toContain("useThisComputer");
      expect(radio(root, "Server")?.checked).toBe(true);
    });
  });

  describe("the device token", () => {
    const canary = "hal_device_CANARY_7f3e9a";

    it("never shows a token an answer or an error carries", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const paired = { state: "paired", sessionEndsAt: "2027-02-22T14:00:00.000Z", token: canary };
      const { root, engine } = await showRow({
        status: [
          { reject: new Error(`server said ${canary}`) },
          paired as unknown as ServerPairState,
        ],
      });
      await pick(radio(root, "Server"));
      const [addressField, codeField] = [...(dialog()?.querySelectorAll("input") ?? [])];
      typeInto(addressField ?? null, address);
      typeInto(codeField ?? null, "7KQ2M9XF");
      await press(button("Continue", dialog() ?? document));
      act(() => vi.advanceTimersByTime(pairPollMs));
      await settle();
      expect(document.body.innerHTML).not.toContain(canary);
      engine.answers.state = { ...server, token: canary } as unknown as typeof server;
      act(() => vi.advanceTimersByTime(pairPollMs));
      await settle();
      expect(radio(root, "Server")?.checked).toBe(true);
      expect(document.body.innerHTML).not.toContain(canary);
    });
  });
});
