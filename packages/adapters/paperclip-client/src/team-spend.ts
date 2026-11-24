import type { AgentSpend, Money, SpendRange, SpendSummary, TokenCount } from "@halonicjs/ports";
import type { PaperclipIds } from "./ids.ts";
import { asRecord, asRecords, field, type JsonRecord, text } from "./json.ts";

/** Paperclip keeps every cost in US cents. */
const currency = "USD";

/** The answers one spend read is made from. */
export interface SpendAnswers {
  /** `costs/summary`: paid cents, the company's budget and the runs not priced yet. */
  summary: unknown;
  /** `costs/by-provider`: tokens of every billing type, subscription included. */
  byProvider: unknown;
}

/** The answers one agent spend read is made from. */
export interface AgentSpendAnswers {
  byAgent: unknown;
  byAgentModel: unknown;
  budgets: unknown;
}

/** What the spend mappers need besides the answers. */
export interface SpendContext {
  ids: PaperclipIds;
  range: SpendRange;
  /** When the answers were read: Paperclip's cost routes carry no time of their own. */
  asOf: string;
}

/**
 * Where range `range` starts, in UTC: today from midnight, the week as the
 * last 7 days, the month from the 1st, as Paperclip's monthly budgets count.
 */
export function rangeStart(range: SpendRange, now: Date): string {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const starts: Readonly<Record<SpendRange, number>> = {
    today: day,
    week: now.getTime() - 7 * 24 * 60 * 60 * 1000,
    month: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  };
  return new Date(starts[range]).toISOString();
}

/** A number field, or 0 when it is missing or not a finite number. */
function count(record: JsonRecord | undefined, name: string): number {
  const value = field(record, name);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Whole cents: Paperclip's costs carry fractions of a cent. */
function money(cents: number): Money {
  return { cents: Math.round(cents), currency };
}

/** A row's tokens. A subscription row's tokens are in these totals too, at a cost of 0. */
function tokensOf(record: JsonRecord): TokenCount {
  return {
    input: count(record, "inputTokens"),
    cached: count(record, "cachedInputTokens"),
    output: count(record, "outputTokens"),
  };
}

function addTokens(total: TokenCount, more: TokenCount): TokenCount {
  return {
    input: total.input + more.input,
    cached: total.cached + more.cached,
    output: total.output + more.output,
  };
}

const noTokens: TokenCount = { input: 0, cached: 0, output: 0 };

/** The company's spend for the context's range: paid money only, and the tokens of all work. */
export function toSpendSummary(context: SpendContext, answers: SpendAnswers): SpendSummary {
  const summary = asRecord(answers.summary);
  const budgetCents = count(summary, "budgetCents");
  const tokens = asRecords(answers.byProvider).map(tokensOf).reduce(addTokens, noTokens);
  return {
    source: context.ids.source(),
    range: context.range,
    asOf: context.asOf,
    paid: money(count(summary, "spendCents")),
    tokens,
    ...(budgetCents > 0 ? { budget: money(budgetCents) } : {}),
    unpricedRuns: count(summary, "pendingRunCount"),
  };
}

/** Each agent's monthly budget in cents, from the active agent policies of `budgets/overview`. */
function agentBudgets(budgets: unknown): ReadonlyMap<string, number> {
  const policies = asRecords(field(asRecord(budgets), "policies"));
  return new Map(
    policies.flatMap((policy) => {
      const agent = text(policy, "scopeId");
      const monthly =
        text(policy, "scopeType") === "agent" &&
        text(policy, "metric") === "billed_cents" &&
        text(policy, "windowKind") === "calendar_month_utc";
      const amount = count(policy, "amount");
      return monthly && agent !== undefined && amount > 0 ? [[agent, amount] as const] : [];
    }),
  );
}

/** Each agent's tokens by model, summed over providers and billing types. */
function modelsByAgent(byAgentModel: unknown): ReadonlyMap<string, Map<string, TokenCount>> {
  const byAgent = new Map<string, Map<string, TokenCount>>();
  for (const row of asRecords(byAgentModel)) {
    const agent = text(row, "agentId");
    const model = text(row, "model");
    if (agent === undefined || model === undefined) {
      continue;
    }
    const models = byAgent.get(agent) ?? new Map<string, TokenCount>();
    models.set(model, addTokens(models.get(model) ?? noTokens, tokensOf(row)));
    byAgent.set(agent, models);
  }
  return byAgent;
}

/** Every agent's spend for the context's range, with its tokens by model and its budget. */
export function toAgentSpend(context: SpendContext, answers: AgentSpendAnswers): AgentSpend[] {
  const budgets = agentBudgets(answers.budgets);
  const models = modelsByAgent(answers.byAgentModel);
  return asRecords(answers.byAgent).flatMap((row) => {
    const agent = text(row, "agentId");
    if (agent === undefined) {
      return [];
    }
    const budget = budgets.get(agent);
    const spend: AgentSpend = {
      agent: context.ids.make("agent", agent),
      source: context.ids.source(),
      range: context.range,
      paid: money(count(row, "costCents")),
      tokens: tokensOf(row),
      tokensByModel: [...(models.get(agent) ?? new Map<string, TokenCount>())].map(
        ([model, tokens]) => ({ model, tokens }),
      ),
      ...(budget === undefined ? {} : { budget: money(budget) }),
    };
    return [spend];
  });
}
