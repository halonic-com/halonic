// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { VersionHistoryHost } from "../api.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const run = summaryWith({ id: "run_mfx3k2a1_01jd8q" });

async function ranOnOf(versionHistory?: VersionHistoryHost): Promise<string | undefined> {
  const { source } = fakeSource([run], { [run.id]: logOf(run.id, []) });
  const root = render(
    <RunView
      list={new RunsList(source)}
      runId={run.id}
      now={() => mondayMorning}
      {...(versionHistory === undefined ? {} : { versionHistory })}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const terms = [...root.querySelectorAll("dt")];
  const ranOn = terms.find((term) => term.textContent === "Ran on");
  return ranOn?.nextElementSibling?.textContent ?? undefined;
}

verifies("runs.run-view.live-or-saved", () => {
  it("leaves Ran on out for a workspace with no version history (HAL-12727)", async () => {
    expect(await ranOnOf({ hasVersions: async () => false })).toBeUndefined();
  });

  it('keeps "Version not recorded." for a workspace that has history', async () => {
    expect(await ranOnOf({ hasVersions: async () => true })).toBe("Version not recorded.");
  });

  it("shows Ran on as before where the app can't tell, or the history can't be read", async () => {
    expect(await ranOnOf()).toBe("Version not recorded.");
    const unreadable = { hasVersions: () => Promise.reject(new Error("git refused")) };
    expect(await ranOnOf(unreadable)).toBe("Version not recorded.");
  });
});
