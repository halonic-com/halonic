// @vitest-environment jsdom
import { ClipboardProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StepperView } from "../stepper-view.ts";
import {
  browserRequest,
  projectPage,
  recordingActions,
  routineRequest,
  withOutcomes,
} from "../test-support/acme-requests.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ActionStepper } from "./action-stepper.tsx";

afterEach(unmountAll);

function show(view: StepperView) {
  const actions = recordingActions();
  const copied: string[] = [];
  const writeClipboard = vi.fn(async (text: string) => {
    copied.push(text);
    return true;
  });
  const root = render(
    <ClipboardProvider writeClipboard={writeClipboard}>
      <ActionStepper view={view} actions={actions} />
    </ClipboardProvider>,
  );
  return { root, actions, copied };
}

/** The steps' own items, not the lists inside them. */
function steps(root: HTMLElement): HTMLElement[] {
  const heading = [...root.querySelectorAll("h3")].find((h) => h.textContent === "Steps");
  const list = heading?.parentElement?.querySelector("ol");
  return [...(list?.children ?? [])] as HTMLElement[];
}

function button(root: ParentNode, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

verifies("action-steppers.browser", () => {
  describe("a browser step", () => {
    it("labels a requester's instructions as not checked and shows them as plain text", () => {
      const line = "Open [this](https://evil.example) and **click** Create";
      const { root } = show(browserRequest([line]));
      const [first] = steps(root);
      expect(first?.textContent).toContain(
        "Instructions from Chief on Paperclip · Acme, not checked by Halonic",
      );
      expect(first?.textContent).toContain(projectPage);
      const item = first?.querySelector("ol li");
      expect(item?.textContent).toBe(line);
      expect(item?.querySelector("a, strong")).toBeNull();
    });

    it("labels a library step with the date it was checked", () => {
      const { root } = show(browserRequest());
      expect(steps(root)[1]?.textContent).toContain("Checked on 20 Nov");
    });

    it("opens the page through the desktop app and copies the instructions with their label", async () => {
      const { root, actions, copied } = show(browserRequest(["Type acme-prod as the name"]));
      const [first] = steps(root);
      if (first === undefined) throw new Error("no step");
      await click(button(first, "Open the page"));
      expect(actions.calls).toEqual([`open ${projectPage}`]);
      const copy = button(first, "Copy instructions");
      // The words show, not only a screen reader's name (HAL-17491 8.4).
      expect(copy.textContent).toBe("Copy instructions");
      expect(copy.getAttribute("aria-label")).toBeNull();
      await click(copy);
      expect(copied).toEqual([
        `Instructions from Chief on Paperclip · Acme, not checked by Halonic\n${projectPage}\n1. Type acme-prod as the name`,
      ]);
      expect(first.querySelector('[role="status"]')?.textContent).toBe("Copied");
    });

    it("confirms the step with what was pasted back, in a plain field", async () => {
      const { root, actions } = show(browserRequest());
      const [first] = steps(root);
      if (first === undefined) throw new Error("no step");
      const field = first.querySelector("input");
      if (field === null) throw new Error("no result field");
      expect(field.type).toBe("text");
      // The field's name is the requester's, so its hint says so.
      const hint = document.getElementById(field.getAttribute("aria-describedby") ?? "");
      expect(hint?.textContent).toBe("From Chief on Paperclip · Acme, not checked by Halonic");
      await type(field, " acme-prod ");
      await click(button(first, "Step 1 is done"));
      expect(actions.calls).toEqual(["done 1 acme-prod"]);
    });

    it("has no Run step or Run all steps button of its own", () => {
      const { root } = show(browserRequest());
      const names = [...root.querySelectorAll("button")].map((b) => b.textContent ?? "");
      expect(names.some((name) => name.startsWith("Run"))).toBe(false);
    });
  });
});

verifies("action-steppers.by-hand", () => {
  describe("by hand", () => {
    it("shows the manual guide for the whole stepper", async () => {
      const { root } = show(routineRequest());
      const guide = [...root.querySelectorAll("summary")].find((s) =>
        s.textContent?.includes("Do it all by hand"),
      )?.parentElement;
      expect(guide?.textContent).toContain("Do step 3 on the run's page");
      expect(guide?.textContent).toContain("To check: The run's page shows the new state");
      if (guide === undefined || guide === null) throw new Error("no guide");
      await click(button(guide, "Open the page"));
    });

    it("opens a step's guide by itself when the step failed", () => {
      const view = withOutcomes(routineRequest(), [
        { kind: "failed", status: 503, message: "Service unavailable" },
      ]);
      const { root } = show(view);
      expect(steps(root)[0]?.querySelector("details")?.open).toBe(true);
      expect(steps(root)[1]?.querySelector("details")?.open).toBe(false);
    });

    it("says the service is down above the steps and opens only the whole guide", () => {
      const { root } = show(routineRequest({ serviceDown: true }));
      const outage = [...root.querySelectorAll("div")].find(
        (div) =>
          div.textContent ===
          "GitHub isn't answering right now, so the steps may fail. You can do them all by hand below.",
      );
      const stepsHeading = [...root.querySelectorAll("h3")].find((h) => h.textContent === "Steps");
      expect(outage?.compareDocumentPosition(stepsHeading as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      const open = [...root.querySelectorAll("details")].filter((details) => details.open);
      expect(open).toHaveLength(1);
      expect(open[0]?.querySelector("summary")?.textContent).toContain("Do it all by hand");
      expect(steps(root).map((step) => step.querySelector("details")?.open)).toEqual([
        false,
        false,
        false,
      ]);
    });

    it("says nothing about the service while it answers", () => {
      const { root } = show(routineRequest());
      expect(root.textContent).not.toContain("isn't answering");
    });

    it("runs a step's check when it is marked done by hand", async () => {
      const { root, actions } = show(routineRequest());
      await click(button(steps(root)[1] ?? root, "Mark done by hand"));
      expect(actions.calls).toEqual(["check 2"]);
    });

    it("records a step with no check as not checked", async () => {
      const { root, actions } = show(routineRequest());
      await click(button(steps(root)[2] ?? root, "Mark done by hand"));
      expect(actions.calls).toEqual(["by hand 3"]);
    });

    it("says what the check found, or that it wasn't checked", () => {
      const view = withOutcomes(routineRequest(), [
        { kind: "by-hand", checked: "GitHub shows the re-run, started 1 minute ago" },
        { kind: "pending" },
        { kind: "by-hand", checked: null },
      ]);
      const { root } = show(view);
      expect(steps(root)[0]?.textContent).toContain(
        "Checked: GitHub shows the re-run, started 1 minute ago",
      );
      expect(steps(root)[2]?.textContent).toContain("Done by hand, not checked");
      expect(steps(root)[2]?.querySelector("details")).toBeNull();
    });
  });
});
