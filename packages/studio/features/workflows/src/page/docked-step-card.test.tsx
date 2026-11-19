// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import {
  createToastStore,
  FieldAnnounceProvider,
  PresentationProvider,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { SAVE_PAUSE_MS } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowStepChange, WorkflowsHost, WorkflowView } from "../api.ts";
import { memoryHost, memoryRuns, show, typeInto, unmount } from "../test-support.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

/** Support reply with a prompt and an output on `write`. */
const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "start",
  steps: [
    { id: "start", type: "task" },
    {
      id: "write",
      type: "task",
      agent: "writer",
      prompt: "Answer {{input.message}}",
      output: "answer",
      description: "Writes the answer",
    },
    { id: "done", type: "final" },
  ],
  arrows: [
    { from: "start", to: "write" },
    { from: "write", to: "done" },
  ],
  layout: {},
  agents: [
    { id: "writer", name: "Reply writer" },
    { id: "sorter", name: "Sorter" },
  ],
};

type ChangeStep = NonNullable<WorkflowsHost["changeStep"]>;

async function showPage(
  /** `null` for a host that can't change steps. */
  changeStep: ChangeStep | null = vi.fn<ChangeStep>(async () => {}),
  {
    phone = false,
    toolbar = false,
    announced,
  }: { phone?: boolean; toolbar?: boolean; announced?: string[] } = {},
) {
  const { host } = memoryHost([], [], [reply], [], {
    ...(changeStep === null ? {} : { changeStep }),
    // A host that can add steps gives the canvas its toolbar.
    ...(toolbar ? { addStep: async () => "step", resetLayout: async () => {} } : {}),
  });
  const toasts = createToastStore();
  const setFieldsNotSaved = vi.fn();
  const screen = (
    <ToastStoreProvider store={toasts}>
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        saving={{ setFieldsNotSaved }}
      />
    </ToastStoreProvider>
  );
  const announcing = (
    <FieldAnnounceProvider announce={(text) => announced?.push(text)}>
      {screen}
    </FieldAnnounceProvider>
  );
  const page = await show(
    phone ? (
      <PresentationProvider presentation="phone">{announcing}</PresentationProvider>
    ) : (
      announcing
    ),
  );
  return { page, toasts, setFieldsNotSaved };
}

/** The step's card on the canvas. */
const canvasCard = (page: HTMLElement, stepId: string) =>
  [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
    (card) => card.querySelector("[title]")?.textContent === stepId,
  ) as HTMLButtonElement;

const docked = (page: HTMLElement) => page.querySelector<HTMLElement>("aside");

