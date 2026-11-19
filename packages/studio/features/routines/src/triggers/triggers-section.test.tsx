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

const workflow: TriggerOwner = { kind: "workflow", hubId: "acme", id: "reply" };

function hostWith(
  rows: readonly TriggerRow[],
  addTrigger: (owner: TriggerOwner, prompt?: string) => Promise<RoutineRef> = async () => ({
    hubId: "acme",
    id: "writer-2",
  }),
) {
  return {
    startingRoutines: async () => rows,
    ownerName: async () => "Writer",
    addTrigger,
    subscribe: () => () => {},
  } as unknown as RoutinesHost;
}

const press = (element: Element | undefined) =>
  act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

const button = (page: HTMLElement, label: string) =>
  [...page.querySelectorAll("button")].find((one) => one.textContent === label);

/** Types into a React text area, as a person would. */
const type = (field: HTMLTextAreaElement, text: string) =>
  act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setValue?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
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

  it("shows a row's focus and hover as a routine's run row does, with its text inset", async () => {
    const page = await show(
      <TriggersView host={hostWith([row("daily", "Daily")])} owner={agent} />,
    );
    expect(page.querySelector("li button")?.className).toContain(
      "rounded-sm px-2 text-left hover:bg-surface-muted focus-ring",
    );
  });

  it("ends a row in a chevron on desktop, after the Off chip, and drops it on a phone", async () => {
    const rows = [row("daily", "Daily"), row("inbox", "Inbox", { enabled: false })];
    const desktop = await show(
      <TriggersView host={hostWith(rows)} owner={agent} openRoutine={() => {}} />,
    );
    const buttons = [...desktop.querySelectorAll("li button")];
    expect(buttons.map((b) => b.querySelectorAll("[aria-hidden='true'] svg").length)).toEqual([
      1, 1,
    ]);
    expect(buttons[1]?.lastElementChild?.textContent).toBe("Off");

    const phone = await show(
      <PresentationProvider presentation="phone">
        <TriggersView host={hostWith(rows)} owner={agent} openRoutine={() => {}} />
      </PresentationProvider>,
    );
    expect(phone.querySelectorAll("li button svg")).toHaveLength(0);
  });

  it("has no heading or region of its own, since its page's tab panel names it", async () => {
    const page = await show(<TriggersView host={hostWith([])} owner={agent} />);
    expect(
      page.querySelector("section, [role='region'], [aria-label], [aria-labelledby]"),
    ).toBeNull();
    expect(page.querySelector("h1, h2, h3")).toBeNull();
  });

  it("heads a failed read at the level under the page's title", async () => {
    const host = {
      ...hostWith([]),
      startingRoutines: async () => {
        throw new Error("The hub is offline.");
      },
    } as unknown as RoutinesHost;
    const page = await show(<TriggersView host={host} owner={agent} />);
    expect(page.querySelector("h2")?.textContent).toBe("Couldn't load triggers");
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
  it("opens the routine the host made for a workflow, with no prompt", async () => {
    const opened: string[] = [];
    const made: (string | undefined)[] = [];
    const page = await show(
      <TriggersView
        host={hostWith([], async (_owner, prompt) => {
          made.push(prompt);
          return { hubId: "acme", id: "reply-2" };
        })}
        owner={workflow}
        openRoutine={(hubId, id, step) => opened.push(`${hubId}/${id}/${step}`)}
      />,
    );
    await press(button(page, "Add trigger"));
    expect(page.querySelector("textarea")).toBeNull();
    expect(made).toEqual([undefined]);
    expect(opened).toEqual(["acme/reply-2/trigger"]);
  });

  it("asks an agent's prompt first, and makes the routine only with one", async () => {
    const opened: string[] = [];
    const made: (string | undefined)[] = [];
    const page = await show(
      <TriggersView
        host={hostWith([], async (_owner, prompt) => {
          made.push(prompt);
          return { hubId: "acme", id: "writer-2" };
        })}
        owner={agent}
        openRoutine={(hubId, id, step) => opened.push(`${hubId}/${id}/${step}`)}
      />,
    );
    await press(button(page, "Add trigger"));
    const field = page.querySelector("textarea");
    expect(field?.value).toBe("");
    expect(field?.placeholder).toBe("Describe what to do.");
    expect(document.activeElement).toBe(field);
    expect(page.textContent).toContain("Say what Writer should do.");
    expect(made).toEqual([]);

    await press(button(page, "Add trigger"));
    expect(made).toEqual([]);
    expect(field?.getAttribute("aria-invalid")).toBe("true");

    if (field) await type(field, "Draft the newsletter");
    await press(button(page, "Add trigger"));
    expect(made).toEqual(["Draft the newsletter"]);
    expect(opened).toEqual(["acme/writer-2/trigger"]);
    expect(page.querySelector("textarea")).toBeNull();
  });

  it("hides an agent's prompt on Cancel, and makes nothing", async () => {
    const made: (string | undefined)[] = [];
    const page = await show(
      <TriggersView
        host={hostWith([], async (_owner, prompt) => {
          made.push(prompt);
          return { hubId: "acme", id: "writer-2" };
        })}
        owner={agent}
      />,
    );
    await press(button(page, "Add trigger"));
    await press(button(page, "Cancel"));
    expect(page.querySelector("textarea")).toBeNull();
    expect(button(page, "Cancel")).toBeUndefined();
    expect(made).toEqual([]);
  });

  it("puts focus back on Add trigger after Cancel", async () => {
    const page = await show(<TriggersView host={hostWith([])} owner={agent} />);
    await press(button(page, "Add trigger"));
    await press(button(page, "Cancel"));
    expect(document.activeElement).toBe(button(page, "Add trigger"));
  });

  it("says why when the host can't, and keeps the rows", async () => {
    const page = await show(
      <TriggersView
        host={hostWith([row("daily", "Daily")], async () => {
          throw new Error("The disk is full.");
        })}
        owner={workflow}
      />,
    );
    await press(button(page, "Add trigger"));
    expect(page.querySelector("[role=alert]")?.textContent).toContain("Couldn't add a trigger.");
    expect(page.querySelectorAll("li")).toHaveLength(1);
  });
});
