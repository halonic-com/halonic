// @vitest-environment jsdom
import type { ViewRef } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, useEffect, useRef } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { fakeSetups, setupEntry } from "../fake-setups.test-helper.ts";
import { Inbox, type SetupViewProps } from "../inbox.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();
const now = () => new Date(2026, 10, 8, 10, 43);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A source's view as a provider writes one: the current step's title takes focus. */
function GoogleSetupView({ item, answering, close }: SetupViewProps) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  return (
    <section>
      <h2 ref={title} tabIndex={-1}>
        {item.progress}
      </h2>
      <button type="button" aria-disabled={answering ? undefined : true}>
        Check again
      </button>
      <button type="button" onClick={close}>
        Not now
      </button>
    </section>
  );
}

/** A view whose module loads when the test says, or fails. */
function controlledView() {
  let finish: (module: object) => void = () => {};
  let failNext = false;
  const view: ViewRef = {
    view: "GoogleSetupView",
    load: () =>
      failNext
        ? Promise.reject(new Error("The module couldn't be fetched."))
        : new Promise<object>((resolve) => {
            finish = resolve;
          }),
  };
  return {
    view,
    failNext: (fail: boolean) => {
      failNext = fail;
    },
    finish: async () => {
      finish({ GoogleSetupView });
      await settled();
    },
  };
}

async function openFirst(extra: Parameters<typeof fakeSetups>[2] = {}) {
  const runs = fakeRuns([]);
  const inbox = new Inbox(runs.runs);
  const google = fakeSetups("google", [setupEntry("acct-1", at(9, 0))], extra);
  inbox.addSetupSource(google.source);
  await settled();
  const root = render(<InboxView inbox={inbox} now={now} />);
  const cell = root.querySelector<HTMLElement>('[role="grid"] [role="gridcell"]') as HTMLElement;
  act(() => cell.click());
  await settled();
  return { root, inbox, google, runs, cell };
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((each) => each.textContent === name);
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
}

verifies("inbox.setup-pane", () => {
  it("shows the loading skeleton, then the source's view with the current step focused", async () => {
    const loader = controlledView();
    const { root } = await openFirst({ view: loader.view });
    expect(root.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe(
      "Loading the Google setup",
    );
    await loader.finish();
    const title = root.querySelector("section h2");
    expect(title?.textContent).toBe("Step 4 of 7 · Scopes");
    expect(document.activeElement).toBe(title);
  });

  it("says it couldn't load the view, with the reason, and Try again loads it", async () => {
    const loader = controlledView();
    loader.failNext(true);
    const { root } = await openFirst({ view: loader.view });
    expect(root.textContent).toContain("Couldn't load the Google setup");
    expect(root.textContent).toContain("Halonic ran into a problem it can't explain yet.");
    loader.failNext(false);
    act(() => button(root, "Try again").click());
    await loader.finish();
    expect(root.querySelector("section h2")?.textContent).toBe("Step 4 of 7 · Scopes");
  });

  it("closes on Not now, with focus back on its row", async () => {
    const { root, cell } = await openFirst();
    act(() => button(root, "Not now").click());
    expect(root.textContent).toContain("Pick something on the left to see it here.");
    expect(document.activeElement).toBe(cell);
  });

  it("closes on Escape", async () => {
    const { root, cell } = await openFirst();
    act(() => {
      button(root, "Not now").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(root.querySelector("section")).toBeNull();
    expect(document.activeElement).toBe(cell);
  });

  it("says the engine isn't answering and the view marks its actions", async () => {
    const loader = controlledView();
    const { root, inbox, runs } = await openFirst({ view: loader.view });
    await loader.finish();
    runs.fail(new Error("down"));
    await act(() => inbox.refresh());
    expect(root.textContent).toContain("The engine isn't answering. Showing what it said last.");
    expect(button(root, "Check again").getAttribute("aria-disabled")).toBe("true");
    expect(button(root, "Not now").getAttribute("aria-disabled")).toBeNull();
  });

  it("shows the latest step, and stays open once the setup is done", async () => {
    const loader = controlledView();
    const { root, google } = await openFirst({ view: loader.view });
    await loader.finish();
    google.change([setupEntry("acct-1", at(9, 5), { progress: "Step 7 of 7 · Done" })]);
    await settled();
    expect(root.querySelector("section h2")?.textContent).toBe("Step 7 of 7 · Done");
    google.change([]);
    await settled();
    expect(root.querySelector('[role="grid"] [role="gridcell"]')).toBeNull();
    expect(root.querySelector("section h2")?.textContent).toBe("Step 7 of 7 · Done");
  });

  it("opens an account's item from openSetup", async () => {
    const inbox = new Inbox(fakeRuns([]).runs);
    inbox.addSetupSource(fakeSetups("google", [setupEntry("acct-1", at(9, 0))]).source);
    await settled();
    inbox.openSetup("google", "acct-1");
    const root = render(<InboxView inbox={inbox} now={now} />);
    expect(root.querySelector("section h2")?.textContent).toBe("Set up Google for x@example.com");
  });
});
