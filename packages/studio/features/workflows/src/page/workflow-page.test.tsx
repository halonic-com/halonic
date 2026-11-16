// @vitest-environment jsdom

import { RunsListService, RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkflowsHostService, type WorkflowView } from "../api.ts";
import { workflowsFeature } from "../feature.ts";
import {
  buttonNamed,
  listing,
  memoryHost,
  memoryRuns,
  runSummary,
  show,
  unmount,
} from "../test-support.tsx";
import { WorkflowPage, WorkflowScreen } from "./workflow-page.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "start",
  steps: [
    { id: "start", type: "task" },
    { id: "write", type: "task", agent: "writer" },
    { id: "done", type: "final" },
  ],
  arrows: [
    { from: "start", to: "write" },
    { from: "write", to: "done", label: "ok" },
  ],
  layout: {},
};

const surface = (page: HTMLElement) =>
  page.querySelector<HTMLElement>("[data-testid=canvas-surface]");

verifies("workflows.page.frame-and-states", () => {
  it("shows the name and the cards at once, with no skeleton and no ⤢ or ✕", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );

    expect(page.querySelector("h1")?.textContent).toBe("Support reply");
    expect(page.textContent).toContain("WORKFLOW");
    expect(page.querySelector("[role=status]")).toBeNull();
    expect(page.querySelector("[aria-label*=ximise], [aria-label=Close]")).toBeNull();
  });

  it("doesn't repeat the name on a phone, where the top bar has it", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(
      <PresentationProvider presentation="phone">
        <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />
      </PresentationProvider>,
    );
    expect(page.textContent).toContain("WORKFLOW");
    expect(page.querySelector("h1")?.className).toContain("sr-only");
    expect(page.querySelector("header")?.className).toContain("flex-col");
  });

  it("shows a skeleton only after 300 ms, and Still loading after 10 s", async () => {
    const { host } = memoryHost([], [], [reply]);
    const slow = { ...host, read: () => new Promise<WorkflowView>(() => {}) };
    const page = await show(
      <WorkflowScreen host={slow} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    expect(page.querySelector("[role=status]")).toBeNull();

    await act(async () => vi.advanceTimersByTime(300));
    expect(page.querySelector("[role=status]")?.textContent).toContain("Loading reply");
    expect(page.textContent).not.toContain("Still loading");

    await act(async () => vi.advanceTimersByTime(10_000));
    expect(page.textContent).toContain("Still loading");
    expect(buttonNamed(page, "Try again")).toBeDefined();
  });

  it("says why it couldn't load, and Try again reads again", async () => {
    let calls = 0;
    const { host } = memoryHost([], [], [reply]);
    const failing = {
      ...host,
      read: async (ref: { hubId: string; id: string }) => {
        calls += 1;
        if (calls === 1) throw new Error("The engine isn't answering. It may still be starting.");
        return host.read(ref);
      },
    };
    const page = await show(
      <WorkflowScreen host={failing} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    expect(page.textContent).toContain("Couldn't load this workflow");
    expect(page.textContent).toContain("The engine isn't answering. It may still be starting.");

    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.querySelector("h1")?.textContent).toBe("Support reply");
  });

  it("keeps the zoom when the workflow changes under it", async () => {
    let current = reply;
    const listeners = new Set<() => void>();
    const tell = () => {
      for (const listener of listeners) listener();
    };
    const { host } = memoryHost([], [], [reply]);
    const changing = {
      ...host,
      read: async () => current,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const page = await show(
      <WorkflowScreen host={changing} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    await act(async () => buttonNamed(page, "Zoom in")?.click());
    const zoomed = surface(page)?.style.transform;

    current = { ...reply, steps: [...reply.steps, { id: "extra", type: "task" }] };
    await act(async () => tell());
    expect(page.querySelectorAll("button[aria-pressed]")).toHaveLength(4);
    expect(surface(page)?.style.transform).toBe(zoomed);
  });

  it("keeps the zoom and pan across a visit to Configuration", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    await act(async () => buttonNamed(page, "Zoom in")?.click());
    await act(async () => buttonNamed(page, "Zoom in")?.click());
    const zoomed = surface(page)?.style.transform;

    await act(async () => buttonNamed(page, "Configuration")?.click());
    expect(surface(page)).toBeNull();
    await act(async () => buttonNamed(page, "Flow")?.click());
    expect(surface(page)?.style.transform).toBe(zoomed);
  });

  it("opens another workflow fitted, not at the zoom and pan of the one before", async () => {
    const other: WorkflowView = { ...reply, id: "other", name: "Other" };
    const { host } = memoryHost([], [], [reply, other]);
    const Switch = () => {
      const [id, setId] = useState("reply");
      return (
        <>
          <button type="button" onClick={() => setId("other")}>
            Switch
          </button>
          <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id={id} />
        </>
      );
    };
    const page = await show(<Switch />);
    const fitted = surface(page)?.style.transform;
    await act(async () => buttonNamed(page, "Zoom in")?.click());
    await act(async () => buttonNamed(page, "Zoom in")?.click());
    expect(surface(page)?.style.transform).not.toBe(fitted);

    await act(async () => buttonNamed(page, "Switch")?.click());
    expect(page.querySelector("h1")?.textContent).toBe("Other");
    expect(surface(page)?.style.transform).toBe(fitted);
  });

  it("keeps the canvas when a refresh fails", async () => {
    let failing = false;
    const listeners = new Set<() => void>();
    const tell = () => {
      for (const listener of listeners) listener();
    };
    const { host } = memoryHost([], [], [reply]);
    const flaky = {
      ...host,
      read: async () => {
        if (failing) throw new Error("The engine isn't answering. It may still be starting.");
        return reply;
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const page = await show(
      <WorkflowScreen host={flaky} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    await act(async () => buttonNamed(page, "Zoom in")?.click());
    const zoomed = surface(page)?.style.transform;

    failing = true;
    await act(async () => tell());
    expect(page.textContent).not.toContain("Couldn't load this workflow");
    expect(surface(page)?.style.transform).toBe(zoomed);
  });
});

verifies("workflows.page.step-cards", () => {
  it("draws a card per step with its kind, id, agent and the Start mark, and an arrow per way on", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    const cards = [...page.querySelectorAll("button[aria-pressed]")].map((card) =>
      card.textContent?.replace(/\s+/g, " "),
    );

    expect(cards).toEqual(["AGENT STEPstartStartNo agent", "AGENT STEPwritewriter", "ENDdone"]);
    expect(page.querySelectorAll("svg path")).toHaveLength(2);
    expect(page.querySelector("svg text")?.textContent).toBe("ok");
  });

  it("selects the pressed card and moves the selection to the next", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    const card = (index: number) =>
      page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")[index];

    await act(async () => card(0)?.click());
    expect(card(0)?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => card(1)?.click());
    expect(card(0)?.getAttribute("aria-pressed")).toBe("false");
    expect(card(1)?.getAttribute("aria-pressed")).toBe("true");
  });

  it("fits all steps again on Fit to screen", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    const fitted = surface(page)?.style.transform;

    await act(async () => buttonNamed(page, "Zoom in")?.click());
    expect(surface(page)?.style.transform).not.toBe(fitted);
    await act(async () => buttonNamed(page, "Fit to screen")?.click());
    expect(surface(page)?.style.transform).toBe(fitted);
  });
});

