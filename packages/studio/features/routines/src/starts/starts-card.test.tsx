// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type {
  RoutineChanges,
  RoutineLiveValues,
  RoutinesHost,
  RoutineTarget,
  RoutineTargetChoice,
  RoutineTargetState,
  RoutineView,
} from "../api.ts";
import { show, unmount } from "../test-support.tsx";
import { StartsCard } from "./starts-card.tsx";

afterEach(unmount);

const briefing: RoutineTarget = { kind: "workflow", hubId: "acme", id: "briefing", input: "{}" };
const choices: readonly RoutineTargetChoice[] = [
  { kind: "workflow", hubId: "acme", id: "briefing", name: "Briefing" },
  { kind: "agent", hubId: "acme", id: "helper", name: "Helper" },
];

const supportReply: Extract<RoutineTarget, { kind: "workflow" }> = {
  kind: "workflow",
  hubId: "acme",
  id: "support-reply",
  input: "{}",
};
const supportChoices: readonly RoutineTargetChoice[] = [
  {
    kind: "workflow",
    hubId: "acme",
    id: "support-reply",
    name: "Support reply",
    start: { label: "Answer a customer's email", field: "mail" },
  },
];

function supportReplyWith(input: string): RoutineView {
  return { ...routineStarting({ ...supportReply, input }), targetName: "Support reply" };
}

function routineStarting(
  target: RoutineTarget,
  targetState: RoutineTargetState = "ready",
  trigger: RoutineView["trigger"] = { kind: "manual" },
): RoutineView {
  return {
    hubId: "acme",
    id: "daily",
    name: "Daily",
    enabled: true,
    trigger,
    triggerSentence: "Manual only",
    summary: "Manual only → Briefing",
    targetName: "Briefing",
    target,
    targetState,
    overlap: "skip",
    catchUp: "last",
    file: "hubs/acme/workflows/routines/daily.routine.yaml",
    everLive: true,
    changesNotLive: false,
    problems: [],
  };
}

