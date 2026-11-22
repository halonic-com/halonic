// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { SECTION_ADD_STEP, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type {
  RoutineRef,
  RoutinesHost,
  TriggerOwner,
  TriggerRow,
  WorkflowWithAgent,
} from "../api.ts";
import { show, unmount } from "../test-support.tsx";
import { TriggersSection, TriggersView } from "./triggers-section.tsx";

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
  workflows: readonly WorkflowWithAgent[] = [],
) {
  return {
    startingRoutines: async () => rows,
    ownerName: async () => "Writer",
    addTrigger,
    workflowsWithAgent: async () => workflows,
    subscribe: () => () => {},
  } as unknown as RoutinesHost;
}

const press = (element: Element | undefined) =>
  act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

const button = (page: HTMLElement, label: string) =>
  [...page.querySelectorAll("button")].find((one) => one.textContent === label);

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
  it("says what a workflow does with no routine, and leaves it to the line under it on an agent", async () => {
    const page = await show(<TriggersView host={hostWith([])} owner={workflow} />);
    expect(page.textContent).toContain(
      "Nothing starts this workflow on its own yet; it runs when called or with Run.",
    );
    expect(page.textContent).toContain("Add trigger");
    unmount();
    const onAgent = await show(<TriggersView host={hostWith([])} owner={agent} />);
    expect(onAgent.textContent).not.toContain("Nothing starts this agent");
    expect(onAgent.textContent?.match(/on its own yet/g)).toHaveLength(1);
  });
});

verifies("routines.triggers.add-trigger-creates-routine", () => {
  it("opens the routine the host made for a workflow, with no prompt", async () => {
    const opened: string[] = [];
    const made: string[] = [];
    const page = await show(
      <TriggersView
        host={hostWith([], async (owner, prompt) => {
          made.push(`${owner.kind}/${owner.id}/${prompt}`);
          return { hubId: "acme", id: "reply-2" };
        })}
        owner={workflow}
        openRoutine={(hubId, id, step) => opened.push(`${hubId}/${id}/${step}`)}
      />,
    );
    await press(button(page, "Add trigger"));
    expect(page.querySelector("textarea")).toBeNull();
    expect(made).toEqual(["workflow/reply/undefined"]);
    expect(opened).toEqual(["acme/reply-2/trigger"]);
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

verifies("routines.triggers.agent-cant-run-note", () => {
  const why = "Halonic can't run an agent on its own yet, only as a step in a workflow.";
  const paragraph = (page: HTMLElement, text: string) =>
    [...page.querySelectorAll("p")].find((one) => one.textContent === text);
  const workflows = [
    { id: "briefing", name: "Briefing" },
    { id: "digest", name: "Digest" },
  ];

  it("offers no Add trigger or Prompt on an agent", async () => {
    const page = await show(
      <TriggersView host={hostWith([], undefined, workflows)} owner={agent} />,
    );
    expect(button(page, "Add trigger")).toBeUndefined();
    expect(page.querySelector("textarea")).toBeNull();
  });

  it("leads to an Add trigger for each workflow the agent is a step in", async () => {
    const opened: string[] = [];
    const made: string[] = [];
    const page = await show(
      <TriggersView
        host={hostWith(
          [],
          async (owner, prompt) => {
            made.push(`${owner.kind}/${owner.id}/${prompt}`);
            return { hubId: "acme", id: "digest-2" };
          },
          workflows,
        )}
        owner={agent}
        openRoutine={(hubId, id, step) => opened.push(`${hubId}/${id}/${step}`)}
      />,
    );
    expect(paragraph(page, `${why} Add a trigger to a workflow it's a step in:`)).toBeDefined();
    const offered = [...page.querySelectorAll("li button")].map((one) => one.textContent);
    expect(offered).toEqual(["Add trigger to Briefing", "Add trigger to Digest"]);
    await press(button(page, "Add trigger to Digest"));
    expect(made).toEqual(["workflow/digest/undefined"]);
    expect(opened).toEqual(["acme/digest-2/trigger"]);
  });

  it("says to make a workflow with it, and offers New workflow, when it is a step in none", async () => {
    let asked = 0;
    const page = await show(
      <TriggersView
        host={hostWith([])}
        owner={agent}
        newWorkflow={() => {
          asked += 1;
        }}
      />,
    );
    expect(
      paragraph(
        page,
        `${why} Make a workflow with the agent as a step, then add a trigger to that workflow.`,
      ),
    ).toBeDefined();
    await press(button(page, "New workflow"));
    expect(asked).toBe(1);
  });

  it("keeps the routines that start the agent above the line", async () => {
    const page = await show(
      <TriggersView host={hostWith([row("daily", "Daily")], undefined, workflows)} owner={agent} />,
    );
    const firstRow = page.querySelector("li");
    const note = [...page.querySelectorAll("p")].find((one) => one.textContent?.startsWith(why));
    expect(firstRow?.textContent).toContain("Daily at 07:30");
    if (firstRow && note) {
      expect(
        firstRow.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("says nothing of it on a workflow", async () => {
    const page = await show(<TriggersView host={hostWith([])} owner={workflow} />);
    expect(page.textContent).not.toContain("can't run an agent");
    expect(button(page, "New workflow")).toBeUndefined();
  });
});

verifies("routines.triggers.add-trigger-from-page", () => {
  /** The section as the agent's Configuration draws it, asked for `step`. */
  const section = (host: RoutinesHost, owner: TriggerOwner, step?: string) => (
    <TriggersSection
      item={{ kind: owner.kind, hub: owner.hubId, id: owner.id }}
      context={{ services: { get: () => host } } as unknown as WorkspaceContext}
      {...(step !== undefined && { step })}
    />
  );

  it("shows an agent's way in to its workflows, and makes nothing, when asked to start adding", async () => {
    const made: (string | undefined)[] = [];
    const host = hostWith([], async (_owner, prompt) => {
      made.push(prompt);
      return { hubId: "acme", id: "writer-2" };
    });
    const page = await show(section(host, agent, SECTION_ADD_STEP));

    expect(page.querySelector("textarea")).toBeNull();
    expect(page.textContent).toContain("Halonic can't run an agent on its own yet");
    expect(made).toEqual([]);
  });

  it("makes a workflow's routine once when asked to start adding", async () => {
    const made: (string | undefined)[] = [];
    const host = hostWith([], async (_owner, prompt) => {
      made.push(prompt);
      return { hubId: "acme", id: "reply-2" };
    });
    await show(section(host, workflow, SECTION_ADD_STEP));

    expect(made).toEqual([undefined]);
  });

  it("shows the section as it is without the step, or with one it doesn't know", async () => {
    for (const step of [undefined, "rename"]) {
      const made: (string | undefined)[] = [];
      const host = hostWith([], async (_owner, prompt) => {
        made.push(prompt);
        return { hubId: "acme", id: "reply-2" };
      });
      const page = await show(section(host, workflow, step));
      expect(made).toEqual([]);
      expect(page.textContent).toContain("Add trigger");
      unmount();
    }
  });
});
