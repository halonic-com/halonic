import { currentScenario, type Scenario } from "../forecast/scenarios.ts";

/** What `seats.forecast` reads from the plugin's settings. */
export interface ForecastSettings {
  /** API model id prefix → the per-model weekly window `/usage` shows for it, e.g. `claude-sonnet` → `Sonnet`. */
  readonly modelWindows: Readonly<Record<string, string>>;
  /** The what-ifs forecast each run after `current`, in the board's order. */
  readonly scenarios: readonly Scenario[];
  /**
   * How many model windows and scenarios were left out, or kept with a value
   * dropped, so the job's log can say why a scenario the board set is missing.
   */
  readonly ignoredEntries: number;
}

const scenarioIdPattern = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Reads the forecast part of the settings defensively, like the seats: an
 * entry without what it needs is left out, and so is a second scenario with
 * an id already taken, or one named `current`, which every run makes itself.
 * Each entry left out or kept with a value dropped counts as ignored.
 */
export function readForecastSettings(config: Readonly<Record<string, unknown>>): ForecastSettings {
  const windowEntries = list(config["modelWindows"]);
  const modelWindows: Record<string, string> = {};
  for (const entry of objects(windowEntries)) {
    const prefix = text(entry["modelPrefix"]);
    const window = text(entry["window"]);
    if (prefix !== undefined && window !== undefined && !(prefix in modelWindows)) {
      modelWindows[prefix] = window;
    }
  }
  const scenarioEntries = list(config["scenarios"]);
  const scenarios: Scenario[] = [];
  let corrected = 0;
  for (const entry of objects(scenarioEntries)) {
    const read = readScenario(entry);
    if (read !== undefined && !scenarios.some((taken) => taken.id === read.scenario.id)) {
      scenarios.push(read.scenario);
      corrected += read.corrected ? 1 : 0;
    }
  }
  const leftOut =
    windowEntries.length -
    Object.keys(modelWindows).length +
    (scenarioEntries.length - scenarios.length);
  return { modelWindows, scenarios, ignoredEntries: leftOut + corrected };
}

/**
 * One scenario as the board sets it: the agents it names, the change to each
 * one's cap, the model each one runs on instead, and a factor on every
 * agent's demand. A scenario that changes nothing is left out; one that keeps
 * a change but drops a cap change, model or factor it can't use is `corrected`.
 */
function readScenario(
  entry: Readonly<Record<string, unknown>>,
): { scenario: Scenario; corrected: boolean } | undefined {
  const id = text(entry["id"]);
  if (id === undefined || !scenarioIdPattern.test(id) || id === currentScenario.id) {
    return undefined;
  }
  const values = scenarioValues(entry);
  const { agents, capDelta, model, demandFactor } = values;
  const changesAgents = agents.length > 0 && (capDelta !== 0 || model !== undefined);
  if (!changesAgents && demandFactor === 1) {
    return undefined;
  }
  const scenario: Scenario = {
    id,
    label: text(entry["label"]) ?? id,
    capDelta: capDelta === 0 ? {} : Object.fromEntries(agents.map((agent) => [agent, capDelta])),
    modelOverride:
      model === undefined ? {} : Object.fromEntries(agents.map((agent) => [agent, model])),
    demandFactor,
  };
  return { scenario, corrected: droppedAValue(entry, values, changesAgents) };
}

/** The values a scenario entry sets, each one it can't use read as "no change". */
interface ScenarioValues {
  readonly agents: readonly string[];
  readonly capDelta: number;
  readonly model: string | undefined;
  readonly demandFactor: number;
}

function scenarioValues(entry: Readonly<Record<string, unknown>>): ScenarioValues {
  const factor = entry["demandFactor"];
  return {
    agents: list(entry["agents"]).flatMap((agent) => text(agent) ?? []),
    capDelta: Number.isInteger(entry["capDelta"]) ? (entry["capDelta"] as number) : 0,
    model: text(entry["model"]),
    demandFactor: typeof factor === "number" && factor > 0 && factor <= 2 ? factor : 1,
  };
}

/**
 * Whether the entry set something the scenario can't use: a demand factor
 * out of range, a cap change that isn't a whole number, or a cap change or
 * model with no agent to apply it to.
 */
function droppedAValue(
  entry: Readonly<Record<string, unknown>>,
  values: ScenarioValues,
  changesAgents: boolean,
): boolean {
  const factor = entry["demandFactor"];
  const capDelta = entry["capDelta"];
  return (
    (factor !== undefined && values.demandFactor !== factor) ||
    (capDelta !== undefined && values.capDelta !== capDelta) ||
    (!changesAgents && (values.capDelta !== 0 || values.model !== undefined))
  );
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function objects(values: readonly unknown[]): Readonly<Record<string, unknown>>[] {
  return values.filter(
    (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
  );
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
