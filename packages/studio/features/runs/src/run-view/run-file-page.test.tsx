// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { RunFiles } from "../api.ts";
import { fakeSource } from "../source.test-helper.ts";
import { summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunFileView } from "./run-file-page.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";

afterEach(unmountAll);

const report = "This week: 12 emails. Most asked about refunds for damaged orders.";
const hash = "c".repeat(64);
const run = summaryWith({ id: "run_e_4w8r2k", status: "completed", lastSeq: 3 });

/** An Acme Weekly report run that saved weekly-report.md. */
const source = fakeSource([run], {
  [run.id]: logOf(run.id, [
    [1, entered("write")],
    [
      2,
      {
        type: "artifact.created",
        state: "write",
        name: "weekly-report.md",
        hash,
        mediaType: "text/markdown",
        size: report.length,
      },
    ],
    [2, { type: "run.completed", state: "done", context: {} }],
  ]),
}).source;

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openFileView(files: RunFiles): Promise<HTMLElement> {
  const root = render(
    <RunFileView source={source} files={files} runId={run.id} name="weekly-report.md" />,
  );
  await settled();
  return root;
}

verifies("runs.run-view.open-file-screen-reader", () => {
  it("moves focus to the h1 on Try again and reads a new failure in an alert", async () => {
    const files: RunFiles = {
      read: async () => {
        throw new Error("no answer");
      },
    };
    const page = await openFileView(files);
    const tryAgain = [...page.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === "Try again",
    );
    act(() => {
      tryAgain?.focus();
      tryAgain?.click();
    });
    await settled();

    const heading = page.querySelector("h1");
    expect(heading?.textContent).toBe("weekly-report.md");
    expect(document.activeElement).toBe(heading);
    expect(page.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't load weekly-report.md",
    );
  });

  it("names the text frame by the file's heading, not by its text", async () => {
    const page = await openFileView({ read: async () => new TextEncoder().encode(report) });
    const frame = page.querySelector("pre");
    const heading = page.querySelector("h1");
    expect(frame?.textContent).toBe(report);
    expect(frame?.getAttribute("role")).toBe("region");
    expect(heading?.id).not.toBe("");
    expect(frame?.getAttribute("aria-labelledby")).toBe(heading?.id);
  });
});
