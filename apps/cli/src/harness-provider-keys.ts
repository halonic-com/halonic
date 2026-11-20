// What each harness agent's bridge serves in the CLI (HAL-12784): the access
// `providerAccessOf` decides, the prices of the chosen provider's models, no
// Halonic tools, and approvals that refuse. For a key, the bridge reads its
// value itself, through `bridgeSecrets`, which answers only the secrets the
// workspace's provider files name and remembers each value it hands out, so
// the bridge's failures are scrubbed of it before the run log gets them.
// The program never sees the value: the bridge puts it in place of the
// program's own key, only on calls to the chosen provider's address.

import { keyDestination } from "@halonicjs/adapter-workspace-models";
import {
  type BridgeAgent,
  type BridgeServices,
  type ProviderAccessChoice,
  providerAccessOf,
  refusingApprovals,
} from "@halonicjs/host-harness-host";
import type {
  BridgeProvider,
  BridgeProviderAccess,
  KeyOrigins,
  ModelPrice,
  Secrets,
} from "@halonicjs/ports";
import { KindedError, SecretScrubber } from "@halonicjs/std";
import {
  definitionsOf,
  filesOf,
  type LoadedWorkspace,
  modelPrice,
  resolveModel,
} from "@halonicjs/workspace";

/** What {@link HarnessProviderKeys} reads. */
export interface HarnessProviderKeysInput {
  /** The workspace the engine runs now, for its provider files and model aliases. */
  workspace(): LoadedWorkspace;
  /** The CLI's remembered secrets, never a raw adapter (`apps/cli/AGENTS.md`). */
  readonly secrets: Secrets;
  /** The addresses each saved key may be sent to. */
  readonly keyOrigins: KeyOrigins;
  /** Whether the command's trust check granted trust, so a key may go to a provider's own `baseUrl`. */
  readonly trusted: boolean;
  /** Hears the access each agent's bridge got, by provider and secret name, never a value. */
  reportAccess?(agent: BridgeAgent, choice: ProviderAccessChoice): void;
}

/** The program's own sign-in: Halonic never reads it and spends nothing on it. */
const signIn: BridgeProviderAccess = { kind: "sign-in" };

/**
 * The bridge services of the CLI's harness agents, and the secrets and the
 * scrub the bridge server is built with.
 *
 * @example
 * const keys = new HarnessProviderKeys({ workspace, secrets, keyOrigins, trusted: true });
 * new NodeHarnessBridgeServer({ secrets: keys.bridgeSecrets, fetch });
 * harnessHostOf({ services: keys, scrub: keys.scrub, ... });
 */
export class HarnessProviderKeys {
  readonly #input: HarnessProviderKeysInput;
  readonly #scrubber = new SecretScrubber();

