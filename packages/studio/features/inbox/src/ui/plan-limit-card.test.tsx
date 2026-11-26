// @vitest-environment jsdom
import type { RunSummary } from "@halonicjs/events";
import type { SendOptions } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { inboxDecisions } from "../decide.ts";
import { inboxItems, type WaitItem } from "../inbox-items.ts";
import { runAtLimit } from "../plan-limit.test-helper.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { renderWithUpdate, unmountAll } from "../test-support/render.tsx";
import { rowFor, wholeLine } from "./inbox-row.tsx";
import { PlanLimitCard, type PlanLimitCardProps } from "./plan-limit-card.tsx";
import { button, press } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

/** The Inbox's item for a run waiting at `plan.cost` since 10:40. */
function limitItem(): WaitItem & { readonly limit: NonNullable<WaitItem["limit"]> } {
  const [item] = inboxItems([runAtLimit()]);
  if (item?.kind !== "wait" || item.limit === undefined) throw new Error("expected a limit item");
  return { ...item, limit: item.limit };
}

/** Renders the card at 10:43, with Continue answering `answer`'s run. */
function openCard(answer: () => Promise<RunSummary>, overrides: Partial<PlanLimitCardProps> = {}) {
  const sent: string[] = [];
  const props: PlanLimitCardProps = {
    item: limitItem(),
    decisions: {
      answer: async (_item, event) => {
        sent.push(event);
        return answer();
      },
    },
    next: null,
    now: () => new Date("2026-11-10T10:43:00.000Z"),
    ...overrides,
  };
  const { container: root, update } = renderWithUpdate(<PlanLimitCard {...props} />);
  const rerender = (changes: Partial<PlanLimitCardProps>) =>
    update(<PlanLimitCard {...props} {...changes} />);
  return { root, sent, rerender };
}

verifies("inbox.plan-limit-card", () => {
  describe("the Inbox's item", () => {
    it("lists a run at a plan limit with C3's title, taking only continue, with no timer", () => {
      const item = limitItem();
      expect(item.title).toBe("This run stopped: you've used this month's usage");
      expect(item.accepts).toEqual(["continue"]);
      expect(item.movesOnAt).toBeNull();
      expect(item.limit.unit).toBe("cost");
    });

    it("keeps a wait step's item as it was", () => {
      const [item] = inboxItems([
        waitingRun("r43", { waitingFor: { title: "Approve?", body: "" } }),
      ]);
      expect(item?.kind === "wait" ? item.limit : "not a wait").toBeUndefined();
    });

    it("doesn't call it a person step in the row", () => {
      const facts = { workflow: "Support reply", hubId: "acme", startedBy: "you" };
      const row = rowFor(limitItem(), new Date("2026-11-10T10:43:00.000Z"), facts);
      expect(wholeLine(row)).toMatch(/^Support reply · run r51 · Waiting 3\smin$/);
    });

    it("sends continue without naming a wait step", async () => {
      const calls: { runId: string; event: string; options: SendOptions | undefined }[] = [];
      const decisions = inboxDecisions({
        send: async (runId, event, _payload, options) => {
          calls.push({ runId, event, options });
          return waitingRun(runId);
        },
      });
      await decisions.answer(limitItem(), "continue");
      expect(calls).toEqual([{ runId: "r51", event: "continue", options: {} }]);
    });
  });

  describe("the card", () => {
    it("shows the stop, the chip and Continue the run, with no upgrade", () => {
      const { root } = openCard(async () => waitingRun("r51", { status: "running" }));
      expect(root.querySelector("h2")?.textContent).toBe(
        "This run stopped: you've used this month's usage",
      );
      expect(document.activeElement).toBe(root.querySelector("h2"));
      expect(root.textContent).toContain("Waiting: plan limit reached");
      expect(root.textContent).toContain("It resets on 2 December.");
      expect(button(root, "Continue the run").textContent).toContain("Continue the run");
      expect(root.textContent).not.toMatch(/upgrade/i);
      expect(root.textContent).not.toContain("See usage");
    });

    it("posts continue, and once the run goes on says so", async () => {
      const { root, sent } = openCard(async () => waitingRun("r51", { status: "running" }));
      await press(button(root, "Continue the run"));
      expect(sent).toEqual(["continue"]);
      expect(root.textContent).toContain("The run continues.");
    });

    it("stays as it was, with no error, and says and announces it's still at the plan's limit", async () => {
      const announced: string[] = [];
      const { root, sent } = openCard(async () => runAtLimit(), {
        announce: (line) => announced.push(line),
      });
      const title = root.querySelector("h2")?.textContent;
      await press(button(root, "Continue the run"));
      const line = "This run is still at your plan's limit. It resets on 2 December.";
      expect(sent).toEqual(["continue"]);
      expect(root.querySelector("h2")?.textContent).toBe(title);
      expect(root.querySelector('[role="alert"]')?.textContent).toBe("");
      expect(root.textContent).toContain(line);
      expect(announced).toEqual([line]);
      expect(button(root, "Continue the run").textContent).toContain("Continue the run");
    });

    it("says nothing extra once the run goes on", async () => {
      const said: string[] = [];
      const { root } = openCard(async () => waitingRun("r51", { status: "running" }), {
        announce: (line) => said.push(line),
      });
      await press(button(root, "Continue the run"));
      expect(said).toEqual([]);
    });

    it("says Continue failed, with Try again, when the computer can't be reached", async () => {
      const { root } = openCard(async () => {
        throw new KindedError("unavailable", "Halonic couldn't reach the computer.");
      });
      await press(button(root, "Continue the run"));
      expect(root.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't record your decision.",
      );
      expect(button(root, "Try again")).toBeDefined();
    });

    it("opens the account page's plan from See usage", async () => {
      const opened: string[] = [];
      const { root } = openCard(async () => runAtLimit(), {
        onSeeUsage: () => opened.push("plan"),
      });
      await press(button(root, "See usage"));
      expect(opened).toEqual(["plan"]);
    });

    it("turns stale when the run was continued somewhere else", () => {
      const { root, rerender } = openCard(async () => runAtLimit());
      rerender({ waiting: false });
      expect(root.textContent).toContain("This is no longer waiting for you.");
      expect(root.textContent).not.toContain("Continue the run");
    });
  });
});
