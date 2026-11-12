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

function renderMore(
  shown: readonly ShownPlace[] = places,
  badge?: string,
  withSwitcher = true,
  withSettings = false,
) {
  const opened: SidebarPlace[] = [];
  let settingsOpens = 0;
  let workspacePicks = 0;
  const switcher = {
    workspace: acme,
    onChange: () => {
      workspacePicks += 1;
    },
  };
  const container = render(
    <MorePage
      switcher={withSwitcher ? switcher : undefined}
      places={shown}
      onSettings={
        withSettings
          ? () => {
              settingsOpens += 1;
            }
          : undefined
      }
      onOpen={(place) => opened.push(place)}
      badge={badge === undefined ? undefined : <button type="button">{badge}</button>}
    />,
  );
  const rows = [...container.querySelectorAll("tr")];
  const row = (title: string) => rows.find((tr) => tr.textContent?.includes(title)) as Element;
  return {
    container,
    rows,
    row,
    opened,
    workspacePicks: () => workspacePicks,
    settingsOpens: () => settingsOpens,
  };
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

  it("shows no switcher row until the app has a workspace picker", () => {
    const { container } = renderMore(places, undefined, false);

    expect(container.querySelector('button[aria-label^="Workspace:"]')).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("More");
    expect(container.textContent).toContain("Editing workflows is easier on a computer.");
  });
});

verifies("shell.settings-list-page", () => {
  it("ends the list with a Settings row when the window can open Settings, and passes its tap on", () => {
    const { rows, row, opened, settingsOpens } = renderMore(places, undefined, true, true);

    expect(rows.map((tr) => tr.querySelector("[role=gridcell]")?.textContent).at(-1)).toBe(
      "Settings",
    );
    expect(row("Settings").querySelector("svg")).not.toBeNull();
    act(() => {
      row("Settings")
        .querySelector("[role=gridcell]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(settingsOpens()).toBe(1);
    expect(opened).toEqual([]);
  });

  it("has no Settings row when the window can't open Settings", () => {
    const { rows } = renderMore();

    expect(rows.some((tr) => tr.textContent?.includes("Settings"))).toBe(false);
  });
});
