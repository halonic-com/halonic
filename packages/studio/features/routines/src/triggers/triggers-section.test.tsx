// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { RoutineRef, RoutinesHost, TriggerOwner, TriggerRow } from "../api.ts";
import { show, unmount } from "../test-support.tsx";
import { TriggersView } from "./triggers-section.tsx";

afterEach(unmount);

const agent: TriggerOwner = { kind: "agent", hubId: "acme", id: "writer" };

function row(id: string, name: string, more: Partial<TriggerRow> = {}): TriggerRow {
  return { hubId: "acme", id, name, enabled: true, sentence: "Daily at 07:30", ...more };
}

function hostWith(
  rows: readonly TriggerRow[],
  addTrigger: (owner: TriggerOwner) => Promise<RoutineRef> = async () => ({
    hubId: "acme",
    id: "writer-2",
  }),
) {
  return {
    startingRoutines: async () => rows,
    addTrigger,
    subscribe: () => () => {},
  } as unknown as RoutinesHost;
}

const press = (element: Element | undefined) =>
  act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

verifies("routines.triggers.lists-routines-that-start-it", () => {
  it("lists a row per routine with its sentence, name and Off chip, and opens it", async () => {
    const opened: string[] = [];
    const tomorrow = new Date(Date.now() + 36 * 3_600_000).toISOString();
    const page = await show(
      <TriggersView
        host={hostWith([
          row("daily", "Daily", { nextRun: tomorrow }),
          row("inbox", "Inbox", { enabled: false, sentence: "Manual only" }),
        ])}
        owner={agent}
        openRoutine={(hubId, id) => opened.push(`${hubId}/${id}`)}
      />,
    );
    const rows = [...page.querySelectorAll("li")];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Daily at 07:30");
    expect(rows[0]?.textContent).toMatch(/Daily · next /);
    expect(rows[1]?.textContent).toContain("Manual only");
    expect(rows[1]?.textContent).toContain("Off");
    await press(rows[1]?.querySelector("button") ?? undefined);
    expect(opened).toEqual(["acme/inbox"]);
  });

  it("gives a row a touch-sized height on a phone", async () => {
    const page = await show(
      <PresentationProvider presentation="phone">
        <TriggersView host={hostWith([row("daily", "Daily")])} owner={agent} />
      </PresentationProvider>,
    );
    expect(page.querySelector("li button")?.className).toContain("min-h-control-md");
  });

  it("is named Triggers without a heading of its own, since its page's tab says so", async () => {
    const page = await show(<TriggersView host={hostWith([])} owner={agent} />);
    expect(page.querySelector("section")?.getAttribute("aria-label")).toBe("Triggers");
    expect(page.querySelector("h1, h2, h3")).toBeNull();
  });
});

verifies("routines.triggers.lists-routines-that-start-it", () => {
  it("opens a row without a hub in the owner's hub", async () => {
    const opened: string[] = [];
    const page = await show(
      <TriggersView
        host={hostWith([row("daily", "Daily", { hubId: null })])}
        owner={agent}
        openRoutine={(hubId, id) => opened.push(`${hubId}/${id}`)}
      />,
    );
    await press(page.querySelector("li button") ?? undefined);
    expect(opened).toEqual(["acme/daily"]);
  });
});

verifies("routines.triggers.empty-state", () => {
  it("says what the owner does with no routine, by kind", async () => {
    const page = await show(<TriggersView host={hostWith([])} owner={agent} />);
    expect(page.textContent).toContain(
      "Nothing starts this agent on its own yet; it runs when called.",
    );
    unmount();
    const workflow = await show(
      <TriggersView host={hostWith([])} owner={{ ...agent, kind: "workflow" }} />,
    );
    expect(workflow.textContent).toContain(
      "Nothing starts this workflow on its own yet; it runs when called or with Run.",
    );
    expect(workflow.textContent).toContain("Add trigger");
  });
});

verifies("routines.triggers.add-trigger-creates-routine", () => {
  it("opens the routine the host made", async () => {
    const opened: string[] = [];
    const page = await show(
      <TriggersView
        host={hostWith([])}
        owner={agent}
        openRoutine={(hubId, id, step) => opened.push(`${hubId}/${id}/${step}`)}
      />,
    );
    await press([...page.querySelectorAll("button")].find((b) => b.textContent === "Add trigger"));
    expect(opened).toEqual(["acme/writer-2/trigger"]);
  });

  it("says why when the host can't, and keeps the rows", async () => {
    const page = await show(
      <TriggersView
        host={hostWith([row("daily", "Daily")], async () => {
          throw new Error("The disk is full.");
        })}
        owner={agent}
      />,
    );
    await press([...page.querySelectorAll("button")].find((b) => b.textContent === "Add trigger"));
    expect(page.querySelector("[role=alert]")?.textContent).toContain("Couldn't add a trigger.");
    expect(page.querySelectorAll("li")).toHaveLength(1);
  });
});
