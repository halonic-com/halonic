/**
 * The part of a workflow hard rule 7 reads: its id and the alias each step's
 * variant runs on. The router's full `Workflow` (architecture note section 2a)
 * has this shape, so it passes in unchanged.
 */
export interface WorkflowAliases {
  readonly workflowId: string;
  readonly steps: readonly { readonly variant: { readonly model: string } }[];
}

/** A workflow hard rule 7 removed, and the unhealthy aliases its steps are on. */
export interface HealthRuleHit {
  readonly workflowId: string;
  readonly unhealthyAliases: readonly string[];
}

/** What is left after hard rule 7, and what it removed. */
export interface HealthRuleResult<W extends WorkflowAliases> {
  readonly allowed: readonly W[];
  readonly removed: readonly HealthRuleHit[];
}

/**
 * Hard rule 7 (architecture note section 4): removes every workflow with any
 * step on an alias the health check has taken out. It never swaps the step for
 * another alias, because the result would be an untested workflow (2a). When
 * nothing is left, the router gives the task the fallback, which is never a
 * cheaper or open model.
 *
 * @example
 * const { allowed } = removeUnhealthyWorkflows(workflows, (alias) => health.isHealthy(alias, now));
 */
export function removeUnhealthyWorkflows<W extends WorkflowAliases>(
  workflows: readonly W[],
  isHealthy: (alias: string) => boolean,
): HealthRuleResult<W> {
  const allowed: W[] = [];
  const removed: HealthRuleHit[] = [];
  for (const workflow of workflows) {
    const unhealthy = unhealthyAliasesOf(workflow, isHealthy);
    if (unhealthy.length === 0) {
      allowed.push(workflow);
    } else {
      removed.push({ workflowId: workflow.workflowId, unhealthyAliases: unhealthy });
    }
  }
  return { allowed, removed };
}

function unhealthyAliasesOf(
  workflow: WorkflowAliases,
  isHealthy: (alias: string) => boolean,
): string[] {
  const aliases = new Set(workflow.steps.map((step) => step.variant.model));
  return [...aliases].filter((alias) => !isHealthy(alias)).sort();
}
