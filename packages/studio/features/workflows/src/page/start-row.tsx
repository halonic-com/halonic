// The row under a workflow page's header: the command that starts the workflow in a terminal, or,
// while **Run** is unavailable, why it can't start and the next step (rule N5, HAL-12363).

import { CommandBox } from "@halonicjs/studio-kit";
import { useId } from "react";
import type { StartRefusal, WorkflowRef, WorkflowsHost } from "../api.ts";
import { StartCommand } from "./start-command.tsx";
import { useHostRead } from "./use-workflow.ts";

/**
 * What the files already say stops a run (rule N5, HAL-12363): **Run** is then unavailable,
 * described by the row that says why. A read that fails leaves **Run** as it is; pressing it says why.
 */
export function useStartRefusal(host: WorkflowsHost, ref: WorkflowRef) {
  const id = useId();
  const { load } = useHostRead(host, ref, (one, workflow) =>
    one.startRefusal === undefined ? Promise.resolve(undefined) : one.startRefusal(workflow),
  );
  const refusal = load.kind === "ready" ? load.value : undefined;
  return {
    id,
    refusal,
    unavailable: refusal === undefined ? undefined : { reason: id },
  };
}

/**
 * The row under the header: the command that starts the workflow in a terminal, or, while **Run**
 * is unavailable, why and the next step, with its command when it has one. Nothing while there is
 * neither.
 */
export function StartRow({
  refusal: { id, refusal },
  startCommand,
}: {
  readonly refusal: { readonly id: string; readonly refusal: StartRefusal | undefined };
  readonly startCommand: string | undefined;
}) {
  const className =
    "flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-6 py-2 text-small text-fg-muted";
  if (refusal !== undefined) {
    return (
      <div id={id} data-testid="start-refusal" className={className}>
        <p>{`${refusal.reason} ${refusal.fix}`}</p>
        {refusal.command === undefined ? null : <CommandBox command={refusal.command} />}
      </div>
    );
  }
  return <StartCommand command={startCommand} />;
}
