// The bands under a workflow page's header that say why **Run** is unavailable, and the row with
// the command that starts the workflow in a terminal (rule N5, HAL-12363; C471-1 and HAL-14739).

import { Callout, CommandBox, inlineLinkClasses } from "@halonicjs/studio-kit";
import { type ReactNode, useId } from "react";
import type {
  StartRefusal,
  WorkflowAgentChoice,
  WorkflowProblem,
  WorkflowRef,
  WorkflowsHost,
} from "../api.ts";
import { startWords } from "../start/start-words.ts";
import { pageWords } from "./page-words.ts";
import { StartCommand } from "./start-command.tsx";
import { useHostRead } from "./use-workflow.ts";

/**
 * What the workflow's errors stop (HAL-14739): **Run** is unavailable while it has any, in its own
 * file or in a file it uses, described by the problems band's first line. Warnings never stop it.
 * `errors` is the count the Problems badge shows, so **Run** comes back with the same read that
 * clears the badge, and stays as it is until the first read is in.
 */
export function useProblemsGate(errors: number) {
  const id = useId();
  return { id, errors, unavailable: errors > 0 ? { reason: id } : undefined };
}

/**
 * What the files already say stops a run (rule N5, HAL-12363): **Run** is then unavailable,
 * described by the band that says why. A read that fails leaves **Run** as it is; pressing it says
 * why. Nothing while the workflow has `errors`: the reason comes from files that are broken, and its
 * command would only fail on the same problems (HAL-14739). It comes back once they are fixed.
 */
export function useStartRefusal(host: WorkflowsHost, ref: WorkflowRef, errors: number) {
  const id = useId();
  const { load } = useHostRead(host, ref, (one, workflow) =>
    one.startRefusal === undefined ? Promise.resolve(undefined) : one.startRefusal(workflow),
  );
  const refusal = load.kind === "ready" && errors === 0 ? load.value : undefined;
  return {
    id,
    refusal,
    unavailable: refusal === undefined ? undefined : { reason: id },
  };
}

/** An agent a step names that uses a model alias the workspace doesn't have (UX check S7). */
export interface MissingAlias {
  readonly agent: WorkflowAgentChoice;
  readonly alias: string;
}

/** The first of the workflow's errors that is an agent's missing model alias, if any. */
export function missingAliasOf(problems: readonly WorkflowProblem[]): MissingAlias | undefined {
  for (const { severity, agent, modelAlias } of problems) {
    if (severity === "error" && agent !== undefined && modelAlias !== undefined) {
      return { agent, alias: modelAlias };
    }
  }
  return undefined;
}

/**
 * The band that says the workflow's errors stop it (HAL-14739), first under the header because
 * they stop every way to run it, a terminal's too: "*Support reply* can't run: it has 2 problems."
 * with **Open Problems**. When one of them is an agent's missing model alias, the next line names
 * the agent and the alias, with **Open *Writer*** (UX check S7, HAL-12412). Nothing while it has
 * none.
 */
export function ProblemsBand({
  name,
  problems: { id, errors },
  missingAlias,
  onOpen,
  openAgent,
}: {
  readonly name: string;
  readonly problems: { readonly id: string; readonly errors: number };
  readonly missingAlias?: MissingAlias | undefined;
  /** Shows Configuration's Problems, with the focus on Problems in its page list. */
  readonly onOpen: () => void;
  /** Opens the agent's page; without it the line names the agent with no link. */
  readonly openAgent?: ((agentId: string) => void) | undefined;
}) {
  if (errors === 0) return null;
  return (
    <CantRunBand
      firstLineId={id}
      firstLine={pageWords.cantRun.problems(name, errors)}
      action={{ label: startWords.openProblems, onClick: onOpen }}
    >
      {missingAlias === undefined ? null : (
        <MissingAliasLine missingAlias={missingAlias} openAgent={openAgent} />
      )}
    </CantRunBand>
  );
}

/** "*Writer* uses the model alias `smrt`, which this workspace doesn't have. …" · **Open *Writer***. */
function MissingAliasLine({
  missingAlias: { agent, alias },
  openAgent,
}: {
  readonly missingAlias: MissingAlias;
  readonly openAgent: ((agentId: string) => void) | undefined;
}) {
  const words = pageWords.cantRun;
  return (
    <span className="block" data-testid="missing-alias">
      {words.missingAlias.before(agent.name)}
      <code className="font-mono">{alias}</code>
      {words.missingAlias.after(agent.name)}
      {openAgent === undefined ? null : (
        <>
          {" "}
          <button type="button" className={inlineLinkClasses} onClick={() => openAgent(agent.id)}>
            {words.openAgent(agent.name)}
          </button>
        </>
      )}
    </span>
  );
}

/**
 * Under the bands: while the files say Studio can't start the run, a band with why and the next
 * step, with its command when it has one (C471-1); otherwise the command that starts the workflow
 * in a terminal. Nothing while there is neither.
 */
export function StartRow({
  name,
  refusal: { id, refusal },
  startCommand,
  showStartCommand,
}: {
  readonly name: string;
  readonly refusal: { readonly id: string; readonly refusal: StartRefusal | undefined };
  readonly startCommand: string | undefined;
  /** False when the page starts the run itself or the files have errors. */
  readonly showStartCommand: boolean;
}) {
  if (refusal !== undefined) {
    return (
      <CantRunBand
        firstLineId={id}
        firstLine={pageWords.cantRun.refused(name, refusal.reason)}
        testId="start-refusal"
      >
        <span className="block">{refusal.fix}</span>
        {refusal.command === undefined ? null : (
          <span className="mt-2 block">
            <CommandBox command={refusal.command} />
          </span>
        )}
      </CantRunBand>
    );
  }
  return showStartCommand ? <StartCommand command={startCommand} /> : null;
}

/**
 * One reason **Run** is unavailable, in the shape of the sandbox's can't-run Callout as a band
 * (`runs.sandbox-cant-run`, C471-1): a warning Callout across the page under the header, whose
 * first line, in strong text, describes **Run**.
 */
function CantRunBand({
  firstLineId,
  firstLine,
  action,
  testId,
  children,
}: {
  readonly firstLineId: string;
  readonly firstLine: string;
  readonly action?: { readonly label: string; readonly onClick: () => void };
  readonly testId?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div data-testid={testId} className="border-b border-border px-6 py-3 phone:px-4">
      <Callout tone="warning" {...(action && { action })}>
        <span id={firstLineId} className="block text-body-strong">
          {firstLine}
        </span>
        {children}
      </Callout>
    </div>
  );
}
