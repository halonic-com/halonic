// @vitest-environment jsdom

import { RunsListService, RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import { limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { RUN_FORM_STEP, type WorkflowsHost, WorkflowsHostService } from "../api.ts";
import { workflowsFeature } from "../feature.ts";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply, settings } from "./page-fixtures.ts";
import { WorkflowPage } from "./workflow-item.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(() => unmount());

const startRun = async () => ({ runId: "run_mfx3k2a1_01jd8q" });

/** The page's own Run. */
const runButtonOf = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run");

const press = (button: HTMLButtonElement | null | undefined) =>
  act(async () => {
    button?.click();
  });

/** Support reply's page, asked for its Run form `asked` times so far (none while `undefined`). */
function screen(overrides: Partial<WorkflowsHost>, asked: number | undefined) {
  const { host } = memoryHost([], [], [reply], [settings], overrides);
  return (
    <WorkflowScreen
      host={host}
      runs={memoryRuns().source}
      hubId="acme"
      id="reply"
      runFormAsked={asked}
    />
  );
}

verifies("workflows.page.open-run-form", () => {
  it("opens at its Run form when the tab is opened with the step `run`", async () => {
    const { host } = memoryHost([], [], [reply], [settings], { startRun });
    const services = new Map<unknown, unknown>([
      [WorkflowsHostService, host],
      [RunsSourceService, memoryRuns().source],
      [RunsListService, {}],
    ]);
    const context = {
      services: limitedLookup(workflowsFeature, { get: (key) => services.get(key) }),
      announcer: { announce: () => undefined, announceState: () => undefined },
    };
    const page = await show(
      <WorkflowPage
        item={{ kind: "workflow", hub: "acme", id: "reply" }}
        context={context as never}
        Sections={() => null}
        step={RUN_FORM_STEP}
        asked={1}
      />,
    );
    expect(page.textContent).toContain("START A RUN");
  });

  it("opens the form again when an open page is asked again, and Cancel gives focus to Run", async () => {
    const { host } = memoryHost([], [], [reply], [settings], { startRun });
    let ask: () => void = () => undefined;
    function Asked() {
      const [asked, setAsked] = useState<number | undefined>();
      ask = () => setAsked((count) => (count ?? 0) + 1);
      return (
        <WorkflowScreen
          host={host}
          runs={memoryRuns().source}
          hubId="acme"
          id="reply"
          runFormAsked={asked}
        />
      );
    }
    const page = await show(<Asked />);
    expect(page.textContent).not.toContain("START A RUN");

    await act(async () => ask());
    expect(page.textContent).toContain("START A RUN");
    await press(buttonNamed(page, "Cancel"));
    expect(page.textContent).not.toContain("START A RUN");
    expect(document.activeElement).toBe(runButtonOf(page));

    await act(async () => ask());
    expect(page.textContent).toContain("START A RUN");
  });

  it("opens no form while the files refuse the run, as Run doesn't", async () => {
    const refusal = {
      reason: "Reporter uses a connector, which Studio can't start yet.",
      fix: "To start it, run this in a terminal:",
      command: "halonic run reply",
    };
    const page = await show(screen({ startRun, startRefusal: async () => refusal }, 1));
    expect(page.textContent).toContain(refusal.reason);
    expect(page.textContent).not.toContain("START A RUN");
  });

  it("opens no form on a page that has no Run", async () => {
    const page = await show(screen({}, 1));
    expect(page.textContent).not.toContain("START A RUN");
  });
});