/** A field of the docked card, by its label. */
function field(page: HTMLElement, label: string) {
  const labelElement = [...page.querySelectorAll("aside label")].find(
    (one) => one.textContent?.trim() === label,
  );
  const id = labelElement?.getAttribute("for");
  return (id === null || id === undefined ? undefined : document.getElementById(id)) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | undefined;
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function pick(page: HTMLElement, stepId: string) {
  await act(async () => canvasCard(page, stepId).click());
}

async function typeAndLeave(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
  await act(async () => element.focus());
  await act(async () => {
    const proto = Object.getPrototypeOf(element) as object;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => element.blur());
}

verifies("workflows.page.step-card", () => {
  it("opens the picked step's card, titled and focused, with the breadcrumb", async () => {
    const { page } = await showPage();
    await pick(page, "write");

    const card = docked(page);
    expect(card?.querySelector("h2")?.textContent).toBe("Step write");
    expect(document.activeElement).toBe(card?.querySelector("h2"));
    expect(card?.textContent).toContain("Support reply › write");
    expect(field(page, "Prompt")?.value).toBe("Answer {{input.message}}");
    expect(field(page, "Save output as")?.value).toBe("answer");
    expect(field(page, "Description")?.value).toBe("Writes the answer");
    expect(card?.textContent).toContain("Later steps can pick this as step answer.");
  });

  it("shows only the fields a step's kind has, and the empty prompt's hint", async () => {
    const { page } = await showPage();
    await pick(page, "done");
    expect(field(page, "Prompt")).toBeUndefined();
    expect(field(page, "Save output as")).toBeUndefined();
    expect(field(page, "Description")).toBeDefined();

    await pick(page, "start");
    expect(docked(page)?.querySelector("h2")?.textContent).toBe("Step start");
    expect(docked(page)?.textContent).toContain("The agent gets the run input.");
  });

  it("shows the step's Type and Agent, with the hub's agents and the no-agent line", async () => {
    const { page } = await showPage();
    await pick(page, "write");
    const agent = field(page, "Agent") as HTMLSelectElement;
    expect(field(page, "Type")?.value).toBe("task");
    expect(agent.value).toBe("writer");
    expect([...agent.options].map((option) => option.text)).toEqual([
      "No agent",
      "Reply writer",
      "Sorter",
    ]);

    await pick(page, "start");
    expect(field(page, "Agent")?.value).toBe("");
    expect(docked(page)?.textContent).toContain("No agent: this step passes the data straight on.");

    await pick(page, "done");
    expect(field(page, "Type")?.value).toBe("final");
    expect(field(page, "Agent")).toBeUndefined();
  });

  it("saves a pick at once, and shows the fields of the kind picked", async () => {
    const changeStep = vi.fn<ChangeStep>(async () => {});
    const { page } = await showPage(changeStep);
    await pick(page, "write");

    await choose(field(page, "Agent") as HTMLSelectElement, "sorter");
    expect(changeStep).toHaveBeenLastCalledWith(expect.anything(), "write", { agent: "sorter" });

    await choose(field(page, "Type") as HTMLSelectElement, "wait");
    expect(changeStep).toHaveBeenLastCalledWith(expect.anything(), "write", { type: "wait" });
    expect(changeStep).toHaveBeenCalledTimes(2);
    expect(field(page, "Agent")).toBeUndefined();
    expect(field(page, "Prompt")).toBeUndefined();
    expect(field(page, "Description")).toBeDefined();
  });

  it("saves a field when it is left, as one change of the step", async () => {
    const changeStep = vi.fn<ChangeStep>(async () => {});
    const { page } = await showPage(changeStep);
    await pick(page, "write");

    await typeAndLeave(field(page, "Prompt") as HTMLTextAreaElement, "Answer kindly");

    expect(changeStep).toHaveBeenCalledTimes(1);
    expect(changeStep).toHaveBeenCalledWith(
      expect.objectContaining({ hubId: "acme", id: "reply" }),
      "write",
      { prompt: "Answer kindly" } satisfies WorkflowStepChange,
    );
  });

  it("saves after a pause in typing too", async () => {
    const changeStep = vi.fn<ChangeStep>(async () => {});
    const { page } = await showPage(changeStep);
    await pick(page, "write");

    await typeInto(field(page, "Save output as") as HTMLInputElement, "reply");
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));

    expect(changeStep).toHaveBeenCalledWith(expect.anything(), "write", { output: "reply" });
  });

  it("doesn't save a key, says so and counts the field as not saved", async () => {
    const changeStep = vi.fn<ChangeStep>(async () => {});
    const { page, setFieldsNotSaved } = await showPage(changeStep);
    await pick(page, "write");

    await typeAndLeave(
      field(page, "Description") as HTMLTextAreaElement,
      `use sk-${"a1B2".repeat(6)}`,
    );

    expect(changeStep).not.toHaveBeenCalled();
    expect(docked(page)?.textContent).toContain(
      "This looks like a key. Keep it as a secret instead?",
    );
    expect(setFieldsNotSaved).toHaveBeenLastCalledWith(
      { key: "workflow/acme/reply/step", title: "Support reply" },
      1,
    );
  });

  it("reads out a key's message once when it shows after a pause, with focus still in the field", async () => {
    const changeStep = vi.fn<ChangeStep>(async () => {});
    const announced: string[] = [];
    const { page } = await showPage(changeStep, { announced });
    await pick(page, "write");

    const prompt = field(page, "Prompt") as HTMLTextAreaElement;
    await act(async () => prompt.focus());
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        prompt,
        `use sk-${"a1B2".repeat(6)}`,
      );
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
    await act(async () => vi.advanceTimersToNextFrame());

    expect(document.activeElement).toBe(prompt);
    expect(changeStep).not.toHaveBeenCalled();
    expect(announced).toEqual(["Prompt: This looks like a key. Keep it as a secret instead?"]);
  });

  it("says why on a toast when the host can't change the step", async () => {
    const { page, toasts } = await showPage(async () => {
      throw new KindedError("invalid_input", "This workflow's file couldn't be changed.");
    });
    await pick(page, "write");

    await typeAndLeave(field(page, "Prompt") as HTMLTextAreaElement, "Answer kindly");

    expect(toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't change step write",
      text: "This workflow's file couldn't be changed.",
    });
  });

  it("replaces the card when another step is picked", async () => {
    const { page } = await showPage();
    await pick(page, "write");
    await pick(page, "done");

    expect(page.querySelectorAll("aside")).toHaveLength(1);
    expect(docked(page)?.querySelector("h2")?.textContent).toBe("Step done");
  });

  it("closes on Esc and on ✕, and the step is no longer selected", async () => {
    const { page } = await showPage();
    await pick(page, "write");
    await act(async () => {
      docked(page)?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(docked(page)).toBeNull();
    expect(canvasCard(page, "write").getAttribute("aria-pressed")).toBe("false");

    await pick(page, "write");
    await act(async () =>
      docked(page)?.querySelector<HTMLButtonElement>("button[aria-label='Close step']")?.click(),
    );
    expect(docked(page)).toBeNull();
  });

  it("closes on a click on the canvas's background, not on a pan", async () => {
    const { page } = await showPage();
    await pick(page, "write");
    const canvas = page.querySelector<HTMLElement>("[role=group]") as HTMLElement;
    const pointer = (type: string, x: number) =>
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10 });

    await act(async () => {
      canvas.dispatchEvent(pointer("pointerdown", 10));
      canvas.dispatchEvent(pointer("pointermove", 60));
      canvas.dispatchEvent(pointer("pointerup", 60));
    });
    expect(docked(page)).not.toBeNull();

    await act(async () => {
      canvas.dispatchEvent(pointer("pointerdown", 10));
      canvas.dispatchEvent(pointer("pointerup", 11));
    });
    expect(docked(page)).toBeNull();
  });

  it("stays open on a press on the toolbar or the zoom buttons' column, between their buttons", async () => {
    const { page } = await showPage(undefined, { toolbar: true });
    await pick(page, "write");
    const toolbar = page.querySelector("[role=group][aria-label='Flow tools']") as HTMLElement;
    const zoomColumn = page.querySelector("button[aria-label='Zoom in']")?.parentElement;
    const divider = toolbar.querySelector(":scope > [aria-hidden=true]");
    const pointer = (type: string) =>
      new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 10 });

    for (const target of [toolbar, divider, zoomColumn]) {
      await act(async () => {
        target?.dispatchEvent(pointer("pointerdown"));
        target?.dispatchEvent(pointer("pointerup"));
      });
      expect(docked(page)).not.toBeNull();
    }
  });

  it("opens no card where the host can't change steps, nor on a phone", async () => {
    const withoutHost = await showPage(null);
    await pick(withoutHost.page, "write");
    expect(docked(withoutHost.page)).toBeNull();
    unmount();

    const phone = await showPage(
      vi.fn<ChangeStep>(async () => {}),
      { phone: true },
    );
    await pick(phone.page, "write");
    expect(docked(phone.page)).toBeNull();
  });
});
