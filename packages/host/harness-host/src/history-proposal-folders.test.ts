import type { ProposalRun, RunProposalFolders } from "@halonicjs/engine";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { HistoryProposalFolders, ProposalsNeedHistoryError } from "./history-proposal-folders.ts";

const liveRun: ProposalRun = {
  runId: "01JD8Q",
  hubId: "support",
  workflowId: "triage",
  version: { reads: "live-version", commit: "9f86d08", versionDate: "2026-11-11T09:00:00.000Z" },
};
const savedFilesRun: ProposalRun = { ...liveRun, version: { reads: "saved-files" } };
const unversionedRun: ProposalRun = { ...liveRun, version: null };

/** Folders that open each run in `/data/proposals/<runId>` and note what they were asked. */
function recordingFolders(): RunProposalFolders & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    open: async (run) => {
      calls.push(`open ${run.runId}`);
      return `/data/proposals/${run.runId}`;
    },
    folderOf: async (runId) => {
      calls.push(`folderOf ${runId}`);
      return null;
    },
    end: async (runId) => {
      calls.push(`end ${runId}`);
    },
  };
}

verifies("harness-host.history-off", () => {
  it("refuses a run that reads the saved files when the host has no run copies", async () => {
    const folders = recordingFolders();
    const history = new HistoryProposalFolders({ folders, hasCopies: false });

    const error = await history.open(savedFilesRun).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ProposalsNeedHistoryError);
    expect(error).toMatchObject({ runId: "01JD8Q" });
    expect(String(error)).toContain("Turn history on by running git init");
    expect(folders.calls).toEqual([]);
  });

  it("refuses a run whose start names no version when the host has no run copies", async () => {
    const history = new HistoryProposalFolders({ folders: recordingFolders(), hasCopies: false });

    await expect(history.open(unversionedRun)).rejects.toBeInstanceOf(ProposalsNeedHistoryError);
  });

  it("opens a run at a live version without run copies", async () => {
    const folders = recordingFolders();
    const history = new HistoryProposalFolders({ folders, hasCopies: false });

    expect(await history.open(liveRun)).toBe("/data/proposals/01JD8Q");
    expect(folders.calls).toEqual(["open 01JD8Q"]);
  });

  it("opens a run that reads the saved files when the host has run copies", async () => {
    const history = new HistoryProposalFolders({ folders: recordingFolders(), hasCopies: true });

    expect(await history.open(savedFilesRun)).toBe("/data/proposals/01JD8Q");
  });

  it("finds and ends folders as the proposal folders do", async () => {
    const folders = recordingFolders();
    const history = new HistoryProposalFolders({ folders, hasCopies: false });

    expect(await history.folderOf("01JD8Q")).toBeNull();
    await history.end("01JD8Q");

    expect(folders.calls).toEqual(["folderOf 01JD8Q", "end 01JD8Q"]);
  });
});
