import type { ServiceRegistry } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { RunStartHostService } from "@halonicjs/studio-feature-runs/api";
import type { WorkflowsHost } from "@halonicjs/studio-feature-workflows/api";

/** What {@link provideRunStart} starts and cancels runs with. */
export interface RunStartParts {
  /** The workflows of the open folder, whose `startRun` the workflow page's **Run** calls. */
  readonly workflows: Pick<WorkflowsHost, "startRun">;
  /** The engine that runs the folder: the page's own, or the background engine. */
  readonly engine: { cancel(runId: string): Promise<RunSummary> };
  readonly askTrust: () => Promise<"trusted" | "declined">;
  /** The window's trust, which the status bar's **Review** changes too. */
  readonly trust?: { subscribe(listener: () => void): () => void; mayStartNow(): boolean };
}

/**
 * Provides the run page's way to start a run (**Run again**) the way the workflow page's Run does,
 * and to cancel one on the engine that runs it. A folder whose workflows can't start a run gets
 * neither.
 */
export function provideRunStart(
  services: ServiceRegistry,
  { workflows, engine, askTrust, trust }: RunStartParts,
): void {
  const { startRun } = workflows;
  if (startRun === undefined) return;
  services.provide(RunStartHostService, {
    startRun: ({ hubId, workflowId }, input) =>
      startRun.call(workflows, { hubId, id: workflowId }, input),
    askTrust,
    // The status bar's Review trusts the workspace too; the page's refusal then goes (C552).
    ...(trust === undefined
      ? {}
      : {
          onTrusted: (listener: () => void) =>
            trust.subscribe(() => {
              if (trust.mayStartNow()) listener();
            }),
        }),
    cancelRun: async (runId) => {
      await engine.cancel(runId);
    },
  });
}
