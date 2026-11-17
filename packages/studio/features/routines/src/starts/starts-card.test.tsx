// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type {
  RoutineChanges,
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

async function card(routine: RoutineView) {
  const saved: RoutineChanges[] = [];
  const host = {
    targets: async () => choices,
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

  it("writes an agent with the starter prompt when one is picked", async () => {
    const { page, saved } = await card(routineStarting(briefing));
    await choose(
      page.querySelector("select") as HTMLSelectElement,
      JSON.stringify(["agent", "acme", "helper"]),
    );
    expect(saved[0]?.target).toEqual({
      kind: "agent",
      hubId: "acme",
      id: "helper",
      prompt: "Describe what to do.",
    });
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

  it("writes a prompt as it is typed and never an empty one", async () => {
    const agent: RoutineTarget = { kind: "agent", hubId: "acme", id: "helper", prompt: "Hi" };
    const { page, saved } = await card(routineStarting(agent));
    const field = page.querySelector("textarea") as HTMLTextAreaElement;
    await typeInto(field, "Sum up the inbox");
    expect(saved.at(-1)?.target).toEqual({ ...agent, prompt: "Sum up the inbox" });
    const count = saved.length;
    await typeInto(field, "");
    expect(saved).toHaveLength(count);
    expect(page.textContent).toContain("Give the agent something to do.");
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
      "Briefing is in the trash, so this routine won't start it.",
    );
  });
});
