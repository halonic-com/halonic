// @vitest-environment jsdom
import type { RunEvent, SandboxOpenedView } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { stepSandboxes, timeLimitParts } from "./sandbox-model.ts";
import {
  SandboxOffPanel,
  SandboxPanel,
  sandboxLineText,
  sayText,
  timeLimitText,
} from "./sandbox-panel.tsx";
import { type SandboxKey, sandboxWords } from "./sandbox-words.ts";

afterEach(unmountAll);

const view: SandboxOpenedView = {
  strength: "os",
  workingFolder: "~/work/acme",
  readOnlyPaths: ["agents", "workflows", "skills", "docs", "notes"],
  deniedGroups: ["ssh-keys", "browser-data"],
  deniedPaths: ["~/finance"],
  allowedSites: ["registry.npmjs.org", "github.com"],
  timeLimitMs: 1_800_000,
};

function log(...events: Record<string, unknown>[]): RunEvent[] {
  const entered = { type: "state.entered", state: "draft" };
  return [entered, ...events].map(
    (event, index) =>
      ({ runId: "r", seq: index + 1, at: "2026-11-16T08:00:00Z", ...event }) as RunEvent,
  );
}

describe("sandbox words", () => {
  it("fills every placeholder of every key", () => {
    const values = {
      agent: "Writer",
      count: 3,
      step: "Draft",
      folder: "~/w",
      time: "1 hour",
      paths: "p",
    };
    for (const key of Object.keys(sandboxWords) as SandboxKey[]) {
      const text = sayText(key, values);
      expect(text.trim(), key).not.toBe("");
      expect(text, key).not.toMatch(/[{}]/);
    }
    expect(() => sayText("sandbox.panel.phone-fix")).toThrow("no value for {agent}");
  });

  it("never says safe, secure or protected", () => {
    for (const words of Object.values(sandboxWords)) {
      expect(words).not.toMatch(/\b(safe|secure|protected)\b/i);
    }
  });
});

