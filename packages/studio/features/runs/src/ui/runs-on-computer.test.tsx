// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { RunView } from "../run-view/run-page.tsx";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunsView } from "./runs-page.tsx";

afterEach(unmountAll);

const sentence = "Runs open on your computer for now.";
const run = summaryWith({ id: "run_a_7k2m9p" });

verifies("runs.list", () => {
  it("shows only the sentence on a phone", () => {
    const list = new RunsList(fakeSource([run]).source);
    const root = render(
      <PresentationProvider presentation="phone">
        <RunsView list={list} />
      </PresentationProvider>,
    );
    expect(root.textContent).toBe(sentence);
  });
});

verifies("runs.run-page", () => {
  it("shows only the sentence on a phone, for a run opened from Home", () => {
    const list = new RunsList(fakeSource([run]).source);
    const root = render(
      <PresentationProvider presentation="phone">
        <RunView list={list} runId="run_a_7k2m9p" />
      </PresentationProvider>,
    );
    expect(root.textContent).toBe(sentence);
  });
});
