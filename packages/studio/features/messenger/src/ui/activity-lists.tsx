import { decidedAt } from "@halonicjs/studio-kit";
import type { RunOutcome } from "../activity.ts";
import type { EarlierRun, NextTask } from "../activity-today.ts";
import { activityWords } from "../activity-words.ts";
import { Section } from "./activity-parts.tsx";

/**
 * **Next** (`messenger.activity-panel`): up to 3 open tasks the agent holds, each with its title
 * and "ACME-7 · To do". Nothing when it holds none.
 */
export function NextTasks({ next }: { readonly next: readonly NextTask[] }) {
  if (next.length === 0) return null;
  return (
    <Section title={activityWords.next}>
      <ul className="flex flex-col gap-2">
        {next.map((task) => (
          <li key={task.id} className="flex flex-col text-small">
            <bdi className="text-body">{task.title}</bdi>
            <span className="text-fg-muted">
              {[task.label, activityWords.workState[task.state]]
                .filter((part) => part !== "")
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const outcomeDot = {
  done: "bg-success",
  failed: "bg-danger",
  stopped: "bg-attention",
} as const satisfies Record<RunOutcome, string>;

/**
 * **Earlier today**: up to 3 of today's earlier runs, each with its outcome dot (a stopped one in
 * the attention colour), its task, its start and its length. A screen reader hears the outcome
 * in words instead of the dot.
 */
export function EarlierRuns({ runs }: { readonly runs: readonly EarlierRun[] }) {
  if (runs.length === 0) return null;
  return (
    <Section title={activityWords.earlierToday}>
      <ul className="flex flex-col gap-2">
        {runs.map((run) => (
          <li key={run.id} className="flex items-baseline gap-2 text-small">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${outcomeDot[run.outcome]}`}
            />
            <span className="sr-only">{activityWords.outcome[run.outcome]}: </span>
            <bdi className="min-w-0 flex-1 truncate">{run.task ?? ""}</bdi>
            <span className="shrink-0 text-fg-muted">
              {activityWords.startedFor(decidedAt(run.startedAt), run.minutes)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
