// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { mondayMorning } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { Details } from "./details.tsx";

afterEach(unmountAll);

const rows = [{ label: "Started by", value: "You, with Run" }];

verifies("runs.run-view.details", () => {
  it("draws side-label rows, Ran on after them and the run's id last", () => {
    const root = render(
      <Details
        rows={rows}
        version={{ reads: "saved-files" }}
        logRead
        runId="run_mfx3k2a1_01jd8q"
        now={mondayMorning}
      />,
    );

    expect(root.querySelector("h2")?.textContent).toBe("Details");
    expect([...root.querySelectorAll("dt")].map((term) => term.textContent)).toEqual([
      "Started by",
      "Ran on",
    ]);
    expect(root.querySelectorAll("dd")[1]?.textContent).toBe("Ran the saved files.");
    expect(root.lastElementChild?.textContent).toBe("run_mfx3k2a1_01jd8q");
  });

  it("has no Ran on row until the log is read", () => {
    const root = render(
      <Details rows={rows} version={undefined} logRead={false} runId="run_a" now={mondayMorning} />,
    );
    expect(root.textContent).not.toContain("Ran on");
  });
});
