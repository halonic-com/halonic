import { createPbkdf2ChainHasher } from "@halonicjs/adapter-password-pbkdf2";
import type { PasswordHasher } from "@halonicjs/ports";
import type { RuntimeEnv } from "./env.ts";
import { missingConfiguration } from "./runtime.ts";

/** The name of the variable `halonic deploy` sets, per upload, to open the self-test route. */
export const selfTestTokenVariable = "HALONIC_SELFTEST_TOKEN";

/** How many times the sign-in check verifies a password: the free plan's CPU limit shows after several, not one (HAL-6804). */
export const signInRuns = 5;

/** What the self-test answers: names and booleans, never a message or a value. */
export interface SelfTestReport {
  readonly ok: boolean;
  readonly checks: readonly { readonly name: string; readonly ok: boolean }[];
}

type SelfTestEnv = Partial<RuntimeEnv> & { readonly [selfTestTokenVariable]?: unknown };

/** The check that throws counts as failed; what it threw is dropped, so nothing leaks. */
async function attempt(name: string, check: () => Promise<boolean>) {
  try {
    return { name, ok: await check() };
  } catch {
    return { name, ok: false };
  }
}

/** Runs the checks against the Worker's own bindings. */
export async function runSelfTest(
  env: SelfTestEnv,
  passwords: PasswordHasher = createPbkdf2ChainHasher(),
): Promise<SelfTestReport> {
  const checks = [
    await attempt("configuration", async () => (await missingConfiguration(env)).length === 0),
    await attempt("database", async () => {
      const row = await (env.DB as D1Database).prepare("SELECT 1 AS one").first<{ one: number }>();
      return row?.one === 1;
    }),
    await attempt("blobs", async () => {
      await (env.BLOBS as R2Bucket).head("self-test/none");
      return true;
    }),
    await attempt("sign-in", async () => {
      const stored = await passwords.hash("self-test password");
      for (let run = 0; run < signInRuns; run += 1) {
        if (!(await passwords.verify("self-test password", stored))) return false;
      }
      return true;
    }),
  ];
  return { ok: checks.every((check) => check.ok), checks };
}

function sameBytes(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Answers `/self-test`, or `undefined` when the path isn't open: without the
 * token variable the route doesn't exist, so a live deployment that never had
 * it answers 404 like any unknown path.
 */
export async function answerSelfTest(
  request: Request,
  env: SelfTestEnv,
  passwords?: PasswordHasher,
): Promise<Response | undefined> {
  const token = env[selfTestTokenVariable];
  if (typeof token !== "string" || token === "") return undefined;
  if (request.method !== "POST") {
    return Response.json(
      { code: "method_not_allowed", message: "This address only answers POST." },
      { status: 405, headers: { allow: "POST" } },
    );
  }
  const given = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (given === undefined || !sameBytes(given, token)) {
    return Response.json(
      { code: "unauthorized", message: "The self-test needs the deploy token." },
      { status: 401 },
    );
  }
  return Response.json(await runSelfTest(env, passwords), {
    headers: { "cache-control": "no-store" },
  });
}
