// @vitest-environment jsdom
import type { RunVersion } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunVersionLine } from "./run-version-line.tsx";
import { versionLine } from "./version-line.ts";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Wed 11 Nov 2026.
const now = new Date(2026, 10, 11, 15, 5);

function liveVersion(madeAt: Date): RunVersion {
  return {
    reads: "live-version",
    commit: "3f2a1c9e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39",
    versionDate: madeAt.toISOString(),
  };
}

verifies("runs.run-view.live-or-saved", () => {
  it("r1: a run on today's live version gives the time alone, with the commit in the tooltip", () => {
    const container = render(
      <RunVersionLine version={liveVersion(new Date(2026, 10, 11, 10, 42))} now={now} />,
    );

    expect(container.querySelector("p")?.textContent).toBe("Ran the live version from 10:42.");
    const tooltip = container.querySelector("[role='tooltip']");
    expect(tooltip?.textContent).toBe("Commit 3f2a1c9");
    // The commit describes the line, so a screen reader can hear it too.
    expect(container.querySelector(`[aria-describedby='${tooltip?.id}']`)?.textContent).toBe(
      "Ran the live version from 10:42.",
    );
  });

  it("r3: a version made on an earlier day gives the day and the time", () => {
    const line = versionLine(liveVersion(new Date(2026, 10, 10, 10, 42)), now);
    expect(line.text).toBe("Ran the live version from 10 Nov, 10:42.");
  });

  it("says when the version was made, never when the run started", () => {
    // The run starts at 15:05 on the version of 09:07; the line never says "changed since".
    const line = versionLine(liveVersion(new Date(2026, 10, 11, 9, 7)), now);
    expect(line.text).toBe("Ran the live version from 09:07.");
    expect(line.text).not.toContain("changed");
  });

  it("r2: a test run on the saved files shows no commit", () => {
    const container = render(<RunVersionLine version={{ reads: "saved-files" }} now={now} />);

    expect(container.textContent).toBe("Ran the saved files.");
    expect(container.querySelector("[role='tooltip']")).toBeNull();
  });

  it("r4: an old run reads as not recorded, plain secondary text with no icon", () => {
    const container = render(<RunVersionLine version={undefined} now={now} />);

    const line = container.querySelector("p");
    expect(line?.textContent).toBe("Version not recorded.");
    expect(line?.className).toBe("text-small text-fg-muted");
    expect(container.querySelector("svg, [role='tooltip']")).toBeNull();
  });
});
