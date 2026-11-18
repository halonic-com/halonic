// @vitest-environment jsdom
import { ListHeading, PresentationProvider } from "@halonicjs/studio-kit";
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { SampleStepId } from "../api.ts";
import { firstRunFeature } from "../feature.ts";
import type { SampleProgress, SampleProgressState } from "../sample-progress.ts";
import { SampleCard, SampleSteps } from "./sample-card.tsx";
import { stepOpeners, testsOpener } from "./step-openers.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function render(element: ReactNode): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(element));
  return container;
}

/** A progress with the steps done a test sets; only what the card reads is there. */
function progressWith(
  done: readonly SampleStepId[],
  finishedRun?: SampleProgressState["finishedRun"],
  extra: { startOwnWorkspace?: () => void; recordFinishedShown?: () => void } = {},
) {
  const state: SampleProgressState = { done: new Set(done), finishedRun };
  return {
    state,
    subscribe: () => () => {},
    recordFinishedShown: () => {},
    ...extra,
  } as unknown as SampleProgress;
}

const never = () => {
  throw new Error("not opened");
};
const noOpeners = { start: never, decide: never, see: never };

verifies("first-run.sample-card", () => {
  it("lists the three steps, numbered, under '0 of 3 done'", () => {
    const root = render(<SampleSteps progress={progressWith([])} openers={noOpeners} />);
    expect(root.querySelector("p")?.textContent).toBe("0 of 3 done");
    const text = root.textContent ?? "";
    for (const title of [
      "Start a support request",
      "Approve or reject the reply",
      "See what it did",
    ]) {
      expect(text).toContain(title);
    }
    expect(text).toContain("An invented customer asks for a refund.");
  });

  it("counts the done steps, marks them for a screen reader, and opens a step by its row", () => {
    const start = vi.fn();
    const root = render(
      <SampleSteps progress={progressWith(["start"])} openers={{ ...noOpeners, start }} />,
    );
    expect(root.querySelector("p")?.textContent).toBe("1 of 3 done");
    const first = root.querySelector<HTMLElement>('[role="gridcell"]');
    expect(first?.getAttribute("aria-label")).toBe("Step 1 of 3: Start a support request, done");
    const rows = root.querySelectorAll('[role="gridcell"]');
    expect(rows[1]?.getAttribute("aria-label")).toBe(
      "Step 2 of 3: Approve or reject the reply, not done",
    );
    act(() => first?.click());
    expect(start).toHaveBeenCalledOnce();
  });

  it("says 'Try the sample: 2 of 3 done.' when a step finishes, and not for the count it opened with", () => {
    const listeners = new Set<() => void>();
    let state: SampleProgressState = { done: new Set(["start"]), finishedRun: undefined };
    const progress = {
      get state() {
        return state;
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      recordFinishedShown: () => {},
    } as unknown as SampleProgress;
    const announce = vi.fn();
    render(<SampleSteps progress={progress} openers={noOpeners} announce={announce} />);
    expect(announce).not.toHaveBeenCalled();
    state = { done: new Set(["start", "decide"]), finishedRun: undefined };
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(announce).toHaveBeenCalledExactlyOnceWith("Try the sample: 2 of 3 done.");
  });

  it("says 'You've seen it work.' once all three are done, with the count", () => {
    const root = render(
      <SampleSteps progress={progressWith(["start", "decide", "see"])} openers={noOpeners} />,
    );
    expect(root.textContent).toContain("You've seen it work.");
    expect(root.textContent).toContain("3 of 3 done");
  });

  it("insets '0 of 3 done' like the section heading, small and muted, in all three states", () => {
    // jsdom draws nothing, so the left edges are compared by the inset class they come from.
    const insetOf = (element: Element | null | undefined) =>
      element?.className.match(/(?:^|\s)(p[xs]-\S+)/)?.[1];
    const heading = render(<ListHeading name="Try the sample" />).querySelector("h2");
    const all = ["start", "decide", "see"] as const;
    const states = {
      steps: <SampleSteps progress={progressWith([])} openers={noOpeners} />,
      finished: <SampleSteps progress={progressWith(all)} openers={noOpeners} />,
      phone: (
        <PresentationProvider presentation="phone">
          <SampleSteps progress={progressWith(all)} openers={noOpeners} />
        </PresentationProvider>
      ),
    };
    for (const [state, card] of Object.entries(states)) {
      const caption = [...render(card).querySelectorAll("p")].find((line) =>
        line.textContent?.endsWith("of 3 done"),
      );
      expect(insetOf(caption), state).toBe(insetOf(heading));
      expect(caption?.className, state).toContain("text-small text-fg-muted");
    }
  });

  it("on a phone insets the finished line and both link rows like the section heading", () => {
    const insetOf = (element: Element | null | undefined) =>
      element?.className.match(/(?:^|\s)(p[xs]-\S+)/)?.[1];
    const heading = render(<ListHeading name="Try the sample" />).querySelector("h2");
    const root = render(
      <PresentationProvider presentation="phone">
        <SampleSteps
          progress={progressWith(["start", "decide", "see"], { hub: "support" } as never, {
            startOwnWorkspace: () => {},
          })}
          openers={noOpeners}
          openTests={() => {}}
        />
      </PresentationProvider>,
    );
    const finishedLine = [...root.querySelectorAll("p")].find((line) =>
      line.textContent?.includes("You've seen it work."),
    );
    expect(insetOf(finishedLine)).toBe(insetOf(heading));
    const rows = [...root.querySelectorAll("button")];
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(insetOf(row), row.textContent ?? "").toBe(insetOf(heading));
  });

  it("draws the finished card's tick at icon size, on the desktop and on a phone", () => {
    const all = ["start", "decide", "see"] as const;
    for (const presentation of ["desktop", "phone"] as const) {
      const root = render(
        <PresentationProvider presentation={presentation}>
          <SampleSteps progress={progressWith(all)} openers={noOpeners} />
        </PresentationProvider>,
      );
      const box = root.querySelector("svg")?.parentElement;
      expect(box?.className, presentation).toContain("size-icon-sm");
      expect(box?.className, presentation).toContain("*:size-full");
    }
  });

  it("offers Start your own workspace when finished, and saves that the card was shown", () => {
    const startOwnWorkspace = vi.fn();
    const recordFinishedShown = vi.fn();
    const root = render(
      <SampleSteps
        progress={progressWith(["start", "decide", "see"], undefined, {
          startOwnWorkspace,
          recordFinishedShown,
        })}
        openers={noOpeners}
      />,
    );
    expect(recordFinishedShown).toHaveBeenCalled();
    const button = root.querySelector("button");
    expect(button?.textContent).toBe("Start your own workspace");
    act(() => button?.click());
    expect(startOwnWorkspace).toHaveBeenCalledOnce();
  });

  it("offers Run its tests when finished, which opens the support workflow in the hub of its runs", () => {
    const openTests = vi.fn();
    const root = render(
      <SampleSteps
        progress={progressWith(["start", "decide", "see"], {
          kind: "run",
          hub: "support",
          id: "r1",
        })}
        openers={noOpeners}
        openTests={openTests}
      />,
    );
    const button = [...root.querySelectorAll("button")].find(
      (each) => each.textContent === "Run its tests",
    );
    act(() => button?.click());
    expect(openTests).toHaveBeenCalledWith("support");
    // Not offered while no finished run says which hub the workflow is in, or before the end.
    const noRun = render(
      <SampleSteps
        progress={progressWith(["start", "decide", "see"])}
        openers={noOpeners}
        openTests={openTests}
      />,
    );
    expect(noRun.textContent).not.toContain("Run its tests");
    const unfinished = render(
      <SampleSteps
        progress={progressWith(["start"], { kind: "run", hub: "support", id: "r1" })}
        openers={noOpeners}
        openTests={openTests}
      />,
    );
    expect(unfinished.textContent).not.toContain("Run its tests");
  });

  it("offers no button when the app has no New workspace dialog, and doesn't save an unfinished card", () => {
    const recordFinishedShown = vi.fn();
    const finished = render(
      <SampleSteps
        progress={progressWith(["start", "decide", "see"], undefined, { recordFinishedShown })}
        openers={noOpeners}
      />,
    );
    expect(finished.querySelector("button")).toBeNull();
    recordFinishedShown.mockClear();
    render(
      <SampleSteps
        progress={progressWith(["start"], undefined, { recordFinishedShown })}
        openers={noOpeners}
      />,
    );
    expect(recordFinishedShown).not.toHaveBeenCalled();
  });
});

/** The Inbox as the openers use it: a waiting wait item or none. */
function contextWith(waiting: boolean) {
  const inbox = {
    state: { items: waiting ? [{ kind: "wait", key: "r2:review" }] : [] },
    requestNewRequest: vi.fn(),
    requestOpen: vi.fn(),
  };
  const openPlace = vi.fn();
  const openItem = vi.fn();
  const context = {
    services: limitedLookup(firstRunFeature, { get: () => inbox }),
    openPlace,
    openItem,
  } as unknown as WorkspaceContext;
  return { context, inbox, openPlace, openItem };
}

verifies("first-run.sample-card", () => {
  it("opens the request form for step 1", () => {
    const { context, inbox, openPlace } = contextWith(false);
    stepOpeners(context, progressWith([])).start();
    expect(inbox.requestNewRequest).toHaveBeenCalledOnce();
    expect(inbox.requestNewRequest).toHaveBeenCalledWith(
      "Hi, my order #1042 arrived damaged. Can I get a refund?",
    );
    expect(openPlace).toHaveBeenCalledWith("inbox");
  });

  it("opens the waiting card for step 2, and the form when none waits", () => {
    const waiting = contextWith(true);
    stepOpeners(waiting.context, progressWith(["start"])).decide();
    expect(waiting.inbox.requestOpen).toHaveBeenCalledWith("r2:review");
    expect(waiting.openPlace).toHaveBeenCalledWith("inbox");

    const none = contextWith(false);
    stepOpeners(none.context, progressWith([])).decide();
    expect(none.inbox.requestNewRequest).toHaveBeenCalledOnce();
  });

  it("opens the support workflow on its Tests for Run its tests, where the window can open pages", () => {
    const { context, openItem } = contextWith(false);
    testsOpener(context)?.("support");
    expect(openItem).toHaveBeenCalledWith(
      { kind: "workflow", hub: "support", id: "support-reply" },
      { step: "tests" },
    );
    expect(
      testsOpener({ services: context.services, announcer: context.announcer }),
    ).toBeUndefined();
  });

  it("opens the finished run for step 3, and else what the next open step does", () => {
    const finished = { kind: "run", hub: "support", id: "r1" };
    const withRun = contextWith(false);
    stepOpeners(withRun.context, progressWith(["start", "decide"], finished)).see();
    expect(withRun.openItem).toHaveBeenCalledWith(finished);

    const fresh = contextWith(false);
    stepOpeners(fresh.context, progressWith([])).see();
    expect(fresh.inbox.requestNewRequest).toHaveBeenCalledOnce();

    const started = contextWith(true);
    stepOpeners(started.context, progressWith(["start"])).see();
    expect(started.inbox.requestOpen).toHaveBeenCalledWith("r2:review");
  });
});

verifies("first-run.sample-card", () => {
  it("shows nothing in a workspace that isn't the sample", () => {
    const firstRun = { progress: () => undefined };
    const context = {
      services: limitedLookup(firstRunFeature, { get: () => firstRun }),
    } as unknown as WorkspaceContext;
    const root = render(<SampleCard context={context} />);
    expect(root.textContent).toBe("");
  });

  it("shows the steps in the sample", () => {
    const { context } = contextWith(false);
    const firstRun = { progress: () => progressWith(["start"]) };
    const services = {
      get: (key: { name: string }) =>
        key.name === "first-run" ? firstRun : context.services.get(key as never),
    };
    const root = render(
      <SampleCard context={{ ...context, services } as unknown as WorkspaceContext} />,
    );
    expect(root.querySelector("p")?.textContent).toBe("1 of 3 done");
  });

  it("on a phone shows the finished card's two buttons as 48px link rows, the second doing what the desktop's button does", () => {
    const startOwnWorkspace = vi.fn();
    const root = render(
      <PresentationProvider presentation="phone">
        <SampleSteps
          progress={progressWith(["start", "decide", "see"], { hub: "support" } as never, {
            startOwnWorkspace,
          })}
          openers={noOpeners}
          openTests={() => {}}
        />
      </PresentationProvider>,
    );
    const rows = [...root.querySelectorAll("button")];
    expect(rows.map((row) => row.textContent)).toEqual([
      "Run its tests",
      "Start your own workspace",
    ]);
    expect(rows.every((row) => row.className.includes("min-h-touch"))).toBe(true);
    act(() => rows[1]?.click());
    expect(startOwnWorkspace).toHaveBeenCalledOnce();
  });
});
