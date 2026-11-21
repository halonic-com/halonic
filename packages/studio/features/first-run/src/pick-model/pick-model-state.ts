// The state of the Pick a model screen (first-run-flow 3.3) and the rules that
// follow from it: which choice the ticked option makes, and what the one
// button does. Plain functions, so `PickModel` only keeps time and order.

import type {
  ChoiceProblem,
  FirstRunKeyProvider,
  KeyProblem,
  LocalModels,
  ModelChoice,
  TestOutcome,
} from "@halonicjs/app";
import type { ModelChoiceLine, ModelChoiceSaved } from "../api.ts";

/** The three options of the screen, in the order it lists them. */
export const pickOptions = ["key", "local", "sample"] as const;

/** One of {@link pickOptions}. */
export type PickOption = (typeof pickOptions)[number];

/**
 * What the local option knows about this computer: the detection's answer,
 * `checking` while it asks, or `desktop-only` where nothing can ask, such as
 * the browser demo, so the option is drawn off.
 */
export type LocalState =
  | { readonly kind: "desktop-only" }
  | { readonly kind: "checking" }
  | LocalModels;

/**
 * What the screen says under the options after the button was pressed, one
 * row of 3.3's error table, or why Continue saved nothing:
 * - `not-a-key`, `files`, `tested`: what the test found.
 * - `line-changed`: the passed test's trust line isn't the one shown, so the
 *   screen shows the new one and Continue must be pressed again.
 * - `not-saved`: Continue failed at that step.
 * - `broke`: the service failed while testing or while saving, which it never
 *   should; the cause went to the log.
 */
export type PickMessage =
  | { readonly kind: "not-a-key"; readonly problem: KeyProblem }
  | { readonly kind: "files"; readonly problem: ChoiceProblem }
  | { readonly kind: "tested"; readonly outcome: Exclude<TestOutcome, "ok"> }
  | { readonly kind: "line-changed" }
  | {
      readonly kind: "not-saved";
      readonly failed: Extract<ModelChoiceSaved, { ok: false }>["failed"];
      readonly keySaved: boolean;
    }
  | { readonly kind: "broke"; readonly step: "test" | "save" };

/** What the one button does: test then continue, continue, or ask Ollama again. */
export type PickButton = "test-and-continue" | "continue" | "check-again";

/**
 * What the button is waiting for: a key's test, a local model's test (which
 * loads it, `slow` after 30 s), Ollama's list, or Continue saving a choice
 * whose changed trust line was shown.
 */
export type PickBusy =
  | { readonly kind: "testing-key" }
  | { readonly kind: "saving" }
  | { readonly kind: "loading-local"; readonly slow: boolean }
  | { readonly kind: "checking" };

/** What the screen finished with: Sample answers, which changes nothing, or a saved choice. */
export type PickModelDone =
  | { readonly kind: "sample" }
  | {
      readonly kind: "saved";
      readonly changes: Extract<ModelChoiceSaved, { ok: true }>["changes"];
      readonly trusted: boolean;
    };

/** Everything the Pick a model screen shows. */
export interface PickModelState {
  /** The ticked option. */
  readonly picked: PickOption;
  /** The provider the three-way switch shows. */
  readonly provider: FirstRunKeyProvider;
  /** The providers with a key saved on this computer, for "A key is saved for … · Replace". */
  readonly keySaved: ReadonlySet<FirstRunKeyProvider>;
  /** Whether Replace was pressed, so the key field shows for a provider with a saved key. */
  readonly replacing: boolean;
  /** Whether keys can't be used here (no model service, such as the browser demo): the option is off. */
  readonly keysOff: boolean;
  readonly local: LocalState;
  /** The downloaded model the local option uses, picked among several. */
  readonly localModel: string | undefined;
  /** The trust line's facts for the ticked choice; `undefined` for Sample answers or when a file stops it. */
  readonly line: ModelChoiceLine | undefined;
  readonly busy: PickBusy | undefined;
  readonly message: PickMessage | undefined;
  readonly button: PickButton;
}

/** The one small model the screen suggests and ticks first among several (HAL-8722). */
export const suggestedLocalModel = "llama3.2";

/**
 * The downloaded model the local option starts on: `llama3.2` in any size or
 * tag (the name before the `:`), otherwise the first Ollama lists.
 */
export function firstLocalModel(local: LocalState): string | undefined {
  if (local.kind === "one") return local.model;
  if (local.kind !== "several") return undefined;
  const suggested = local.models.find((model) => model.split(":")[0] === suggestedLocalModel);
  return suggested ?? local.models[0];
}

/** Whether Ollama answered with at least one downloaded model. */
export function hasLocalModel(local: LocalState): boolean {
  return local.kind === "one" || local.kind === "several";
}

/**
 * The option ticked first (3.3): the key option, unless a usable model is on
 * this computer and no key is saved; Sample answers where keys can't be used.
 */
export function firstPicked(
  keysOff: boolean,
  local: LocalState,
  keySaved: ReadonlySet<FirstRunKeyProvider>,
): PickOption {
  if (hasLocalModel(local) && keySaved.size === 0) return "local";
  return keysOff ? "sample" : "key";
}

/** The choice the ticked option makes; `undefined` for Sample answers or a local option with no model. */
export function pickedChoice(
  state: Pick<PickModelState, "picked" | "provider" | "localModel">,
): ModelChoice | undefined {
  if (state.picked === "key") return { kind: "key", provider: state.provider };
  if (state.picked === "local" && state.localModel !== undefined) {
    return { kind: "local", model: state.localModel };
  }
  return undefined;
}

/**
 * What the one button does (3.3, 8e.1): Continue for Sample answers, for a
 * provider whose saved key is kept, and after a changed trust line; Check
 * again for a local option with no model; otherwise Test and continue.
 */
export function pickButton(
  state: Pick<PickModelState, "picked" | "provider" | "keySaved" | "replacing" | "local">,
  confirming: boolean,
): PickButton {
  if (state.picked === "sample" || confirming) return "continue";
  if (state.picked === "local")
    return hasLocalModel(state.local) ? "test-and-continue" : "check-again";
  return state.keySaved.has(state.provider) && !state.replacing ? "continue" : "test-and-continue";
}

/** The wait a changed choice keeps: only a detection still running while the local option is ticked. */
export function busyAfterChange(
  state: Pick<PickModelState, "busy" | "picked">,
): PickBusy | undefined {
  return state.busy?.kind === "checking" && state.picked === "local" ? state.busy : undefined;
}

/** Whether two choices are the same option, provider and model. */
export function sameChoice(
  first: ModelChoice | undefined,
  second: ModelChoice | undefined,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

/** Whether two trust lines say the same: the same provider, secrets, host and Local only. */
export function sameLine(first: ModelChoiceLine, second: ModelChoiceLine | undefined): boolean {
  return (
    second !== undefined &&
    JSON.stringify(first.reaches) === JSON.stringify(second.reaches) &&
    first.localOnlyOff === second.localOnlyOff
  );
}