const settings = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "start",
  stepIds: ["start", "write", "done"],
  file: "hubs/acme/workflows/reply.workflow.yaml",
  problems: [],
} as const;

const startCommand = (page: HTMLElement) =>
  page.querySelector("[data-testid=start-command] code")?.textContent;

verifies("workflows.page.start-command", () => {
  it("shows how to start the workflow, with Copy command, on both tabs", async () => {
    const { host } = memoryHost([], [], [reply], [settings]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    for (const tabName of ["Flow", "Configuration"]) {
      await act(async () =>
        [...page.querySelectorAll<HTMLElement>("[role=tab]")]
          .find((one) => one.textContent?.startsWith(tabName))
          ?.click(),
      );
      expect(page.textContent).toContain("Start it from a terminal:");
      expect(startCommand(page)).toBe("halonic run reply");
      expect(page.querySelector("button[aria-label='Copy command']")).not.toBeNull();
    }
  });

  it("shows no command when the workflow has an error", async () => {
    const broken = {
      ...settings,
      problems: [{ severity: "error", code: "dead-end", message: "No way on." }],
    } as const;
    const { host } = memoryHost([], [], [reply], [broken]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    expect(page.textContent).not.toContain("Start it from a terminal");
    expect(startCommand(page)).toBeUndefined();
  });

  it("names the hub when another hub has a workflow with the same id", async () => {
    const { host } = memoryHost(
      [],
      [listing("acme", "reply", "Support reply"), listing("beta", "reply", "Reply")],
      [reply],
      [settings],
    );
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    expect(startCommand(page)).toBe("halonic run acme/reply");
  });
});

verifies("workflows.runs.runs-view", () => {
  it("counts the runs that need you on the Runs tab and opens the Runs view from it", async () => {
    const { host } = memoryHost([], [], [reply]);
    const waiting = runSummary({
      id: "run_a_01wait1",
      status: "waiting",
      state: "approve",
      accepts: ["approve"],
    });
    const { source } = memoryRuns([waiting]);
    const page = await show(<WorkflowScreen host={host} runs={source} hubId="acme" id="reply" />);

    const tab = [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((one) =>
      one.textContent?.startsWith("Runs"),
    );
    expect(tab?.textContent).toContain("1");
    await act(async () => tab?.click());
    expect(page.querySelector("section[aria-label=Now]")).not.toBeNull();
  });

  it("asks the Runs list to show this workflow before See all opens it", async () => {
    const { host } = memoryHost([], [], [reply]);
    const { source } = memoryRuns([runSummary({ id: "run_a_01done1", status: "completed" })]);
    const calls: string[] = [];
    const list = {
      showWorkflow: (workflow: { hubId: string; id: string }) => {
        calls.push(`show ${workflow.hubId}/${workflow.id}`);
      },
    };
    const services = new Map<unknown, unknown>([
      [WorkflowsHostService, host],
      [RunsSourceService, source],
      [RunsListService, list],
    ]);
    const context = {
      services: limitedLookup(workflowsFeature, { get: (key) => services.get(key) }),
      openPlace: (place: string) => calls.push(`open ${place}`),
    };
    const page = await show(
      <WorkflowPage
        item={{ kind: "workflow", hub: "acme", id: "reply" }}
        context={context as never}
        Sections={() => null}
      />,
    );

    const tab = [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((one) =>
      one.textContent?.startsWith("Runs"),
    );
    await act(async () => tab?.click());
    await act(async () => buttonNamed(page, "See all")?.click());

    expect(calls).toEqual(["show acme/reply", "open runs"]);
  });
});
