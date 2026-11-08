import type { ServiceKey } from "./service-key.ts";
import { ShellError } from "./shell-error.ts";
import type { Studio } from "./studio.ts";

/** What a feature author writes; see {@link defineFeature}. */
export interface FeatureDefinition {
  /** Unique, lowercase, words joined by `-`, such as `agents` or `run-history`. */
  readonly id: string;
  /** The name people see, such as "Agents". */
  readonly title: string;
  /** Services this feature uses. Each must be provided by one other feature or by the app. */
  readonly needs?: readonly ServiceKey<unknown>[];
  /** Services this feature offers; `register` must provide each one. */
  readonly provides?: readonly ServiceKey<unknown>[];
  /**
   * Adds the feature's contributions. Runs once, when the shell is created,
   * after every feature it needs has registered.
   */
  register(studio: Studio): void;
}

/** A checked feature, ready to hand to `createShell`. */
export interface Feature {
  readonly id: string;
  readonly title: string;
  readonly needs: readonly ServiceKey<unknown>[];
  readonly provides: readonly ServiceKey<unknown>[];
  register(studio: Studio): void;
}

const featureIdPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Declares a Studio feature. A feature's `feature.ts` exports exactly one;
 * it is the only file the shell sees.
 *
 * @throws ShellError when the id isn't lowercase words joined by `-`, or a
 *   service is listed twice in `needs` or `provides`
 *
 * @example
 * export const agentsFeature = defineFeature({
 *   id: "agents",
 *   title: "Agents",
 *   needs: [WorkspaceService],
 *   provides: [AgentsService],
 *   register(studio) {
 *     studio.services.provide(AgentsService, (services) => createAgents(services.get(WorkspaceService)));
 *   },
 * });
 */
export function defineFeature(definition: FeatureDefinition): Feature {
  if (!featureIdPattern.test(definition.id)) {
    throw new ShellError(
      `The feature id "${definition.id}" is not valid. Use lowercase words joined by "-", such as "run-history".`,
    );
  }
  const needs = definition.needs ?? [];
  const provides = definition.provides ?? [];
  rejectRepeats(definition.id, "needs", needs);
  rejectRepeats(definition.id, "provides", provides);
  return Object.freeze({
    id: definition.id,
    title: definition.title,
    needs: Object.freeze([...needs]),
    provides: Object.freeze([...provides]),
    register: (studio: Studio) => definition.register(studio),
  });
}

function rejectRepeats(
  featureId: string,
  listName: string,
  keys: readonly ServiceKey<unknown>[],
): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key.name)) {
      throw new ShellError(
        `The feature "${featureId}" lists the service "${key.name}" twice in ${listName}. List it once.`,
      );
    }
    seen.add(key.name);
  }
}
