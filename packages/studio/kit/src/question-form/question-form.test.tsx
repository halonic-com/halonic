// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { answerLabels, type FormQuestion } from "./question-answers.ts";
import { QuestionForm } from "./question-form.tsx";

afterEach(unmountAll);

const questions: readonly FormQuestion[] = [
  {
    id: "repo",
    prompt: "Where does **ToolScript** live?",
    selection: "single",
    required: true,
    options: [
      { id: "separate", label: "Separate repo" },
      { id: "mono", label: "In the monorepo" },
    ],
  },
  {
    id: "look",
    prompt: "Which looks?",
    selection: "multiple",
    required: false,
    options: [
      { id: "dark", label: "Dark" },
      { id: "compact", label: "Compact" },
      { id: "wide", label: "Wide" },
    ],
  },
];

function labelled(root: HTMLElement, text: string): HTMLInputElement {
  const label = [...root.querySelectorAll("label")].find((each) => each.textContent === text);
  const input = label?.querySelector("input");
  if (input == null) throw new Error(`no option "${text}"`);
  return input;
}

function submit(root: HTMLElement): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((each) => each.textContent === "Submit");
  if (found === undefined) throw new Error("no Submit");
  return found;
}

verifies("kit.question-form", () => {
  describe("QuestionForm", () => {
    it("shows each prompt as a legend, radios for one pick and checkboxes for several", () => {
      const { container } = render(<QuestionForm questions={questions} onSubmit={vi.fn()} />);
      const legends = [...container.querySelectorAll("fieldset > legend")].map(
        (each) => each.textContent,
      );
      expect(legends).toEqual(["Where does ToolScript live?", "Which looks? (optional)"]);
      expect(labelled(container, "Separate repo").type).toBe("radio");
      expect(labelled(container, "Dark").type).toBe("checkbox");
      expect(container.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe(
        "Where does ToolScript live?",
      );
    });

    it("keeps Submit off until every required question has a pick, then sends every pick", async () => {
      const onSubmit = vi.fn();
      const { container } = render(<QuestionForm questions={questions} onSubmit={onSubmit} />);
      expect(submit(container).getAttribute("aria-disabled")).toBe("true");
      expect(container.textContent).toContain("Answer each question to submit.");

      await click(labelled(container, "Separate repo"));
      await click(labelled(container, "Compact"));
      await click(labelled(container, "Dark"));
      expect(submit(container).getAttribute("aria-disabled")).not.toBe("true");
      await click(submit(container));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith([
        { question: "repo", options: ["separate"] },
        { question: "look", options: ["dark", "compact"] },
      ]);
    });

    it("once answered, keeps the picks ticked, every control off, and says the day", async () => {
      const onSubmit = vi.fn();
      const { container } = render(
        <QuestionForm
          questions={questions}
          onSubmit={onSubmit}
          answered={{
            answers: [
              { question: "repo", options: ["separate"] },
              { question: "look", options: ["dark"] },
            ],
            at: new Date(2026, 10, 24, 18, 43),
          }}
        />,
      );
      expect(labelled(container, "Separate repo").checked).toBe(true);
      expect(labelled(container, "Separate repo").disabled).toBe(true);
      expect(labelled(container, "Dark").checked).toBe(true);
      expect(labelled(container, "Dark").getAttribute("aria-disabled")).toBe("true");
      expect(labelled(container, "Wide").checked).toBe(false);
      await click(labelled(container, "Wide"));
      expect(labelled(container, "Wide").checked).toBe(false);
      expect(container.querySelector("button")).toBeNull();
      expect(container.textContent).toContain("Answered 24 Nov");
    });

    it("leaves the answered line to the card when it names one of its own", () => {
      const { container } = render(
        <>
          <p id="card-line">Answered at 18:43: Separate repo, Dark.</p>
          <QuestionForm
            questions={questions}
            onSubmit={vi.fn()}
            answered={{
              answers: [
                { question: "repo", options: ["separate"] },
                { question: "look", options: ["dark"] },
              ],
              at: new Date(2026, 10, 24, 18, 43),
              reason: "card-line",
            }}
          />
        </>,
      );
      expect(container.textContent).not.toContain("Answered 24 Nov");
      expect(labelled(container, "Dark").getAttribute("aria-describedby")).toContain("card-line");
    });

    it("names each picked option by its label, and by its ID once the card no longer offers it", () => {
      expect(
        answerLabels(questions, [
          { question: "repo", options: ["separate"] },
          { question: "look", options: ["dark", "gone"] },
        ]),
      ).toEqual(["Separate repo", "Dark", "gone"]);
    });
  });
});
