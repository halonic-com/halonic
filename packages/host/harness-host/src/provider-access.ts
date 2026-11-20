// Which access a harness agent's bridge gets to its model provider
// (requirement `harness-host.provider-access`, HAL-12784). A pure function of
// the agent's harness, where it runs and the workspace's provider files, so
// the CLI and the Studio decide the same way. It reads no secret: the host
// checks that the chosen secret holds a value before the bridge opens.

import type { ProgramHarness } from "@halonicjs/engine";
import type { BridgeProvider } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";

/** The provider each harness program calls: Claude Code calls Anthropic, Codex calls OpenAI. */
const providerOfHarness: Record<ProgramHarness, BridgeProvider> = {
  "claude-code": "anthropic",
  codex: "openai",
};

/** Each provider's name as people know it, for messages. */
const providerNames: Record<BridgeProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

/** What the rules read of a provider file (`providers/<id>.yaml`). */
export interface AccessProviderFile {
  readonly id: string;
  readonly type: string;
  readonly secret?: string | undefined;
  readonly baseUrl?: string | undefined;
}

/** What {@link providerAccessOf} decides from. */
export interface ProviderAccessInput {
  readonly harness: ProgramHarness;
  /** Where the agent runs, as the placement policy answered for this call. */
  readonly runsOn: "sandbox" | "this-computer";
  /** The workspace's provider files. */
  readonly providers: readonly AccessProviderFile[];
  /**
   * The provider id the agent's `model` points to, once its alias is
   * resolved; `undefined` when the file names no model or the name resolves to none.
   */
  readonly modelProvider?: string;
}

/** The access the bridge gets to the provider the agent's harness calls. */
export type ProviderAccessChoice =
  | {
      readonly kind: "sign-in";
      readonly provider: BridgeProvider;
      /**
       * Why: `this-computer`, where the program's own sign-in works; or
       * `no-keyed-provider`, a sandboxed agent in a workspace with no provider
       * of that type with a `secret`, which then runs signed out.
       */
      readonly reason: "this-computer" | "no-keyed-provider";
    }
  | {
      readonly kind: "key";
      readonly provider: BridgeProvider;
      /** The provider file the key comes from. */
      readonly providerId: string;
      /** The name of the secret that holds the key, never its value. */
      readonly secret: string;
      /** The file's `baseUrl`; left out, the calls and the key go to the type's own address. */
      readonly baseUrl?: string;
    };

/**
 * The access one harness agent's bridge gets:
 *
 * 1. On this computer, the program's own sign-in, which works there and
 *    spends nothing.
 * 2. In the sandbox, the key of a provider of the harness's type that has a
 *    `secret`: the one the agent's `model` points to, else the only one.
 * 3. In the sandbox with no such provider, the program's own sign-in, as
 *    before: the host says how to add one.
 *
 * @throws KindedError `invalid_input` when the workspace has several such
 *   providers and the agent's model points to none of them; the message names them
 *
 * @example
 * providerAccessOf({ harness: "claude-code", runsOn: "sandbox", providers: [{ id: "claude", type: "anthropic", secret: "anthropic-key" }] });
 * // { kind: "key", provider: "anthropic", providerId: "claude", secret: "anthropic-key" }
 */
export function providerAccessOf(input: ProviderAccessInput): ProviderAccessChoice {
  const provider = providerOfHarness[input.harness];
  if (input.runsOn === "this-computer") {
    return { kind: "sign-in", provider, reason: "this-computer" };
  }
  const keyed = input.providers.filter(
    (file): file is AccessProviderFile & { secret: string } =>
      file.type === provider && file.secret !== undefined,
  );
  const chosen =
    keyed.find((file) => file.id === input.modelProvider) ??
    (keyed.length === 1 ? keyed[0] : undefined);
  if (chosen !== undefined) {
    return {
      kind: "key",
      provider,
      providerId: chosen.id,
      secret: chosen.secret,
      ...(chosen.baseUrl === undefined ? {} : { baseUrl: chosen.baseUrl }),
    };
  }
  if (keyed.length === 0) {
    return { kind: "sign-in", provider, reason: "no-keyed-provider" };
  }
  const name = providerNames[provider];
  const ids = keyed.map((file) => file.id).join(", ");
  throw new KindedError(
    "invalid_input",
    `The workspace has several ${name} providers with a key (${ids}), and the agent's model points to none of them, so Halonic doesn't know whose key the sandboxed agent may spend. Set the agent's model to one of them, such as "${keyed[0]?.id}/<model>".`,
  );
}