async function card(routine: RoutineView, targets = choices) {
  const saved: RoutineChanges[] = [];
  const host = {
    targets: async () => targets,
    save: async (_ref: unknown, changes: RoutineChanges) => {
      saved.push(changes);
    },
  } as unknown as RoutinesHost;
  const page = await show(<StartsCard host={host} routine={routine} />);
  return { page, saved };
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function typeInto(field: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      field,
      value,
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function leave(field: Element) {
  await act(async () => {
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

verifies("routines.starts.starts-card", () => {
  it("lists the hub's workflows and agents and shows the workflow's input", async () => {
    const { page } = await card(routineStarting({ ...briefing, input: '{"a":1}' }));
    const options = [...page.querySelectorAll("option")].map((option) => option.textContent);
    expect(options).toEqual(["Briefing (workflow)", "Helper (agent)"]);
    expect((page.querySelector("textarea") as HTMLTextAreaElement).value).toBe('{"a":1}');
  });

  it("waits for a prompt before it writes a picked agent", async () => {
    const { page, saved } = await card(routineStarting(briefing));
    await choose(
      page.querySelector("select") as HTMLSelectElement,
      JSON.stringify(["agent", "acme", "helper"]),
    );
    expect(saved).toHaveLength(0);
    const field = page.querySelector("textarea") as HTMLTextAreaElement;
    expect(field.value).toBe("");
    expect(field.placeholder).toBe("Describe what to do.");
    expect(page.textContent).toContain("Say what Helper should do.");
    await typeInto(field, "Sum up the inbox");
    expect(saved).toEqual([
      { target: { kind: "agent", hubId: "acme", id: "helper", prompt: "Sum up the inbox" } },
    ]);
  });

  it("says under the picker that an agent can't run on its own yet, and nothing for a workflow", async () => {
    const line =
      "Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow, then pick it under Starts.";
    const { page } = await card(routineStarting(briefing));
    expect(page.textContent).not.toContain(line);

    await choose(
      page.querySelector("select") as HTMLSelectElement,
      JSON.stringify(["agent", "acme", "helper"]),
    );
    expect(page.textContent).toContain(line);
    // The picker's hint, so a screen reader reads it with the picker.
    const select = page.querySelector("select") as HTMLSelectElement;
    const describedBy = select.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toContain(line);
  });

  it("writes nothing when the picked agent is left for the routine's own workflow", async () => {
    const { page, saved } = await card(routineStarting({ ...briefing, input: '{"a":1}' }));
    const select = page.querySelector("select") as HTMLSelectElement;
    await choose(select, JSON.stringify(["agent", "acme", "helper"]));
    await choose(select, JSON.stringify(["workflow", "acme", "briefing"]));
    expect(saved).toHaveLength(0);
    expect((page.querySelector("textarea") as HTMLTextAreaElement).value).toBe('{"a":1}');
  });

  it("writes an input that is JSON and nothing for text that isn't", async () => {
    const { page, saved } = await card(routineStarting(briefing));
    const field = page.querySelector("textarea") as HTMLTextAreaElement;
    await typeInto(field, '{"a":1}');
    expect(saved.at(-1)?.target).toEqual({ ...briefing, input: '{"a":1}' });
    const count = saved.length;
    await typeInto(field, '{"a":');
    await leave(field);
    expect(saved).toHaveLength(count);
    expect(page.textContent).toContain("The input has to be a JSON object, such as {}.");
    await typeInto(field, "[]");
    await leave(field);
    expect(saved).toHaveLength(count);
    expect(page.textContent).toContain("The input has to be a JSON object, such as {}.");
  });

  it("shows the field a workflow's start block asks for, with the JSON under Advanced", async () => {
    const { page, saved } = await card(supportReplyWith("{}"), supportChoices);
    expect(page.textContent).toContain("Answer a customer's email");
    expect(page.textContent).toContain(
      "Support reply needs this. Left empty, it starts with nothing to work on.",
    );
    expect((page.querySelector("details") as HTMLDetailsElement).open).toBe(false);
    await typeInto(page.querySelector("textarea") as HTMLTextAreaElement, "{{trigger.message}}");
    expect(saved.at(-1)?.target).toEqual({
      ...supportReply,
      input: '{"mail":"{{trigger.message}}"}',
    });
  });

  it("keeps what else the input holds, and opens Advanced to show it", async () => {
    const { page, saved } = await card(
      supportReplyWith('{"mail":"Hi","tone":"short"}'),
      supportChoices,
    );
    const field = page.querySelector("textarea") as HTMLTextAreaElement;
    expect(field.value).toBe("Hi");
    expect(page.textContent).not.toContain("needs this");
    expect((page.querySelector("details") as HTMLDetailsElement).open).toBe(true);
    await typeInto(field, "Hello");
    expect(saved.at(-1)?.target).toEqual({
      ...supportReply,
      input: '{"mail":"Hello","tone":"short"}',
    });
  });

  it("shows only the JSON while the start field holds something other than text", async () => {
    const { page } = await card(supportReplyWith('{"mail":{"from":"x"}}'), supportChoices);
    expect(page.textContent).not.toContain("Answer a customer's email");
    expect(page.querySelector("details")).toBeNull();
    expect((page.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      '{"mail":{"from":"x"}}',
    );
  });

  it("writes a prompt as it is typed and never an empty one", async () => {
    const agent: RoutineTarget = { kind: "agent", hubId: "acme", id: "helper", prompt: "Hi" };
    const { page, saved } = await card(routineStarting(agent));
    const field = page.querySelector("textarea") as HTMLTextAreaElement;
    await typeInto(field, "Sum up the inbox");
    expect(saved.at(-1)?.target).toEqual({ ...agent, prompt: "Sum up the inbox" });
    const count = saved.length;
    await typeInto(field, "");
    expect(saved).toHaveLength(count);
    expect(page.textContent).toContain("Say what Helper should do.");
  });

  it("names the placeholders for the trigger", async () => {
    const mail = routineStarting(briefing, "ready", {
      kind: "mail",
      connector: "acme-gmail",
      query: "in:inbox",
      every: "2m",
    });
    const { page } = await card(mail);
    expect(page.textContent).toContain(
      "You can use {{trigger.at}}, {{trigger.lastRun}} and {{trigger.message}}",
    );
  });

  it("offers a signal routine only the placeholders the engine fills", async () => {
    const signal = routineStarting(briefing, "ready", { kind: "signal", name: "paid" });
    const { page } = await card(signal);
    expect(page.textContent).toContain("You can use {{trigger.at}} and {{trigger.lastRun}}");
    expect(page.textContent).not.toContain("trigger.signal");
  });

  it("says why a target can't be started", async () => {
    const ghost = { ...briefing, id: "ghost" };
    expect((await card(routineStarting(ghost, "not-found"))).page.textContent).toContain(
      "not found",
    );
    unmount();
    expect((await card(routineStarting(briefing, "never-live"))).page.textContent).toContain(
      "Briefing isn't live yet, so this routine can't start it.",
    );
    unmount();
    expect((await card(routineStarting(briefing, "in-trash"))).page.textContent).toContain(
      "Briefing was deleted, so this routine won't start it.",
    );
  });

  it("says which target still starts while the saved one isn't live", async () => {
    const live: RoutineLiveValues = {
      triggerSentence: "Weekdays at 07:30",
      targetName: "Briefing",
      overlap: "skip",
      catchUp: "last",
    };
    const changed = {
      ...routineStarting({ kind: "agent", hubId: "acme", id: "helper", prompt: "Go." }),
      targetName: "Helper",
      live,
    };
    const { page } = await card(changed);
    expect(page.textContent).toContain(
      "Your new choice isn't live yet. Until it is, the routine starts Briefing.",
    );
    unmount();
    const same = await card({ ...routineStarting(briefing), live });
    expect(same.page.textContent).not.toContain("isn't live yet");
  });
});
