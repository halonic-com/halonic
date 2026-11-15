// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { approvalAt, minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunsView } from "./runs-page.tsx";

afterEach(unmountAll);

const running = summaryWith({ id: "run_a_7k2m9p", state: "draft" });
const waiting = summaryWith({ id: "run_b_01jd8q", approvals: [approvalAt(1)] });
const waitingTest = summaryWith({
  id: "run_f_t1t1t1",
  kind: "test",
  status: "waiting",
  nextTimer: minutesLater(60),
});

async function openPhonePage(runs: Parameters<typeof fakeSource>[0], openRun = () => {}) {
  const list = new RunsList(fakeSource(runs).source);
  const root = render(
    <PresentationProvider presentation="phone">
      <RunsView list={list} now={() => mondayMorning} openRun={openRun} />
    </PresentationProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

verifies("runs.list", () => {
  it("shows the list on a phone, with its heading left to screen readers", async () => {
    const root = await openPhonePage([running, waiting]);
    const heading = root.querySelector("h1");
    expect(heading?.textContent).toBe("Runs");
    expect(heading?.className).toContain("sr-only");
    expect(root.querySelectorAll('[role="grid"] tr').length).toBeGreaterThan(2);
    expect(root.textContent).not.toContain("Runs open on your computer");
  });

  it("puts the status chips and Test runs on two rows", async () => {
    const root = await openPhonePage([running]);
    const rows = [...root.querySelectorAll("div")].find(
      (element) =>
        element.className.includes("flex-col") &&
        element.className.includes("gap-4") &&
        element.children.length === 2 &&
        element.textContent?.includes("Test runs"),
    );
    expect(rows?.textContent).toContain("Failed");
  });

  it("draws a run with no ⋮, and its Test tag opens the third line before the short id", async () => {
    const root = await openPhonePage([waitingTest, running]);
    expect(root.querySelector('button[aria-haspopup="menu"]')).toBeNull();
    const footer = [...root.querySelectorAll("span")].find(
      (span) => span.textContent?.startsWith("Test") && span.textContent.includes("t1t1t1"),
    );
    expect(footer).toBeDefined();
  });
});
