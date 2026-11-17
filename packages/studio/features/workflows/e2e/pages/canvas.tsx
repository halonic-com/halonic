import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { WorkflowView } from "../../src/api.ts";
import { WorkflowCanvas } from "../../src/page/workflow-canvas.tsx";
import { marksOf } from "../../src/start/run-strip.ts";

/**
 * The workflow canvas with a made-up Review workflow (HAL-11974): `?run=` is what the shown run
 * went through. `none` shows no run, `mid` a run that has reached Review, `done` a run that went
 * straight to Publish, `failed` a run that failed in Publish, and `branch` a run that took "rejected", so the "approved" arrow stays grey.
 */
const workflow: WorkflowView = {
  hubId: "my-notes",
  id: "review-pull-request",
  name: "Review pull request",
  initial: "summarise",
  steps: [
    { id: "summarise", type: "task", title: "Summarise the change", agent: "summariser" },
    { id: "review", type: "wait", title: "Review the summary" },
    { id: "publish", type: "task", title: "Publish the review", agent: "publisher" },
    { id: "rework", type: "task", title: "Rework the summary", agent: "summariser" },
    { id: "end", type: "final", title: "Done" },
  ],
  arrows: [
    { from: "summarise", to: "review" },
    { from: "review", to: "publish", label: "approved" },
    { from: "review", to: "rework", label: "rejected" },
    { from: "rework", to: "review" },
    { from: "publish", to: "end" },
  ],
  layout: {},
};

const routes: Record<string, readonly string[]> = {
  none: [],
  mid: ["summarise", "review"],
  done: ["summarise", "review", "publish", "end"],
  branch: ["summarise", "review", "rework", "review"],
  failed: ["summarise", "review", "publish"],
};

const standings = {
  mid: "running",
  done: "done",
  branch: "waiting",
  failed: "failed",
} as const;

const run = new URLSearchParams(location.search).get("run") ?? "none";
const root = document.getElementById("root");
if (root !== null) {
  root.className = "flex h-screen";
  createRoot(root).render(
    <StrictMode>
      <WorkflowCanvas
        workflow={workflow}
        route={run === "none" ? undefined : routes[run]}
        marks={
          run in standings
            ? marksOf(routes[run] ?? [], standings[run as keyof typeof standings])
            : undefined
        }
        active={run === "mid" || run === "branch" ? routes[run]?.at(-1) : undefined}
      />
    </StrictMode>,
  );
}
