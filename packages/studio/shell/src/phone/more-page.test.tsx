// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { type ShownPlace, type SidebarPlace, showPlace } from "../points/frame.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { MorePage } from "./more-page.tsx";

afterEach(() => {
  unmountAll();
});

const acme = { name: "Acme", folder: "~/Work/acme" };

const places = [
  showPlace("home", undefined),
  showPlace("inbox", { mark: "count", value: 3, spoken: "3 waiting" }),
  showPlace("agents", undefined),
  showPlace("workflows", undefined),
  showPlace("runs", { mark: "running", value: 1, spoken: "1 running" }),
  showPlace("changes", { mark: "count", value: 4, spoken: "4 to review" }),
];

function renderMore(shown: readonly ShownPlace[] = places, badge?: string) {
  const opened: SidebarPlace[] = [];
  let workspacePicks = 0;
  const container = render(
    <MorePage
      workspace={acme}
      onChangeWorkspace={() => {
        workspacePicks += 1;
      }}
      places={shown}
      onOpen={(place) => opened.push(place)}
      badge={badge === undefined ? undefined : <button type="button">{badge}</button>}
    />,
  );
  const rows = [...container.querySelectorAll("tr")];
  const row = (title: string) => rows.find((tr) => tr.textContent?.includes(title)) as Element;
  return { container, rows, row, opened, workspacePicks: () => workspacePicks };
}

function tap(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

verifies("shell.more-page", () => {
  it("starts with the switcher row, named for the workspace, and passes its tap on", () => {
    const { container, workspacePicks } = renderMore();
    const switcher = container.querySelector("button") as HTMLButtonElement;

    expect(switcher.getAttribute("aria-label")).toBe("Workspace: Acme. Change workspace");
    expect(switcher.textContent).toContain("Acme");
    expect(switcher.textContent).toContain("~/Work/acme");
    tap(switcher);
    expect(workspacePicks()).toBe(1);
  });

  it("lists only the places under More that were added, in the sidebar's order", () => {
    const { rows, container } = renderMore();

    expect(rows.map((tr) => tr.querySelector("[role=gridcell]")?.textContent)).toEqual([
      "Agents",
      "Workflows",
      expect.stringContaining("Changes"),
    ]);
    expect(container.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("More");
  });

  it("shows a place's count in place of the chevron", () => {
    const { row } = renderMore();

    expect(row("Changes").textContent).toContain("4");
    expect(row("Changes").querySelector("svg path[d^='M6 3.5']")).toBeNull();
    expect(row("Agents").querySelector("svg path[d^='M6 3.5']")).not.toBeNull();
  });

  it("passes a tapped place on", () => {
    const { row, opened } = renderMore();

    tap(row("Workflows").querySelector("[role=gridcell]") as Element);
    expect(opened).toEqual(["workflows"]);
  });

  it("shows a header badge on its own line, outside the switcher's button", () => {
    const { container } = renderMore(places, "Sample · test model");
    const [switcher, badge] = [...container.querySelectorAll("button")];

    expect(badge?.textContent).toBe("Sample · test model");
    expect(switcher?.contains(badge as Node)).toBe(false);
  });

  it("with only Home added, shows the switcher and the footer line, with no list", () => {
    const { container } = renderMore([showPlace("home", undefined)]);

    expect(container.querySelector('[role="grid"]')).toBeNull();
    expect(container.textContent).toContain("Editing workflows is easier on a computer.");
    expect(container.querySelector("h1")?.textContent).toBe("More");
  });
});
