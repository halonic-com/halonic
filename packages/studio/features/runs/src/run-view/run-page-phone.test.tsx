// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunView } from "./run-page.tsx";

// jsdom's <dialog> has no showModal(); the sheet only needs it to exist.
const { showModal, close } = HTMLDialogElement.prototype;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function open(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function shut(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});
afterEach(unmountAll);

const run = summaryWith({ id: "run_a_7k2m9p" });

async function openOnPhone() {
  const list = new RunsList(fakeSource([run]).source);
  const root = render(
    <PresentationProvider presentation="phone">
      <RunView list={list} runId={run.id} now={() => mondayMorning} />
    </PresentationProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

function detailsRow(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === "Details",
  );
}

verifies("runs.run-page", () => {
  it("shows the run on a phone, with its heading for screen readers", async () => {
    const root = await openOnPhone();
    const heading = root.querySelector("h1");
    expect(heading?.textContent).toBe("Run 7k2m9p");
    expect(heading?.className).toContain("sr-only");
    expect(root.textContent).not.toContain("Runs open on your computer");
    expect(root.textContent).toContain("Running");
  });

  it("folds Details into one row that opens a sheet", async () => {
    const root = await openOnPhone();
    expect(root.querySelector("dl")).toBeNull();
    const row = detailsRow(root);
    expect(row).toBeDefined();
    await act(async () => row?.click());
    expect(root.querySelector("dialog dl")?.textContent).toContain("Started by");
  });
});
