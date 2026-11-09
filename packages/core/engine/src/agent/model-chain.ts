// The models one turn may use: the one its request resolved to, then that
// alias's own fallbacks. A model whose key isn't set is skipped before any
// call, so a local-only workspace never shows a pointless 401. A model that
// is offline hands the call to the next one at once: retrying would only make
// the person wait. Any other failure ends the turn with its own reason.

import {
  type ChatRequest,
  type ChatResponse,
  type ChatTurnSkip,
  isModelCallError,
  type LlmProvider,
  ModelCallError,
  type ModelCallErrorReason,
  type ModelPrice,
  type Secrets,
} from "@halonicjs/ports";
import type { TurnLog } from "./turn-log.ts";

/** The provider and model a turn goes to, with the models it falls back to. */
export interface ResolvedModel {
  readonly provider: LlmProvider;
  /** The model name at that provider. */
  readonly model: string;
  /** The alias it came from, such as "smart"; `<provider>/<model>` names it when left out. */
  readonly alias?: string;
  /**
   * The **name** of the secret that holds the provider's key, never the key.
   * Left out when the provider needs none, such as a local model.
   */
  readonly secret?: string;
  /**
   * Whether the provider runs on this machine (`local: true`), such as
   * Ollama, LM Studio or the mock model. Its calls cost 0 unless `price` is set.
   */
  readonly local?: boolean;
  /** What the model costs, from its alias in `models.yaml`. */
  readonly price?: ModelPrice;
  /**
   * The models of the alias's own `fallback` entries, in order. Only this
   * level is tried: a fallback's own fallbacks are not followed.
   */
  readonly fallback?: readonly ResolvedModel[];
}

/** A model call without its model: the chain picks the model. */
export type ChainRequest = Omit<ChatRequest, "model">;

/** A model's answer, with the model that gave it. */
export interface ChainAnswer {
  readonly response: ChatResponse;
  readonly answeredBy: ResolvedModel;
}

/** The reasons that move a call on to the next model; every other one ends the turn. */
const movesOn: readonly ModelCallErrorReason[] = ["no-key", "offline"];

/**
 * Walks a turn's models. Once a call moves on to a later model, the turn
 * stays on it: going back would only meet the same failure again.
 */
export class ModelChain {
  /** The models skipped before any call, in order. */
  readonly skipped: ChatTurnSkip[] = [];
  private readonly models: readonly ResolvedModel[];
  private readonly secrets: Secrets;
  private readonly agent: string;
  private readonly log: TurnLog | undefined;
  /** The model calls go to; it only moves forward. */
  private index = 0;
  /** Whether the model at `index` has its key, so it needs no second look. */
  private usable = false;
  /** Why the last model was given up on, for the error when none is left. */
  private lastCause: ModelCallErrorReason = "offline";
  /** The host of the last model that was offline, when its provider named it. */
  private lastHost: string | undefined;

  /**
   * @param agent - names the agent in the events the chain writes
   * @param log - where `llm.skipped` and `llm.fallback` go; a turn outside any run has none
   */
  constructor(first: ResolvedModel, secrets: Secrets, agent: string, log?: TurnLog) {
    this.models = withoutRepeats([first, ...(first.fallback ?? [])]);
    this.secrets = secrets;
    this.agent = agent;
    this.log = log;
  }

  /**
   * The model the next call goes to, after skipping the models without a key.
   *
   * @throws {ModelCallError} with the last cause when no model is left
   */
  async current(): Promise<ResolvedModel> {
    while (!this.usable) {
      const model = this.models[this.index];
      if (model === undefined) {
        throw this.noneLeft();
      }
      if (await this.hasKey(model)) {
        this.usable = true;
      } else {
        await this.skip(model);
      }
    }
    // `usable` is only true while `index` points at a model.
    return this.models[this.index] as ResolvedModel;
  }

  /**
   * Makes one model call, moving on to the next model when one has no key
   * or is offline. It writes an `llm.fallback` for each move.
   *
   * @throws {ModelCallError} with the last cause when no model is left
   * @throws whatever the model threw for any other failure; the turn stops there
   */
  async chat(request: ChainRequest): Promise<ChainAnswer> {
    for (;;) {
      const model = await this.current();
      try {
        const response = await model.provider.chat({ ...request, model: model.model });
        return { response, answeredBy: model };
      } catch (error) {
        if (!isModelCallError(error) || !movesOn.includes(error.reason)) {
          throw error;
        }
        await this.moveOn(model, error);
      }
    }
  }

  private async hasKey(model: ResolvedModel): Promise<boolean> {
    if (model.secret === undefined) {
      return true;
    }
    // Only whether it is set matters; the value goes no further.
    return (await this.secrets.get(model.secret)) !== null;
  }

  private async skip(model: ResolvedModel): Promise<void> {
    const next = this.models[this.index + 1];
    const skip: ChatTurnSkip = {
      alias: nameOf(model),
      provider: model.provider.id,
      model: model.model,
      reason: "no-key",
      ...(next === undefined ? {} : { next: nameOf(next) }),
    };
    this.skipped.push(skip);
    this.lastCause = "no-key";
    this.index++;
    await this.log?.append({ type: "llm.skipped", agent: this.agent, ...skip });
  }

  private async moveOn(from: ResolvedModel, error: ModelCallError): Promise<void> {
    this.lastCause = error.reason;
    this.lastHost = error.host;
    this.index++;
    this.usable = false;
    const to = await this.current();
    await this.log?.append({
      type: "llm.fallback",
      agent: this.agent,
      from: nameOf(from),
      to: nameOf(to),
      error: `${error.reason}: ${error.message}`,
    });
  }

  private noneLeft(): ModelCallError {
    const tried = this.models.map(nameOf).join(", ");
    const what = this.lastCause === "no-key" ? "no model has its key set" : "no model reachable";
    const message = `${what} (tried ${tried})`;
    return new ModelCallError(
      this.lastCause,
      message,
      this.lastHost === undefined ? {} : { host: this.lastHost },
    );
  }
}

/** The name a model goes by in the log: its alias, or `<provider>/<model>`. */
function nameOf(model: ResolvedModel): string {
  return model.alias ?? `${model.provider.id}/${model.model}`;
}

/** The models in order, each name once, so a fallback back to the first can't loop. */
function withoutRepeats(models: readonly ResolvedModel[]): ResolvedModel[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    const name = nameOf(model);
    if (seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
}
