import { PlanLimitCard, type PlanLimitCardProps } from "@halonicjs/studio-feature-inbox/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The Inbox card of a made-up run waiting at its customer's plan limit (flow C3, board 10,
 * HAL-19051): `?state=waiting` at this month's usage, `?state=reserve` before a step that needs
 * more agent time than is left. **See usage** is there, as in a served Studio with Cloud sign-in.
 */

const asked = new Date(2026, 10, 25, 14, 2);

const usedUp = {
  kind: "unit",
  unit: "cost",
  member: false,
  usedPercent: 100,
  resetsAt: "2026-12-02T00:00:00.000Z",
  canUpgrade: false,
} as const;

const reserve = {
  ...usedUp,
  unit: "harnessMinutes",
  usedPercent: 89,
  used: 534,
  limit: 600,
  reserve: { neededPercent: 8, leftPercent: 3, needed: 48, left: 18 },
} as const;

const state = new URLSearchParams(window.location.search).get("state");

const item: PlanLimitCardProps["item"] = {
  kind: "wait",
  key: "run_fix_issue_4b1e:reply",
  runId: "run_fix_issue_4b1e",
  state: "reply",
  title: "",
  body: "",
  accepts: ["continue"],
  answerLabels: {},
  since: asked.toISOString(),
  waitingAt: asked.toISOString(),
  movesOnAt: null,
  limit: state === "reserve" ? reserve : usedUp,
};

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The plan limit page needs its #root element (plan-limit.html).");
}
createRoot(root).render(
  <StrictMode>
    {/* The screenshot's frame: the Inbox pane's width at most, as tall as its content. */}
    <div id="shot" className="w-full max-w-[28rem] bg-surface text-fg">
      <PlanLimitCard
        item={item}
        decisions={{ answer: () => new Promise(() => undefined) }}
        next={null}
        now={() => new Date(asked.getTime() + 3 * 60_000)}
        startedBy="you, with Run"
        onOpenRun={() => undefined}
        onSeeUsage={() => undefined}
      />
    </div>
  </StrictMode>,
);
