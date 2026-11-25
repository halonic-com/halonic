// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { memoryRecapMark, RecapStore } from "../recap-store.ts";
import { RecapView, waitingWords } from "./recap-view.tsx";

// Tells React this is a test, so it checks that updates happen inside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = new Date("2026-11-24T10:00:00.000Z");

/** Draws the recap of `messaging` and gives its text and container. */
async function drawRecap(messaging: FakeAgentMessaging, options: { strict?: boolean } = {}) {
  const store = new RecapStore(messaging, memoryRecapMark("2026-11-23T10:00:00.000Z"), () => now);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const view = <RecapView store={store} />;
  await act(async () =>
    root.render(options.strict === true ? <StrictMode>{view}</StrictMode> : view),
  );
  const text = container.textContent ?? "";
  const hasImage = container.querySelector("img") !== null;
  act(() => root.unmount());
  container.remove();
  return { text, hasImage };
}

verifies("overview.daily-recap", () => {
  it("draws counts, waiting times and newly blocked work, as plain text", async () => {
    const messaging = new FakeAgentMessaging({ now: () => now });
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    messaging.addInboxItem(acme.id, {
      question: "<img src=x onerror=alert(1)> Ship on Friday?",
      createdAt: "2026-11-22T10:00:00.000Z",
    });
    messaging.addWork(acme.id, { label: "ACME-2", title: "Print the flyers", state: "blocked" });

    const { text, hasImage } = await drawRecap(messaging);

    expect(text).toContain("0 items answered");
    expect(text).toContain("1 item still open");
    expect(text).toContain("Ship on Friday? · waiting 2 days");
    expect(text).toContain("Newly blocked");
    expect(text).toContain("ACME-2 Print the flyers");
    expect(hasImage).toBe(false);
  });

  it("keeps what changed when StrictMode opens the recap twice", async () => {
    const messaging = new FakeAgentMessaging({ now: () => now });
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    messaging.addWork(acme.id, { label: "ACME-2", title: "Print the flyers", state: "blocked" });

    const { text } = await drawRecap(messaging, { strict: true });

    expect(text).toContain("ACME-2 Print the flyers");
    expect(text).not.toContain("Nothing changed");
  });

  it("says nothing changed under its Recap heading when the recap is empty", async () => {
    const { text } = await drawRecap(new FakeAgentMessaging({ now: () => now }));

    expect(text).toBe("RecapNothing changed since your last recap.");
  });

  it("announces loading in a status region and a failed read as an alert", async () => {
    const messaging = new FakeAgentMessaging();
    let failRead: (error: Error) => void = () => {};
    messaging.listWork = () =>
      new Promise((_, reject) => {
        failRead = reject;
      });
    const store = new RecapStore(messaging, memoryRecapMark("2026-11-23T10:00:00.000Z"), () => now);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<RecapView store={store} />));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Loading…");

    await act(async () => failRead(new Error("source is down")));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "The recap couldn't be read.",
    );
    act(() => root.unmount());
    container.remove();
  });

  it("words a wait in its largest whole unit", () => {
    expect([
      waitingWords(90_000),
      waitingWords(3 * 3_600_000),
      waitingWords(25 * 3_600_000),
    ]).toEqual(["1 minute", "3 hours", "1 day"]);
  });
});
