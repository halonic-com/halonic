import { parseScope, type Scope, scopeName } from "@halonicjs/host-server";
import type { AdminRoute } from "./admin.ts";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";
import { createRuntime, scopedKeyPrefix } from "./runtime.ts";

/** What a scope's deletion did. */
export interface ScopeDeletion {
  /** How many runs the scope's run list named, each of whose objects was erased. */
  readonly runs: number;
}

/** The stores of one scope, as a delete erases them. */
export interface ScopeStores {
  readonly runs: {
    list(): Promise<readonly { readonly id: string }[]>;
    eraseScope(): Promise<void>;
  };
  readonly records: { eraseScope(): Promise<void> };
  readonly blobs: { eraseAll(): Promise<void> };
  eraseRunObject(runId: string): Promise<void>;
  eraseCoordination(): Promise<void>;
  eraseRoutines(): Promise<void>;
}

/**
 * Erases every store of one scope. The run list is read first and erased last, so a delete that
 * fails halfway finds the same runs when it is run again; running it again is always safe.
 */
export async function eraseScopeStores(stores: ScopeStores): Promise<ScopeDeletion> {
  const runIds = (await stores.runs.list()).map((run) => run.id);
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
 * Known limit: it finds a run's object through the run list, so the object of a run whose first
 * alarm hasn't published it yet stays. That is why the operator runs it, then runs it again after a
 * minute; a user-facing delete needs a register of the scope's objects first (S1-5).
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
 * and deletes nothing. A finished delete answers 204.
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
        try {
          await remove(env, scope);
        } catch (error) {
          if (error instanceof ConfigurationError) {
            return refusal(503, "unavailable", "The server isn't ready.");
          }
          throw error;
        }
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      },
    },
  ];
}
