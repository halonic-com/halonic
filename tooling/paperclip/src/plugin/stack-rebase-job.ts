import type { PluginLogger, PluginSecretsClient } from "@paperclipai/plugin-sdk";
import { branchUpdateClient } from "../branch-update/write-client.ts";
import type { Fetch, GitHubGet } from "../pr-watcher/github.ts";
import {
  gitHubStackBase,
  type StackRebase,
  type StackRecord,
  triedHeads,
} from "../pr-watcher/stack-rebase.ts";
import type { GitHubQuery } from "../snapshot/graphql.ts";
import type { StateApi } from "../snapshot/store.ts";

/**
 * The stack rebase's settings and its tried heads (HAL-18031). Off unless
 * the board turns `stackRebase` on and sets `branchUpdateToken`. The token
 * stays a secret reference: it is resolved at each rebase, inside the write
 * client, and never kept in state, settings or logs.
 */

/** The secret reference of the branch credential. */
export type SecretRef = { readonly type: "secret_ref"; readonly secretId: string };

/** The stack rebase's own settings. */
export interface StackRebaseSettings {
  /** The kill switch: off by default, until the board turns it on. */
  readonly enabled: boolean;
  readonly token: SecretRef | undefined;
}

/** Reads them; anything odd leaves it off. */
export function readStackRebaseSettings(
  config: Readonly<Record<string, unknown>>,
): StackRebaseSettings {
  const token = config["branchUpdateToken"] as { type?: unknown; secretId?: unknown } | undefined;
  return {
    enabled: config["stackRebase"] === true,
    token:
      token?.type === "secret_ref" && typeof token.secretId === "string"
        ? { type: "secret_ref", secretId: token.secretId }
        : undefined,
  };
}

function key(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "pr-watcher",
    stateKey: "stack-rebase",
  } as const;
}

function records(stored: unknown): StackRecord[] {
  const list = (stored as { records?: unknown } | null)?.records;
  return Array.isArray(list)
    ? list.filter(
        (record): record is StackRecord =>
          typeof record?.key === "string" &&
          typeof record.pull === "string" &&
          typeof record.from === "string" &&
          typeof record.baseHead === "string",
      )
    : [];
}

/** What the job hands over: its context, the pass's readers and the repository it may write to. */
export interface StackRebaseJob {
  readonly ctx: StateApi & {
    readonly secrets: Pick<PluginSecretsClient, "resolve">;
    readonly logger: Pick<PluginLogger, "info" | "error">;
  };
  readonly companyId: string;
  readonly settings: StackRebaseSettings;
  readonly fetch: Fetch;
  readonly get: GitHubGet;
  readonly query: GitHubQuery;
  readonly repo: string;
}

/** The stack rebase for one pass, or undefined while it is off. */
export async function stackRebaseOf(job: StackRebaseJob): Promise<StackRebase | undefined> {
  const { ctx, companyId, settings } = job;
  const ref = settings.token;
  if (!settings.enabled) {
    return undefined;
  }
  if (ref === undefined) {
    ctx.logger.error("PR watcher: stack rebase is on but no branch token is set, so it's off.", {
      companyId,
    });
    return undefined;
  }
  const tried = triedHeads(records(await ctx.state.get(key(companyId))), (kept) =>
    ctx.state.set(key(companyId), { version: 1, records: kept }),
  );
  const client = branchUpdateClient({
    fetch: job.fetch,
    get: job.get,
    token: () => ctx.secrets.resolve(ref, { companyId }),
    repos: [job.repo],
  });
  return {
    find: gitHubStackBase(job.query, job.get),
    rebase: ({ repo, number, head }) => client.rebase({ repo, number, head }),
    tried,
  };
}
