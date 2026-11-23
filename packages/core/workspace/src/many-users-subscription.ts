// A harness agent with no provider key runs on its program's own sign-in,
// which the workspace's owner pays for with their subscription. With
// `users.mode: many` other people start its runs, so that sign-in would pay
// for them: the workspace check, the deploy and the run start each refuse it
// with the one code here (requirement `workspace.many-users-subscription`,
// HAL-13222).

import type { Agent } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import { filesOf, type LoadedFile } from "./load-workspace.ts";
import { resolveModel } from "./resolve-model.ts";

/** The code the check, the deploy and the run start give for a harness agent that would use the owner's sign-in. */
export const manyUsersSubscriptionCode = "users-many-subscription";

/** A harness that starts a program, which has a sign-in of its own. */
type ProgramHarness = Exclude<NonNullable<Agent["harness"]>, "halonic">;

/**
 * The provider file types that give each program a key: its own type, and
 * for an alias also the types that speak its API, as the host's access rules
 * read them (`harness-host.provider-access`).
 */
const keyTypes: Record<
  ProgramHarness,
  { readonly own: string; readonly alias: readonly string[] }
> = {
  "claude-code": { own: "anthropic", alias: ["anthropic"] },
  codex: { own: "openai", alias: ["openai", "openai-compatible"] },
};

/** A harness agent whose runs would use its program's own sign-in. */
export interface SignInAgent {
  /** The agent file's path. */
  readonly file: string;
  readonly id: string;
  readonly harness: ProgramHarness;
  /** The provider file type that would give it a key. */
  readonly providerType: string;
}

/**
 * The harness agents with no provider key to run on: their `model` is no
 * alias of a keyed provider of a type the program calls, and no provider of
 * the program's own type has a `secret`. Where it runs doesn't matter: with
 * many users, the host gives no agent its program's sign-in.
 *
 * @example
 * signInAgents(workspace.files);
 * // [{ file: "agents/writer.agent.yaml", id: "writer", harness: "claude-code", providerType: "anthropic" }]
 */
export function signInAgents(files: readonly LoadedFile[]): SignInAgent[] {
  const workspace = { files };
  const providers = filesOf(workspace, "provider").map((file) => file.value);
  const keyed = (id: string, types: readonly string[]) =>
    providers.some(
      (file) => file.id === id && file.secret !== undefined && types.includes(file.type),
    );
  return filesOf(workspace, "agent").flatMap((agent) => {
    const { harness, model, id } = agent.value;
    if (harness === undefined || harness === "halonic") return [];
    const types = keyTypes[harness];
    const target = model === undefined ? undefined : resolveModel(workspace, agent.hub, model);
    if (target?.alias !== undefined && keyed(target.provider, types.alias)) return [];
    if (providers.some((file) => file.type === types.own && file.secret !== undefined)) return [];
    return [{ file: agent.path, id, harness, providerType: types.own }];
  });
}

/** How to give an agent a key, in the words the CLI uses when a sandboxed agent may run signed out. */
export function addKeyFix(providerType: string): string {
  return `Add a provider of type ${providerType} with a secret, and save the key with halonic secret set.`;
}

/**
 * Why a deployment refuses an agent: it lets many people sign in, and the
 * agent has no key. Without an agent id it speaks of the harness's agent,
 * as the run start knows no more.
 */
export function manyUsersSubscriptionMessage(
  deployment: string,
  agent: { readonly id?: string; readonly harness: string },
): string {
  const who =
    agent.id === undefined
      ? `this ${agent.harness} agent has`
      : `agent "${agent.id}" runs in ${agent.harness} with`;
  return `Deployment "${deployment}" lets many people sign in, and ${who} no provider key, so their runs would use your own sign-in.`;
}

/**
 * A harness agent refused in a deployment that lets many people sign in,
 * because it would run on the owner's sign-in. Its `code` is the same as the
 * workspace check's; a run it stops logs its `failureCause`.
 */
export class ManyUsersSubscriptionError extends KindedError {
  readonly code = manyUsersSubscriptionCode;
  /** The cause the engine logs on `run.failed`: the code and the names it is about. */
  readonly failureCause: {
    readonly code: typeof manyUsersSubscriptionCode;
    readonly detail: Readonly<Record<"deployment" | "harness", string>>;
  };

  constructor(
    message: string,
    detail: { readonly deployment: string; readonly harness: string },
    fix?: string,
  ) {
    super("invalid_input", message, fix === undefined ? {} : { fix });
    this.failureCause = { code: manyUsersSubscriptionCode, detail: { ...detail } };
  }
}
