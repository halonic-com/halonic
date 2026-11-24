// @vitest-environment jsdom
import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { RunFiles } from "../api.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunFileView } from "./run-file-page.tsx";
import { runFileItem, runFileOf } from "./run-file-ref.ts";
import { entered, logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const report =
  "This week: 12 emails. Most asked about refunds for damaged orders. 2 replies are waiting for review.";
const hash = "b".repeat(64);
const run = summaryWith({ id: "run_e_4w8r2k", status: "completed", lastSeq: 5 });

/** An Acme Weekly report run whose step Write the report answered `answer` and saved it. */
function weeklyReport(answer: string, saved = true) {
  const bodies: [number, RunEventBody][] = [
    [1, entered("write")],
    [2, { type: "agent.finished", state: "write", agent: "reporter", output: answer }],
    ...(saved
      ? ([
          [
            2,
            {
              type: "artifact.created",
              state: "write",
              name: "weekly-report.md",
              hash,
              mediaType: "text/markdown",
              size: answer.length,
            },
          ],
        ] as [number, RunEventBody][])
      : []),
    [2, { type: "run.completed", state: "done", context: {} }],
  ];
  const fake = fakeSource([run], { [run.id]: logOf(run.id, bodies) });
  const source = {
    ...fake.source,
    workflow: () => ({
      name: "Weekly report",
      stepDescription: (state: string) => (state === "write" ? "Write the report" : undefined),
    }),
  };
  return source;
}

/** Files that hold `text` under the run's hash, or nothing when `text` is null. */
function filesWith(text: string | null): RunFiles {
  return {
    read: async (asked) =>
      asked === hash && text !== null ? new TextEncoder().encode(text) : null,
  };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(root: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === name,
  );
}

async function openPage(
  source: ReturnType<typeof weeklyReport>,
  openFile?: (name: string) => void,
) {
  const root = render(
    <RunView
      list={new RunsList(source)}
      runId={run.id}
      now={() => mondayMorning}
      {...(openFile === undefined ? {} : { openFile })}
    />,
  );
  await settled();
  return root;
}

async function openFileView(
  source: ReturnType<typeof weeklyReport>,
  files: RunFiles,
  name: string,
) {
  const root = render(<RunFileView source={source} files={files} runId={run.id} name={name} />);
  await settled();
  return root;
}

/** The read-only frame's text: a `pre`, with nothing in the page to type in. */
function shownText(root: HTMLElement): string | null | undefined {
  expect(root.querySelector("textarea, input, [contenteditable='true'], img, a")).toBeNull();
  return root.querySelector("pre")?.textContent;
}

verifies("runs.run-view.open-file", () => {
  it("opens weekly-report.md from Items and shows its text as plain text, read-only", async () => {
    const source = weeklyReport(report);
    const opened: string[] = [];
    const page = await openPage(source, (name) => opened.push(name));
    const open = button(page, "Open weekly-report.md");
    expect(open?.closest("section")?.textContent).toContain("Created 1 file: weekly-report.md");
    act(() => open?.click());
    expect(opened).toEqual(["weekly-report.md"]);

    const file = await openFileView(source, filesWith(report), "weekly-report.md");
    expect(file.querySelector("h1")?.textContent).toBe("weekly-report.md");
    expect(file.textContent).toContain("Saved by Run 4w8r2k · read-only");
    expect(shownText(file)).toBe(report);
  });

  it("shows a Markdown image, a link and a direction change in the file as text", async () => {
    const text = `Pay ${String.fromCodePoint(0x202e)}![x](https://example.com/x.png) [link](https://example.com)`;
    const file = await openFileView(weeklyReport(text), filesWith(text), "weekly-report.md");
    expect(shownText(file)).toBe(
      "Pay \\u202e![x](https://example.com/x.png) [link](https://example.com)",
    );
  });

  it("has no Open where the window can't open a file", async () => {
    const page = await openPage(weeklyReport(report));
    expect(page.textContent).toContain("Created 1 file: weekly-report.md");
    expect(button(page, "Open weekly-report.md")).toBeUndefined();
  });

  it("says when the file's text is gone, or the run saved no file by that name", async () => {
    const gone = await openFileView(weeklyReport(report), filesWith(null), "weekly-report.md");
    expect(gone.textContent).toContain("Halonic no longer has this file's text.");
    const other = await openFileView(weeklyReport(report), filesWith(report), "notes.md");
    expect(other.textContent).toContain("This run didn't save a file by that name.");
    expect(other.querySelector("pre")).toBeNull();
  });

  it("says it couldn't read the file, and reads it again on Try again", async () => {
    let fail = true;
    const files: RunFiles = {
      read: async () => {
        if (fail) throw new Error("no answer");
        return new TextEncoder().encode(report);
      },
    };
    const file = await openFileView(weeklyReport(report), files, "weekly-report.md");
    expect(file.textContent).toContain("Couldn't load weekly-report.md");
    fail = false;
    act(() => button(file, "Try again")?.click());
    await settled();
    expect(shownText(file)).toBe(report);
  });

  it("names the file in its item id after the run's id, keeping a / in the name", () => {
    const item = runFileItem("reports", run.id, "out/weekly-report.md");
    expect(item).toEqual({
      kind: "run-file",
      hub: "reports",
      id: `${run.id}/out/weekly-report.md`,
    });
    expect(runFileOf(item.id)).toEqual({ runId: run.id, name: "out/weekly-report.md" });
  });
});

/** Opens step Write the report's entry in Every step and gives its side panel. */
function openWriteStep(page: HTMLElement): HTMLElement | null {
  const cell = [...page.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((element) =>
    element.textContent?.includes("Write the report"),
  );
  act(() => cell?.click());
  return page.querySelector('section[aria-labelledby="step-answer"]');
}

verifies("runs.run-view.step-answer", () => {
  it("shows what Write the report answered in an Answer part of its panel", async () => {
    const page = await openPage(weeklyReport(report));
    const answer = openWriteStep(page);
    expect(answer?.classList.contains("border-dashed")).toBe(true);
    expect(answer?.querySelector("h3")?.textContent).toBe("Answer (its own words, not checked)");
    expect(answer?.textContent).toContain("This week: 12 emails");
  });

  it("shows a Markdown image, a link and a direction change in the answer as text", async () => {
    const text = `Pay ${String.fromCodePoint(0x202e)}![x](https://example.com/x.png) [link](https://example.com)`;
    const answer = openWriteStep(await openPage(weeklyReport(text, false)));
    expect(answer?.querySelector("p")?.textContent).toBe(
      "Pay \\u202e![x](https://example.com/x.png) [link](https://example.com)",
    );
    expect(answer?.querySelector("img, a")).toBeNull();
  });

  it("has no Answer part when the step's agent answered nothing", async () => {
    const page = await openPage(weeklyReport("  ", false));
    expect(openWriteStep(page)).toBeNull();
    // The panel is open, without the part.
    expect(page.querySelector('button[aria-label="Close Write the report"]')).not.toBeNull();
  });
});
