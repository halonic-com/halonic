import { currentScenario, type Scenario } from "../forecast/scenarios.ts";

/** What `seats.forecast` reads from the plugin's settings. */
export interface ForecastSettings {
  /** API model id prefix → the per-model weekly window `/usage` shows for it, e.g. `claude-sonnet` → `Sonnet`. */
  readonly modelWindows: Readonly<Record<string, string>>;
  /** The what-ifs forecast each run after `current`, in the board's order. */
  readonly scenarios: readonly Scenario[];
}

const scenarioIdPattern = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Reads the forecast part of the settings defensively, like the seats: an
 * entry without what it needs is left out, and so is a second scenario with
 * an id already taken, or one named `current`, which every run makes itself.
 */
export function readForecastSettings(config: Readonly<Record<string, unknown>>): ForecastSettings {
  const modelWindows: Record<string, string> = {};
  for (const entry of entries(config["modelWindows"])) {
    const prefix = text(entry["modelPrefix"]);
    const window = text(entry["window"]);
    if (prefix !== undefined && window !== undefined && !(prefix in modelWindows)) {
      modelWindows[prefix] = window;
    }
  }
  const scenarios: Scenario[] = [];
  for (const entry of entries(config["scenarios"])) {
    const scenario = readScenario(entry);
    if (scenario !== undefined && !scenarios.some((taken) => taken.id === scenario.id)) {
      scenarios.push(scenario);
    }
  }
  return { modelWindows, scenarios };
}

/**
 * One scenario as the board sets it: the agents it names, the change to each
 * one's cap, the model each one runs on instead, and a factor on every
 * agent's demand. A scenario that changes nothing is left out.
 */
function readScenario(entry: Readonly<Record<string, unknown>>): Scenario | undefined {
  const id = text(entry["id"]);
  if (id === undefined || !scenarioIdPattern.test(id) || id === currentScenario.id) {
    return undefined;
  }
  const agents = Array.isArray(entry["agents"])
    ? entry["agents"].flatMap((agent) => text(agent) ?? [])
    : [];
  const capDelta = Number.isInteger(entry["capDelta"]) ? (entry["capDelta"] as number) : 0;
  const model = text(entry["model"]);
  const factor = entry["demandFactor"];
  const demandFactor = typeof factor === "number" && factor > 0 && factor <= 2 ? factor : 1;
  const changesAgents = agents.length > 0 && (capDelta !== 0 || model !== undefined);
  if (!changesAgents && demandFactor === 1) {
    return undefined;
  }
  return {
    id,
    label: text(entry["label"]) ?? id,
    capDelta: capDelta === 0 ? {} : Object.fromEntries(agents.map((agent) => [agent, capDelta])),
    modelOverride:
      model === undefined ? {} : Object.fromEntries(agents.map((agent) => [agent, model])),
    demandFactor,
  };
}

function entries(value: unknown): Readonly<Record<string, unknown>>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
      )
    : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
