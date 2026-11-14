// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { RunsSourceService } from "../api.ts";
import { runsFeature } from "../feature.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { summaryWith } from "../summary.test-helper.ts";
import { renderSuspending, unmountAll } from "../test-support/render.tsx";
import { SpendView } from "./spend-card.tsx";

afterEach(unmountAll);

const now = () => new Date("2026-11-13T10:00:00.000Z");
const thisMonth = summaryWith({
  id: "run_a_7k2m9p",
  startedAt: "2026-11-02T08:00:00.000Z",
  cost: 120.4,
});

async function show(fake: ReturnType<typeof fakeSource>, phone = false) {
  const list = new RunsList(fake.source);
  const view = (
    <SpendView
      list={list}
      currency={() => fake.source.currency()}
      monthlyBudget={() => fake.source.monthlyBudget()}
      now={now}
    />
  );
  const root = await renderSuspending(
    phone ? <PresentationProvider presentation="phone">{view}</PresentationProvider> : view,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

verifies("runs.spend-tile", () => {
  it("adds Home's Spend section", async () => {
    const shell = createShell({ features: [runsFeature], hostServices: [RunsSourceService] });
    const card = shell.contributions.home.cards().find((added) => added.id === "spend");
    expect(await card?.load()).toHaveProperty("SpendCard");
  });

  it("shows this month's spend and, over the budget, says so, with the budget line", async () => {
    const fake = fakeSource([thisMonth]);
    fake.budget(100);
    const root = await show(fake);

    expect(root.querySelector("h3")?.textContent).toBe("Estimated spend per month");
    expect(root.textContent).toContain("€120.40");
    expect(root.querySelector("p.text-attention")?.textContent).toBe(
      "This month, estimated, over the €100.00 budget",
    );
    expect(root.querySelector("line")).not.toBeNull();
    expect(root.querySelectorAll("rect")).toHaveLength(6);
  });

  it("says only This month, and draws no line, without a monthly budget", async () => {
    const root = await show(fakeSource([thisMonth]));

    expect(root.textContent).toContain("This month, estimated");
    expect(root.querySelector("p.text-attention")).toBeNull();
    expect(root.querySelector("line")).toBeNull();
  });

  it("stays on Home with its empty text when no run cost anything", async () => {
    const fake = fakeSource([
      summaryWith({ id: "run_b", startedAt: "2026-11-02T08:00:00.000Z", cost: 0 }),
    ]);
    fake.budget(100);
    const root = await show(fake);

    expect(root.textContent).toContain(
      "No spend yet. When a run costs something, you'll see it here by month.",
    );
    expect(root.querySelector("rect")).toBeNull();
    expect(root.querySelector("line")).toBeNull();
  });

  it("is one column on a phone and the left of two on a desktop", async () => {
    expect((await show(fakeSource([thisMonth]))).querySelector(".grid-cols-2")).not.toBeNull();
    unmountAll();
    expect((await show(fakeSource([thisMonth]), true)).querySelector(".grid-cols-2")).toBeNull();
  });

  it("isn't a link or a focus stop", async () => {
    const root = await show(fakeSource([thisMonth]));
    expect(root.querySelector("a, button, [tabindex]")).toBeNull();
  });
});
