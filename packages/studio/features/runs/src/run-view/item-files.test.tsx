// @vitest-environment jsdom
import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { RunFileSaveHost } from "../api.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { savedFiles } from "./receipt-model.ts";
import { entered, logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const reportHash = "3f".repeat(32);
const notesHash = "a1".repeat(32);
const weeklyReport = summaryWith({
  id: "run_w_5r8t2k",
  workflowId: "weekly-report",
  status: "completed",
  state: "done",
});

function created(name: string, hash: string): RunEventBody {
  return {
    type: "artifact.created",
    state: "write",
    name,
    hash,
    mediaType: "text/markdown",
    size: 21,
  };
}

/** The Acme Weekly report run: it wrote the report as weekly-report.md. */
const reportLog = logOf(weeklyReport.id, [
  [1, entered("write")],
  [2, created("weekly-report.md", reportHash)],
  [2, { type: "run.completed", state: "done", context: {} }],
]);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openReport(fileSave?: RunFileSaveHost) {
  const { source } = fakeSource([weeklyReport], { [weeklyReport.id]: reportLog });
  const root = render(
    <RunView
      list={new RunsList(source)}
      runId={weeklyReport.id}
      now={() => mondayMorning}
      {...(fileSave === undefined ? {} : { fileSave })}
    />,
  );
  await settled();
  return root;
}

function saveButton(root: HTMLElement): HTMLButtonElement {
  const found = root.querySelector<HTMLButtonElement>(
    'button[aria-label="Save… weekly-report.md"]',
  );
  if (found === null) throw new Error("no Save… for weekly-report.md");
  return found;
}

async function press(button: HTMLButtonElement): Promise<void> {
  await act(async () => button.click());
  await settled();
}

/** What weekly-report.md's row says about its last Save…. */
function saveLine(root: HTMLElement): string | undefined {
  return saveButton(root).closest("li")?.querySelector('[role="status"]')?.textContent ?? undefined;
}

verifies("runs.run-view.receipt-items-save", () => {
  it("asks to save weekly-report.md by its run and hash when Save… is pressed", async () => {
    const save = vi.fn<RunFileSaveHost["save"]>(async () => "saved");
    const root = await openReport({ save });
    expect(root.textContent).toContain("Created 1 file: weekly-report.md");
    expect(saveButton(root).textContent).toContain("Save…");
    await press(saveButton(root));
    expect(save).toHaveBeenCalledExactlyOnceWith(weeklyReport.id, reportHash);
    expect(saveLine(root)).toBe("Saved weekly-report.md.");
  });

  it("says Saving… until the app answers", async () => {
    let answer: (saved: "saved") => void = () => undefined;
    const root = await openReport({ save: () => new Promise((resolve) => (answer = resolve)) });
    await press(saveButton(root));
    expect(root.querySelector('button[aria-busy="true"]')?.textContent).toContain("Saving…");
    await act(async () => answer("saved"));
    expect(saveLine(root)).toBe("Saved weekly-report.md.");
  });

  it("says nothing when the person cancels the save dialog", async () => {
    const root = await openReport({ save: async () => "cancelled" });
    await press(saveButton(root));
    expect(saveLine(root)).toBe("");
    expect(saveButton(root).getAttribute("aria-busy")).not.toBe("true");
  });

  it("says the file couldn't be saved when saving fails", async () => {
    const failure = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = await openReport({ save: async () => Promise.reject(new Error("io")) });
    await press(saveButton(root));
    expect(saveLine(root)).toBe("Couldn't save weekly-report.md. Try again.");
    expect(failure).toHaveBeenCalledOnce();
    failure.mockRestore();
  });

  it("shows only the Items line where the app can't save", async () => {
    const root = await openReport();
    expect(root.textContent).toContain("Created 1 file: weekly-report.md");
    expect(root.textContent).not.toContain("Save…");
  });

  it("says Saved only on the row pressed when two files have the same bytes", async () => {
    const copyLog = logOf(weeklyReport.id, [
      [1, created("weekly-report.md", reportHash)],
      [1, created("weekly-report-copy.md", reportHash)],
      [2, { type: "run.completed", state: "done", context: {} }],
    ]);
    const { source } = fakeSource([weeklyReport], { [weeklyReport.id]: copyLog });
    const root = render(
      <RunView
        list={new RunsList(source)}
        runId={weeklyReport.id}
        now={() => mondayMorning}
        fileSave={{ save: async () => "saved" }}
      />,
    );
    await settled();
    await press(saveButton(root));
    const lines = [...root.querySelectorAll('#receipt-items ~ ul li [role="status"]')];
    expect(lines.map((line) => line.textContent)).toEqual(["Saved weekly-report.md.", ""]);
  });

  it("puts Save… after Open in each file's row", async () => {
    const { source } = fakeSource([weeklyReport], { [weeklyReport.id]: reportLog });
    const root = render(
      <RunView
        list={new RunsList(source)}
        runId={weeklyReport.id}
        now={() => mondayMorning}
        openFile={() => undefined}
        fileSave={{ save: async () => "saved" }}
      />,
    );
    await settled();
    const row = saveButton(root).closest("li");
    const buttons = [...(row?.querySelectorAll("button") ?? [])];
    expect(
      buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent),
    ).toEqual(["Open weekly-report.md", "Save… weekly-report.md"]);
  });

  it("lists each file once, in the order first saved, with the hash of its last save", () => {
    const log = logOf(weeklyReport.id, [
      [1, created("notes.md", "11".repeat(32))],
      [1, created("weekly-report.md", reportHash)],
      [2, created("notes.md", notesHash)],
    ]);
    expect(savedFiles(log)).toEqual([
      { name: "notes.md", shown: "notes.md", hash: notesHash },
      { name: "weekly-report.md", shown: "weekly-report.md", hash: reportHash },
    ]);
  });
});
