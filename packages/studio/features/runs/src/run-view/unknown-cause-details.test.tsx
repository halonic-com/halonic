// @vitest-environment jsdom
import { ClipboardProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const failed = summaryWith({
  id: "run_a_7k2m9p",
  status: "failed",
  error: "Model refused",
  endedAt: mondayMorning.toISOString(),
});

async function open(writeClipboard: (text: string) => Promise<boolean>): Promise<HTMLElement> {
  const log = logOf(failed.id, [[0, entered("draft")]]).map((event) =>
    event.type === "run.started" ? { ...event, input: { message: "Hi" } } : event,
  );
  const list = new RunsList(fakeSource([failed], { [failed.id]: log }).source);
  const root = render(
    <ClipboardProvider writeClipboard={writeClipboard}>
      <RunView
        list={list}
        runId={failed.id}
        now={() => mondayMorning}
        openRun={vi.fn()}
        runStart={{ startRun: vi.fn() }}
      />
    </ClipboardProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

verifies("runs.run-view.unknown-cause-details", () => {
  it("keeps the engine's message off the screen, with Run again and Copy details", async () => {
    const root = await open(async () => true);
    const banner = root.querySelector('section[aria-label="Run failed"]');

    expect(banner?.textContent).toContain("Halonic can't tell the cause yet.");
    expect(root.textContent).not.toContain("Model refused");
    const names = [...(banner?.querySelectorAll("button") ?? [])].map((one) => one.textContent);
    expect(names).toEqual(["Run again", "Copy details"]);
  });

  it("puts the sentence, the run's id and the engine's message on the clipboard", async () => {
    const writeClipboard = vi.fn(async (_text: string) => true);
    const root = await open(writeClipboard);
    const copy = [...root.querySelectorAll("button")].find(
      (one) => one.textContent === "Copy details",
    );
    await act(async () => copy?.click());

    const copied = writeClipboard.mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("Halonic can't tell the cause yet.");
    expect(copied).toContain("run_a_7k2m9p");
    expect(copied).toContain("Model refused");
  });
});
