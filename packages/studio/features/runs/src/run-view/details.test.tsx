// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { mondayMorning } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { Details, DetailsRow } from "./details.tsx";

afterEach(unmountAll);

const rows = [{ label: "Started by", value: "You, with Run" }];

verifies("runs.run-view.details", () => {
  it("draws side-label rows, Ran on after them and the run's id last", () => {
    const root = render(
      <Details
        rows={rows}
        version={{ reads: "saved-files" }}
        logRead
        hasVersions
        runId="run_mfx3k2a1_01jd8q"
        now={mondayMorning}
      />,
    );

    expect(root.querySelector("h2")?.textContent).toBe("Details");
    expect([...root.querySelectorAll("dt")].map((term) => term.textContent)).toEqual([
      "Started by",
      "Ran on",
    ]);
    expect(root.querySelectorAll("dd")[1]?.textContent).toBe("The saved files.");
    expect(root.querySelector("section")?.lastElementChild?.textContent).toBe(
      "run_mfx3k2a1_01jd8q",
    );
  });

  it("has no Ran on row until the log is read", () => {
    const root = render(
      <Details
        rows={rows}
        version={undefined}
        logRead={false}
        hasVersions
        runId="run_a"
        now={mondayMorning}
      />,
    );
    expect(root.textContent).not.toContain("Ran on");
  });

  it("lets the keyboard reach a value's tooltip", () => {
    const root = render(
      <Details
        rows={[{ label: "Started by", value: "Morning brief", tooltip: "Weekdays at 08:00" }]}
        version={undefined}
        logRead={false}
        hasVersions
        runId="run_a"
        now={mondayMorning}
      />,
    );
    expect(root.querySelector("dd span[tabindex]")?.textContent).toBe("Morning brief");
  });

  it("draws the phone row's chevron in an icon-sized box, so the row stays one touch row", () => {
    const root = render(
      <DetailsRow
        rows={rows}
        version={undefined}
        logRead={false}
        runId="run_a"
        now={mondayMorning}
      />,
    );

    const button = root.querySelector("button");
    expect(button?.className).toContain("min-h-touch");
    const chevron = button?.querySelector("svg")?.parentElement;
    expect(chevron).not.toBe(button);
    expect(chevron?.className).toContain("size-icon-md");
    expect(chevron?.className).toContain("*:size-full");
    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
  });
});