verifies("runs.run-view.sandbox-panel", () => {
  it("builds the line from the event, in order, naming allowed sites by count", () => {
    expect(sandboxLineText({ ...view, allowedSites: [] })).toBe(
      "In a sandbox · writes only in its own folders · reaches only Halonic",
    );
    expect(sandboxLineText({ ...view, allowedSites: ["a.example"] })).toBe(
      "In a sandbox · writes only in its own folders · reaches Halonic and 1 site",
    );
    expect(sandboxLineText(view)).toContain("reaches Halonic and 2 sites");
    expect(sandboxLineText({ ...view, strength: "vm" })).toMatch(/^In a virtual machine/);
  });

  it("reads each step's sandbox from its own events: opened, off, unreadable, or nothing", () => {
    const events = log(
      { type: "sandbox.opened", state: "draft", agent: "writer", sandbox: view },
      { type: "sandbox.opened", state: "draft", agent: "writer", sandbox: "damaged" },
      { type: "sandbox.off", state: "draft", agent: "coder", chosenAt: "2026-11-10T08:00:00Z" },
    );
    expect(stepSandboxes(events, "step-0").map((item) => item.kind)).toEqual([
      "opened",
      "unreadable",
      "off",
    ]);
    expect(stepSandboxes(events, "step-0")[0]).toMatchObject({ agent: "Writer" });
    expect(stepSandboxes(log(), "step-0")).toEqual([]);
  });

  it("says a time limit in seconds, minutes, or hours and minutes", () => {
    expect(timeLimitText(45_000)).toBe("45 seconds");
    expect(timeLimitText(60_000)).toBe("1 minute");
    expect(timeLimitText(1_800_000)).toBe("30 minutes");
    expect(timeLimitText(7_200_000)).toBe("2 hours");
    expect(timeLimitText(5_400_000)).toBe("1 hour 30 minutes");
    expect(timeLimitParts(3_600_000)).toEqual([{ unit: "hours", count: 1 }]);
  });

  it("lists the rows in order as a description list, with group names and no group path", () => {
    const container = render(
      <SandboxPanel view={view} agent="Writer" live={false} place="desktop" />,
    );
    expect(container.querySelector("h3")?.textContent).toBe("What this step could do");
    const labels = [...container.querySelectorAll("dt")].map((el) => el.textContent);
    expect(labels).toEqual(["Writes in", "Can't change", "Can't open", "Reaches", "Time limit"]);
    const text = container.textContent ?? "";
    expect(text).toContain("~/work/acme");
    expect(text).toContain("and its own temp and settings folders");
    expect(text).toContain("Your SSH keys · Browser data");
    expect(text).toContain("Also: ~/finance");
    expect(text).not.toContain(".ssh");
    expect(text).toContain("Stops after 30 minutes");
    expect(text).toContain("A process sandbox on this computer, not a virtual machine.");
    expect(text).toContain("Not covered: if Writer changes a build script in ~/work/acme");
  });

  it("says can while the run is live", () => {
    const container = render(<SandboxPanel view={view} agent="Writer" live place="desktop" />);
    expect(container.querySelector("h3")?.textContent).toBe("What this step can do");
  });

  it("shows 3 read-only paths, then opens the rest in the same row", () => {
    const container = render(<SandboxPanel view={view} agent="Writer" live place="desktop" />);
    expect(container.querySelectorAll("dd ul li")).toHaveLength(3);
    const more = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("and 2 more"),
    );
    act(() => more?.click());
    expect(container.querySelectorAll("dd ul li")).toHaveLength(5);
  });

  it("leaves a row with nothing in it out, and shows at most 10 sites", () => {
    const sites = Array.from({ length: 12 }, (_, i) => `s${i}.example`);
    const container = render(
      <SandboxPanel
        view={{
          ...view,
          readOnlyPaths: [],
          deniedGroups: [],
          deniedPaths: [],
          allowedSites: sites,
        }}
        agent="Writer"
        live
        place="desktop"
      />,
    );
    const labels = [...container.querySelectorAll("dt")].map((el) => el.textContent);
    expect(labels).toEqual(["Writes in", "Reaches", "Time limit"]);
    expect(container.textContent).toContain("and 2 more");
    expect(container.textContent).not.toContain("s11.example");
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows only what the event holds: no environment value reaches the page", () => {
    const events = log({
      type: "sandbox.opened",
      state: "draft",
      agent: "writer",
      sandbox: { ...view, env: { TOKEN: "s3cret-value" }, extra: "unknown-field" },
    });
    const [item] = stepSandboxes(events, "step-0");
    if (item?.kind !== "opened") throw new Error("not opened");
    const container = render(<SandboxPanel view={item.view} agent="Writer" live place="desktop" />);
    expect(container.textContent).not.toContain("s3cret-value");
    expect(container.textContent).not.toContain("unknown-field");
  });

  it("gives a phone the stacked rows, 'your computer' and a line instead of a link", () => {
    const container = render(
      <SandboxPanel view={view} agent="Writer" live={false} place="phone" />,
    );
    expect(container.textContent).toContain("A process sandbox on your computer");
    expect(container.textContent).toContain("Change this in Writer's file on your computer.");
    expect(container.querySelector("button[class*=accent]")).toBeNull();
  });

  it("gives the desktop an action only where the page can open the agent", () => {
    const without = render(<SandboxPanel view={view} agent="Writer" live place="desktop" />);
    expect(without.textContent).not.toContain("Change in");
    let opened = 0;
    const withAction = render(
      <SandboxPanel
        view={view}
        agent="Writer"
        live
        place="desktop"
        onOpenHarness={() => opened++}
      />,
    );
    const button = [...withAction.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Change in Writer's settings"),
    );
    act(() => button?.click());
    expect(opened).toBe(1);
  });

  it("names a step that ran without the sandbox with the Full access chip", () => {
    const container = render(<SandboxOffPanel agent="Coder" place="desktop" />);
    expect(container.textContent).toContain("Full access");
    expect(container.textContent).toContain("Ran on this computer, without the sandbox");
    expect(container.textContent).toContain("You chose to run Coder on this computer");
  });

  it("says your computer on a phone", () => {
    const container = render(<SandboxOffPanel agent="Coder" place="phone" />);
    expect(container.textContent).toContain("You chose to run Coder on your computer");
    expect(container.textContent).not.toContain("this computer");
  });
});
