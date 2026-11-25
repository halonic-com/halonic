import { parseScope, type Scope, scopeName } from "@halonicjs/host-server";
import type { AdminRoute } from "./admin.ts";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";
import { createRuntime, scopedKeyPrefix } from "./runtime.ts";

/** What a scope's deletion did. */
export interface ScopeDeletion {
  /** How many runs the scope's run list named, each of whose objects was erased. */
  readonly runs: number;
}

/** A delete refused because the scope's usage rows haven't gone to Cloud yet; nothing was erased. */
export class UsageUnsentError extends Error {
  /** How many rows wait. */
  readonly unsent: number;

  constructor(unsent: number) {
    super(`${unsent} usage rows of the scope wait to go to Cloud.`);
    this.name = "UsageUnsentError";
    this.unsent = unsent;
  }
}

/** The stores of one scope, as a delete erases them. */
export interface ScopeStores {
  readonly runs: {
    /** Every run id of the scope, a claimed run's that has published nothing yet included. */
    runIds(): Promise<readonly string[]>;
    eraseScope(): Promise<void>;
  };
  readonly records: { eraseScope(): Promise<void> };
  readonly blobs: { eraseAll(): Promise<void> };
  eraseRunObject(runId: string): Promise<void>;
  eraseCoordination(): Promise<void>;
  eraseRoutines(): Promise<void>;
  /** Erases the usage object unless rows wait to go to Cloud; answers how many wait. */
  eraseUsage(): Promise<{ readonly unsent: number }>;
}

/**
 * Erases every store of one scope. The run list is read first and erased last, so a delete that
 * fails halfway finds the same runs when it is run again; running it again is always safe. The
 * usage object goes first: while its rows haven't gone to Cloud, nothing is erased. Erasing it also
 * wipes the pushed limits, so a run left in a half-deleted scope fails closed with `noLimits`; keep
 * this order.
 *
 * @throws UsageUnsentError when usage rows wait to go to Cloud
 */
export async function eraseScopeStores(stores: ScopeStores): Promise<ScopeDeletion> {
  const { unsent } = await stores.eraseUsage();
  if (unsent > 0) throw new UsageUnsentError(unsent);
  const runIds = await stores.runs.runIds();
  for (const runId of runIds) await stores.eraseRunObject(runId);
  await stores.eraseCoordination();
  await stores.eraseRoutines();
  await stores.blobs.eraseAll();
  await stores.records.eraseScope();
  await stores.runs.eraseScope();
  return { runs: runIds.length };
}

/**
 * Deletes every stored thing of one scope from every binding, and nothing of another scope: the
 * objects of the runs its run list names, its coordination and routines objects, its blobs, its
 * records (the sign-in tokens' included) and its run list rows ({@link eraseScopeStores}).
 *
 * It finds a run's object through the run list, which names a run from its claim on, before
 * anything calls the run's object. Known limit: a run's alarm that is already running when its
 * object is erased can still write to it; the operator runs the delete again after a minute, which
 * erases that too.
 *
 * @throws ConfigurationError when a binding or a secret is missing
 */
export async function deleteScope(env: RuntimeEnv, scope: Scope): Promise<ScopeDeletion> {
  const name = scopeName(scope);
  const runtime = await createRuntime(env, { scope: name, sharedDefinitions: true });
  return eraseScopeStores({
    runs: runtime.runs,
    records: runtime.records,
    blobs: runtime.blobs,
    eraseRunObject: (runId) =>
      env.RUN.get(env.RUN.idFromName(`${scopedKeyPrefix(name)}${runId}`)).eraseAll(),
    eraseCoordination: () => env.COORDINATION.get(env.COORDINATION.idFromName(name)).eraseAll(),
    eraseRoutines: () => env.ROUTINES.get(env.ROUTINES.idFromName(name)).eraseAll(),
    // A Worker without the usage binding has no usage to keep.
    eraseUsage: async () =>
      env.USAGE === undefined
        ? { unsent: 0 }
        : env.USAGE.get(env.USAGE.idFromName(name)).eraseIfSent(name),
  });
}

function refusal(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status, headers: { "cache-control": "no-store" } });
}

/** Deletes a scope; only a test passes its own. */
export type DeleteScope = (env: RuntimeEnv, scope: Scope) => Promise<ScopeDeletion>;

/**
 * The admin route that deletes one scope: `POST /admin/scopes/delete?scope=u/<id>` or `o/<id>`.
 * The scope is read as a session's scope is read; anything else, or none, answers 400 `bad_scope`
 * and deletes nothing. A finished delete answers 200 `{"deleted":{"runs":n}}`, the runs it erased.
 *
 * @param remove - deletes the scope; only a test passes its own
 */
export function deleteScopeRoutes(remove: DeleteScope = deleteScope): readonly AdminRoute[] {
  return [
    {
      method: "POST",
      path: "/admin/scopes/delete",
      handler: async (request, env) => {
        const scope = parseScope(new URL(request.url).searchParams.get("scope"));
        if (scope === null) {
          return refusal(400, "bad_scope", "The scope isn't u/<id> or o/<id>.");
        }
        let deletion: ScopeDeletion;
        try {
          deletion = await remove(env, scope);
        } catch (error) {
          if (error instanceof ConfigurationError) {
            return refusal(503, "unavailable", "The server isn't ready.");
          }
          if (error instanceof UsageUnsentError) {
            return refusal(409, "usage_unsent", "Usage waits to go to Cloud; try again later.");
          }
          throw error;
        }
        return Response.json(
          { deleted: { runs: deletion.runs } },
          { status: 200, headers: { "cache-control": "no-store" } },
        );
      },
    },
  ];
}
