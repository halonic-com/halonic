// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { unmountAll } from "../test-support/render.tsx";
import {
  button,
  message,
  open,
  requestsStarting,
  send,
  support,
  type,
} from "./request-form.test-helper.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

verifies("inbox.request-not-started", () => {
  it("says a failure it can't explain in plain words, with Copy details holding the error", async () => {
    const requests = requestsStarting([support], async () => {
      throw new TypeError("steps is undefined");
    });
    const writeClipboard = vi.fn(async (_text: string) => true);
    const { root } = await open(requests, { writeClipboard });
    await type(message(root), "Hello");
    await send(root);
    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(
      "Not started: Halonic ran into a problem it can't explain yet.",
    );
    // "· Copy details" follows the sentence outside the alert, and wraps as one piece.
    const after = alert?.nextElementSibling;
    expect(after?.textContent).toBe("· Copy details");
    expect(after?.className).toContain("whitespace-nowrap");
    expect(root.textContent).not.toContain("isn't answering");
    await act(async () => button(root, "Copy details").click());
    expect(writeClipboard).toHaveBeenCalledWith(expect.stringContaining("steps is undefined"));
  });

  it("offers Copy details in the phone's sheet too", async () => {
    const requests = requestsStarting([support], async () => {
      throw new TypeError("steps is undefined");
    });
    const { root } = await open(requests, { phone: true });
    await act(async () => {
      button(root, "New request").click();
    });
    await type(message(root), "Hello");
    await send(root);
    // The sheet's alert slot fills a frame later; the line's words are the desktop test's.
    const sheet = root.querySelector("dialog");
    expect([...(sheet?.querySelectorAll("button") ?? [])].map((b) => b.textContent)).toContain(
      "Copy details",
    );
  });

  it("lower-cases a common first word after the colon, with no Copy details", async () => {
    const requests = requestsStarting([support], async () => {
      throw new KindedError("conflict", "The workflow changed.");
    });
    const { root } = await open(requests);
    await type(message(root), "Hello");
    await send(root);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Not started: the workflow changed.",
    );
  });

  it("keeps the refusal's next step and its command, with no Try again", async () => {
    const held = new KindedError(
      "conflict",
      "Acme is already running in another Halonic on this computer.",
      { fix: "Stop that one, then try again." },
    );
    const connector = Object.assign(
      new KindedError("unavailable", "Reporter uses a connector, which Studio can't start yet.", {
        fix: "To start it, run this in a terminal:",
      }),
      { command: "halonic run reply" },
    );
    const requests = requestsStarting(
      [support],
      vi.fn().mockRejectedValueOnce(held).mockRejectedValueOnce(connector),
    );
    const { root } = await open(requests);
    await type(message(root), "Hello");
    await send(root);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Not started: Acme is already running in another Halonic on this computer. Stop that one, then try again.",
    );
    const labels = [...root.querySelectorAll("button")].map((one) => one.textContent);
    expect(labels).not.toContain("Try again");
    expect(message(root).value).toBe("Hello");

    await send(root);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Not started: Reporter uses a connector, which Studio can't start yet. To start it, run this in a terminal:",
    );
    expect(root.querySelector("form code")?.textContent).toBe("halonic run reply");
  });

  it("keeps the next step and the command in the phone's sheet too", async () => {
    const connector = Object.assign(
      new KindedError("unavailable", "Reporter uses a connector, which Studio can't start yet.", {
        fix: "To start it, run this in a terminal:",
      }),
      { command: "halonic run reply" },
    );
    const requests = requestsStarting([support], async () => {
      throw connector;
    });
    const { root } = await open(requests, { phone: true });
    await act(async () => {
      button(root, "New request").click();
    });
    await type(message(root), "Hello");
    await send(root);
    expect(root.querySelector("dialog code")?.textContent).toBe("halonic run reply");
  });
});
