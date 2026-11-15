// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelsFiles } from "../api.ts";
import { PricesBudgetDialog, type PricesBudgetDialogProps } from "./step-dialog.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

const models = "version: 1\naliases:\n  fast:\n    provider: openai\n    model: gpt-mini\n";
const workspace = "version: 1\nid: acme\nname: Acme\n";

function setup(props: Partial<PricesBudgetDialogProps> = {}, workspaceText = workspace) {
  const changes: { file: string; label: string; text: string }[] = [];
  const closed: boolean[] = [];
  const files = {
    readModels: async () => models,
    readWorkspace: async () => workspaceText,
    changeModels: (label: string, text: string) => changes.push({ file: "models", label, text }),
    changeWorkspace: (label: string, text: string) =>
      changes.push({ file: "workspace", label, text }),
  } as unknown as ModelsFiles;
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  act(() =>
    root?.render(
      <PricesBudgetDialog
        files={files}
        providerName="OpenAI"
        kind="full"
        aliases={["fast", "smart"]}
        currency="EUR"
        providerIsLocal={false}
        onClose={(wrote) => closed.push(wrote)}
        {...props}
      />,
    ),
  );
  return { changes, closed };
}

const field = (label: string, index = 0) =>
  [...document.querySelectorAll<HTMLInputElement>("input")].filter((input) =>
    input.labels?.[0]?.textContent?.startsWith(label),
  )[index] as HTMLInputElement;

function type(input: HTMLInputElement, value: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith(name),
  ) as HTMLElement;

async function press(name: string) {
  await act(async () => button(name).click());
}

verifies("models.budget-step.ask-for-pay-per-use", () => {
  describe("PricesBudgetDialog", () => {
    it("starts on the first price with every field empty", () => {
      setup();

      expect(document.activeElement).toBe(field("Input", 0));
      expect([...document.querySelectorAll("input")].every((input) => input.value === "")).toBe(
        true,
      );
    });

    it("saves a price row and the budget, and the button names what it saves", async () => {
      const { changes, closed } = setup();
      expect(button("Save prices")).toBeDefined();

      type(field("Input", 0), "3");
      type(field("Output", 0), "15");
      type(field("Per month"), "50");
      await press("Save budget");

      expect(changes.map((change) => change.file)).toEqual(["models", "workspace"]);
      expect(changes[0]?.text).toContain("input: 3");
      expect(changes[1]?.text).toContain("monthly: 50");
      expect(closed).toEqual([true]);
    });

    it("shows every wrong field at once and writes nothing", async () => {
      const { changes, closed } = setup();

      type(field("Input", 0), "abc");
      type(field("Input", 1), "3");
      type(field("Per run"), "0");
      await press("Save budget");

      expect(document.body.textContent?.match(/Enter an amount/g)).toHaveLength(3);
      expect(changes).toEqual([]);
      expect(closed).toEqual([]);
    });

    it("closes without writing when every field is empty", async () => {
      const { changes, closed } = setup();

      await press("Save prices");

      expect(changes).toEqual([]);
      expect(closed).toEqual([false]);
    });

    it("closes with Decide later and writes nothing", async () => {
      const { changes, closed } = setup();

      await press("Decide later");

      expect(changes).toEqual([]);
      expect(closed).toEqual([false]);
    });

    it("warns about a price of 0 and about a changed currency", () => {
      setup();

      type(field("Input", 0), "0");
      type(field("Output", 0), "0");

      expect(document.body.textContent).toContain("A price of 0 means these calls look free");

      const currency = document.querySelector("select") as HTMLSelectElement;
      act(() => {
        currency.value = "USD";
        currency.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(document.body.textContent).toContain("Your prices are read as USD from now on.");
    });

    it("shows the narrowed step with the budget line, and Change opens the fields", async () => {
      setup({ kind: "narrowed", aliases: ["smart"], budget: { monthly: 50 } });

      expect(document.body.textContent).toContain("Budget: €50.00 per month");
      expect(document.body.textContent).not.toContain("Per month");

      await press("Change");

      expect(document.activeElement).toBe(field("Per run"));
    });

    it("keeps the budget when Change is pressed and nothing else is touched", async () => {
      const { changes } = setup(
        { kind: "narrowed", aliases: ["fast"], budget: { monthly: 50 } },
        `${workspace}budget:\n  monthly: 50\n`,
      );

      await press("Change");
      expect(field("Per month").value).toBe("50");
      type(field("Input", 0), "3");
      type(field("Output", 0), "15");
      await press("Save budget");

      expect(changes.map((change) => change.file)).toEqual(["models"]);
    });

    it("moves focus to the first wrong field after a failed save", async () => {
      setup();

      type(field("Input", 0), "abc");
      field("Per month").focus();
      await press("Save prices");

      expect(document.activeElement).toBe(field("Input", 0));
    });

    it("says so when no alias uses the provider", () => {
      setup({ aliases: [] });

      expect(document.body.textContent).toContain("No aliases use OpenAI yet.");
    });
  });
});