  /**
   * What the bridge server reads keys from: only a secret a provider file of
   * the workspace names, else nothing, so the bridge can't read any other
   * secret the CLI keeps. Each value it hands out is remembered for {@link scrub}.
   */
  readonly bridgeSecrets: Secrets = {
    get: async (name) => {
      if (!this.#providerSecrets().has(name)) return null;
      const value = await this.#input.secrets.get(name);
      if (value !== null) this.#scrubber.remember(value);
      return value;
    },
  };

  /** Removes every key value the bridge was handed from a text. */
  readonly scrub = (text: string): string => this.#scrubber.scrub(text);

  constructor(input: HarnessProviderKeysInput) {
    this.#input = input;
  }

  /**
   * What the agent's bridge serves (requirement `cli.harness-provider-key`).
   * For a key, it checks the key may go to the provider's address and that
   * its value is saved before the bridge opens, so the program never starts
   * without a way to call its model. The run log keeps only an error's
   * message, so each message ends with what to do.
   *
   * @throws KindedError `invalid_input` from `providerAccessOf`, or when the
   *   key may not go to the provider's address, or its secret holds no value
   */
  async servicesFor(agent: BridgeAgent): Promise<BridgeServices> {
    const workspace = this.#input.workspace();
    const modelProvider =
      agent.model === undefined
        ? undefined
        : resolveModel(workspace, agent.hubId ?? null, agent.model)?.provider;
    const choice = providerAccessOf({
      harness: agent.harness,
      runsOn: agent.runsOn,
      providers: filesOf(workspace, "provider").map((file) => file.value),
      ...(modelProvider === undefined ? {} : { modelProvider }),
    });
    if (choice.kind === "key") await this.#requireKeyMayGo(choice);
    this.#input.reportAccess?.(agent, choice);
    return {
      providers: { anthropic: signIn, openai: signIn, [choice.provider]: accessOf(choice) },
      prices: choice.kind === "key" ? pricesOf(workspace, agent.hubId, choice) : {},
      tools: {
        list: async () => [],
        check: async (name) => ({ kind: "refused", reason: `${name} isn't a tool of this agent.` }),
        call: async (name) => ({ result: `${name} isn't a tool of this agent.`, outcome: "error" }),
      },
      approvals: refusingApprovals,
    };
  }

  /**
   * The checks a model call makes before it sends a saved key (HAL-11342,
   * HAL-11871), then that the key's value is saved. Reading it through
   * {@link bridgeSecrets} remembers it for {@link scrub} before the bridge opens.
   */
  async #requireKeyMayGo(choice: ProviderAccessChoice & { kind: "key" }): Promise<void> {
    const destination = keyDestination({
      id: choice.providerId,
      type: choice.provider,
      secret: choice.secret,
      ...(choice.baseUrl === undefined ? {} : { baseUrl: choice.baseUrl }),
    });
    if (destination !== undefined && !destination.isDefault && !this.#input.trusted) {
      throw new KindedError(
        "invalid_input",
        `Provider ${choice.providerId} would send its key to ${destination.origin}, and this workspace isn't trusted on this computer. Check providers/${choice.providerId}.yaml, then trust the workspace, or point it at the type's own address.`,
      );
    }
    const allowed = await this.#input.keyOrigins.allowedOrigins(choice.secret);
    if (
      destination !== undefined &&
      allowed !== undefined &&
      !allowed.includes(destination.origin)
    ) {
      throw new KindedError(
        "invalid_input",
        `Provider "${choice.providerId}" can't send key "${choice.secret}" to ${destination.origin}. That address isn't allowed for this key. To allow it, run: halonic models allow-address "${choice.secret}" ${destination.origin}`,
      );
    }
    if ((await this.bridgeSecrets.get(choice.secret)) === null) {
      throw new KindedError(
        "invalid_input",
        `The secret "${choice.secret}" that holds provider ${choice.providerId}'s key isn't saved on this computer, so the sandboxed agent can't call its model. Save it with: halonic secret set ${choice.secret}`,
      );
    }
  }

  /** The secret names the workspace's provider files name, read anew on every call. */
  #providerSecrets(): ReadonlySet<string> {
    const names = new Set<string>();
    for (const file of filesOf(this.#input.workspace(), "provider")) {
      if (file.value.secret !== undefined) names.add(file.value.secret);
    }
    return names;
  }
}

/** The bridge's access for the choice. */
function accessOf(choice: ProviderAccessChoice): BridgeProviderAccess {
  if (choice.kind === "sign-in") return signIn;
  return {
    kind: "key",
    secret: choice.secret,
    providerId: choice.providerId,
    ...(choice.baseUrl === undefined ? {} : { baseUrl: choice.baseUrl }),
  };
}

/**
 * The prices of the chosen provider's models, from the hub's model aliases
 * that have one, so a keyed call is logged with its cost. A model no alias
 * prices is logged as unpriced.
 */
function pricesOf(
  workspace: LoadedWorkspace,
  hubId: string | undefined,
  choice: ProviderAccessChoice & { kind: "key" },
): Partial<Record<BridgeProvider, Readonly<Record<string, ModelPrice>>>> {
  if (hubId === undefined) return {};
  const prices: Record<string, ModelPrice> = {};
  for (const target of Object.values(definitionsOf(workspace, hubId).models)) {
    if (target.provider === choice.providerId && target.price !== undefined) {
      prices[target.model] = modelPrice(target.price);
    }
  }
  return { [choice.provider]: prices };
}
