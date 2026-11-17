// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileIssue } from "../files-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ProblemsPanel } from "./problems-panel.tsx";

afterEach(unmountAll);

const none = { count: 0, firstFile: undefined };

function issue(severity: "error" | "warning", line: number, message: string): FileIssue {
  return { file: "hub.yaml", severity, message, line, col: 4 };
}

const three = [
  issue("warning", 1, "Unused key"),
  issue("error", 5, "Bad steps"),
  issue("error", 3, "Unknown model"),
];

function click(element: Element | null | undefined): void {
  act(() => {
    (element as HTMLElement).click();
  });
}

describe("problems list", () => {
  verifies("files.ui.problems-list", () => {
    it("lists errors first, with line and sentence, named for a screen reader", () => {
      const page = render(
        <ProblemsPanel problems={three} elsewhere={none} onGo={() => {}} onOpenFile={() => {}} />,
      );

      expect(page.textContent).toContain("Problems (3)");
      const rows = [...page.querySelectorAll("li button")];
      expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
        "Line 3, error: Unknown model.",
        "Line 5, error: Bad steps.",
        "Line 1, warning: Unused key.",
      ]);
      expect(rows[0]?.textContent).toBe("✕Line 3: Unknown model");
    });

    it("sends the chosen problem to its owner", () => {
      const onGo = vi.fn();
      const page = render(
        <ProblemsPanel problems={three} elsewhere={none} onGo={onGo} onOpenFile={() => {}} />,
      );

      click(page.querySelector("li button"));

      expect(onGo).toHaveBeenCalledWith(three[2]);
    });

    it("says there are no problems", () => {
      const page = render(
        <ProblemsPanel problems={[]} elsewhere={none} onGo={() => {}} onOpenFile={() => {}} />,
      );

      expect(page.textContent).toContain("Problems (0)");
      expect(page.textContent).toContain("No problems.");
    });

    it("says a read-only large file is too long to check, not that it has no problems", () => {
      const page = render(
        <ProblemsPanel
          problems={[]}
          tooLong
          elsewhere={none}
          onGo={() => {}}
          onOpenFile={() => {}}
        />,
      );

      expect(page.textContent).toContain("This file is too long to check.");
      expect(page.textContent).not.toContain("No problems.");
    });

    it("collapses to its header and keeps the count", () => {
      const page = render(
        <ProblemsPanel problems={three} elsewhere={none} onGo={() => {}} onOpenFile={() => {}} />,
      );
      const header = page.querySelector("section > button");
      expect(header?.getAttribute("aria-expanded")).toBe("true");

      click(header);

      expect(header?.getAttribute("aria-expanded")).toBe("false");
      expect(header?.textContent).toContain("Problems (3)");
      expect(page.querySelector("[hidden]")).not.toBeNull();

      click(header);
      expect(page.querySelector("[hidden]")).toBeNull();
    });

    it("says what changes here caused elsewhere, with the first file as a link", () => {
      const onOpenFile = vi.fn();
      const page = render(
        <ProblemsPanel
          problems={[]}
          elsewhere={{ count: 2, firstFile: "hubs/p/flow.workflow.yaml" }}
          onGo={() => {}}
          onOpenFile={onOpenFile}
        />,
      );

      expect(page.textContent).toContain("Your edits here cause 2 problems in other files.");
      click(page.querySelector("p button"));
      expect(onOpenFile).toHaveBeenCalledWith("hubs/p/flow.workflow.yaml");
    });

    it("says it in the singular for one problem", () => {
      const page = render(
        <ProblemsPanel
          problems={[]}
          elsewhere={{ count: 1, firstFile: "b.yaml" }}
          onGo={() => {}}
          onOpenFile={() => {}}
        />,
      );

      expect(page.textContent).toContain("Your edits here cause 1 problem in another file.");
    });

    it("opens the list and focuses the row of a line a gutter icon named", async () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      let reveal: (line: number) => void = () => {};
      function Harness() {
        const [shown, setShown] = useState<{ line: number; round: number } | undefined>();
        reveal = (line) => setShown({ line, round: 1 });
        return (
          <ProblemsPanel
            problems={three}
            elsewhere={none}
            reveal={shown}
            onGo={() => {}}
            onOpenFile={() => {}}
          />
        );
      }
      const page = render(<Harness />);
      click(page.querySelector("section > button"));
      expect(page.querySelector("[hidden]")).not.toBeNull();

      act(() => reveal(5));
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      vi.useRealTimers();

      expect(page.querySelector("[hidden]")).toBeNull();
      expect(document.activeElement?.getAttribute("data-line")).toBe("5");
    });
  });
});
