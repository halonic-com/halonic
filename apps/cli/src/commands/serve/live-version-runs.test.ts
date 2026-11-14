import type { RunVersion } from "@halonicjs/events";
import type { RunExecutor, StartRunRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { startsOnLiveVersion } from "./live-version-runs.ts";

const live: RunVersion = { reads: "live-version", commit: "abc123", versionDate: "2026-11-14" };

/** An executor that records the starts it is given; nothing else is called in these tests. */
function recordingExecutor(): { executor: RunExecutor; starts: StartRunRequest[] } {
  const starts: StartRunRequest[] = [];
  const executor = {
    id: "acme",
    start: async (request: StartRunRequest) => {
      starts.push(request);
      return { id: "run-1" };
    },
  } as unknown as RunExecutor;
  return { executor, starts };
}

const request: StartRunRequest = { hubId: "lab", workflowId: "change", input: {} };

verifies("cli.commands.serve.harness", () => {
  it("gives a start that names no version the live one", async () => {
    const { executor, starts } = recordingExecutor();

    await startsOnLiveVersion(executor, async () => live).start(request);

    expect(starts).toEqual([{ ...request, version: live }]);
  });

  it("leaves a start that names a version as it is, without asking for the live one", async () => {
    const { executor, starts } = recordingExecutor();
    const named: StartRunRequest = { ...request, version: { reads: "saved-files" } };

    await startsOnLiveVersion(executor, async () => {
      throw new Error("The live version must not be read.");
    }).start(named);

    expect(starts).toEqual([named]);
  });

  it("starts nothing when no version is live", async () => {
    const { executor, starts } = recordingExecutor();

    await expect(startsOnLiveVersion(executor, async () => null).start(request)).rejects.toThrow();
    expect(starts).toEqual([]);
  });
});
