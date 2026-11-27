// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { answerLabels, type FormQuestion } from "./question-answers.ts";
import { QuestionForm } from "./question-form.tsx";

afterEach(unmountAll);

const repo: FormQuestion = {
  id: "repo",
  prompt: "Where does the code live?",
  selection: "single",
  required: true,
  allowOther: true,
  options: [{ id: "mono", label: "In the monorepo" }],
};

const phase: FormQuestion = {
  id: "phase",
  prompt: "What goes into phase 2?",
  selection: "multiple",
  required: false,
  allowOther: true,
  options: [
    { id: "docs", label: "Docs" },
    { id: "tests", label: "Tests, namely…", freeText: true },
  ],
};

function labelled(root: HTMLElement, text: string): HTMLInputElement {
  const label = [...root.querySelectorAll("label")].find((each) => each.textContent === text);
  const input = label?.querySelector("input");
  if (input == null) throw new Error(`no choice "${text}"`);
  return input;
}

function submit(root: HTMLElement): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((each) => each.textContent === "Submit");
  if (found === undefined) throw new Error("no Submit");
  return found;
}

function answerField(root: HTMLElement): HTMLTextAreaElement | null {
  const label = [...root.querySelectorAll("label")].find(
    (each) => each.textContent === "Your answer",
  );
  const id = label?.getAttribute("for");
  return id == null ? null : root.querySelector<HTMLTextAreaElement>(`textarea[id="${id}"]`);
}

async function type(field: HTMLTextAreaElement | null, text: string) {
  if (field === null) throw new Error("no Your answer field");
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setValue?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

verifies("kit.question-form-written", () => {
  it("adds Other to a question that allows it, and sends what is written for it", async () => {
    const onSubmit = vi.fn();
    const { container } = render(<QuestionForm questions={[repo]} onSubmit={onSubmit} />);
    expect(answerField(container)).toBeNull();

    await click(labelled(container, "Other"));
    expect(submit(container).getAttribute("aria-disabled")).toBe("true");
    await type(answerField(container), "  ");
    expect(submit(container).getAttribute("aria-disabled")).toBe("true");
    await type(answerField(container), "A fork of the app");
    await click(submit(container));

    expect(onSubmit).toHaveBeenCalledWith([
      { question: "repo", options: [], text: "A fork of the app" },
    ]);
  });

  it("shows the field for a free-text option, and keeps one written choice per question", async () => {
    const onSubmit = vi.fn();
    const { container } = render(<QuestionForm questions={[repo, phase]} onSubmit={onSubmit} />);
    await click(labelled(container, "In the monorepo"));
    await click(labelled(container, "Docs"));
    // Both questions offer Other; phase's is its last checkbox.
    const phaseOther = [...container.querySelectorAll('input[type="checkbox"]')].at(-1);
    if (!(phaseOther instanceof HTMLInputElement)) throw new Error("no phase Other");
    await click(phaseOther);
    expect(phaseOther.checked).toBe(true);

    await click(labelled(container, "Tests, namely…"));
    expect(phaseOther.checked).toBe(false);
    await type(answerField(container), "Load tests");
    await click(submit(container));

    expect(onSubmit).toHaveBeenCalledWith([
      { question: "repo", options: ["mono"] },
      { question: "phase", options: ["docs", "tests"], text: "Load tests" },
    ]);
  });

  it("once answered, shows the Other answer's text in a field that is off", () => {
    const answered = {
      answers: [{ question: "repo", options: [], text: "A fork of the app" }],
      at: new Date("2026-11-24T10:00:00Z"),
    };
    const { container } = render(
      <QuestionForm questions={[repo]} answered={answered} onSubmit={vi.fn()} />,
    );
    expect(labelled(container, "Other").checked).toBe(true);
    expect(answerField(container)?.value).toBe("A fork of the app");
    expect(answerField(container)?.disabled).toBe(true);
    expect(answerLabels([repo], answered.answers)).toEqual(["A fork of the app"]);
  });
});
