import type { UsageLimits } from "@halonicjs/adapter-cloudflare-durable";
import { parseScope, scopeName } from "@halonicjs/host-server";
import {
  type PublicKeySet,
  readPublicKeySet,
  type TrustedKey,
  verifyRequest,
} from "@halonicjs/host-signed-request";
import { type Clock, isPlainObject, systemClock } from "@halonicjs/std";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";

/** Every limits push goes to this path, followed by the scope: `u/<id>` or `o/<id>`. */
export const limitsPushPrefix = "/cloud/limits/";

/** The Worker variable with Cloud's published public key set (JSON); public keys, not a secret. */
export const cloudKeysVariable = "HALONIC_CLOUD_KEYS";

/** The Worker variable with the product id Cloud sells this deployment as. */
export const cloudProductVariable = "HALONIC_CLOUD_PRODUCT";

/** The most bytes a limits document may have; one is a few hundred bytes per member. */
export const maxLimitsBytes = 65_536;

/** What the route asks of a scope's usage object. */
export interface LimitsPushTarget {
  rememberNonce(
    scope: string,
    keyId: string,
    nonce: string,
    keepUntilMs: number,
  ): Promise<"new" | "seen">;
  applyLimits(scope: string, limits: UsageLimits): Promise<"applied" | "stale">;
}

/** What the route verifies with, and where it hands a verified document. */
export interface LimitsPushContext {
  /** Cloud's keys, pinned in the deployment; only a `command` key verifies a push. */
  readonly keys: PublicKeySet;
  /** The product a push must be signed for. */
  readonly product: string;
  readonly clock: Clock;
  /** The usage object of a scope, named from the scope. */
  usageOf(scope: string): LimitsPushTarget;
}

const noStore = { "cache-control": "no-store" };

function refusal(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status, headers: noStore });
}

/** One answer for every check that fails, so a caller learns nothing about which one it was. */
const notSigned = () => refusal(401, "unauthorized", "The request isn't signed by Halonic Cloud.");

/**
 * `POST /cloud/limits/<scope>`: keeps a limits document Cloud pushed for one scope. The request
 * must be signed by one of Cloud's pinned `command` keys for this deployment's product, in the
 * `cloud-to-deployment` direction, inside the time window and with a nonce it hasn't used. The
 * scope is in the signed path, so this is the one place that names it; an end-user header, when
 * signed, must name the same scope. The scope's object then keeps the document unless it already
 * has that version or a newer one, and the answer says which: `{"limits":"applied"}` or
 * `{"limits":"stale"}`.
 *
 * The nonces are kept in the scope's own object: a request replayed to another scope's path fails
 * its signature, so one scope's nonces are all a replay can be checked against. Nothing reaches
 * the object before the signature holds.
 */
export async function answerLimitsPush(
  request: Request,
  context: LimitsPushContext,
): Promise<Response> {
  const scope = parseScope(new URL(request.url).pathname.slice(limitsPushPrefix.length));
  if (scope === null) {
    return refusal(404, "not_found", "There is nothing at this address.");
  }
  if (request.method !== "POST") {
    return Response.json(
      { code: "method_not_allowed", message: "This address only answers POST." },
      { status: 405, headers: { ...noStore, allow: "POST" } },
    );
  }
  const body = await readCappedBody(request, maxLimitsBytes);
  if (body === undefined) {
    return refusal(413, "too_large", "The limits document is too large.");
  }
  const name = scopeName(scope);
  const usage = context.usageOf(name);
  const verified = await verifyRequest(
    { method: request.method, url: request.url, headers: request.headers, body },
    {
      direction: "cloud-to-deployment",
      findKey: async (keyId) => trustedCommandKey(context, keyId),
      nonces: {
        remember: (keyId, nonce, keepUntil) =>
          usage.rememberNonce(name, keyId, nonce, keepUntil.getTime()),
      },
      clock: context.clock,
    },
  );
  if (!verified.ok) return notSigned();
  const { endUser } = verified.value;
  if (endUser !== undefined && endUser !== name) return notSigned();
  return applyPushed(usage, name, body);
}

/**
 * The body's bytes, or `undefined` once it goes over `maxBytes`, so an unsigned caller can't make
 * the Worker hold a large body. A declared length over the limit is refused before a byte is read;
 * without one (a chunked body) or with a false one, the read stops at the first byte over. A local
 * copy of `readBody` in `host-server`, whose public interface doesn't export it.
 */
async function readCappedBody(request: Request, maxBytes: number): Promise<Uint8Array | undefined> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return undefined;
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function trustedCommandKey(context: LimitsPushContext, keyId: string): TrustedKey | undefined {
  const publicKey = context.keys.find(keyId, "command");
  return publicKey === undefined ? undefined : { publicKey, product: context.product };
}

async function applyPushed(
  usage: LimitsPushTarget,
  scope: string,
  body: Uint8Array,
): Promise<Response> {
  const badLimits = () => refusal(400, "bad_limits", "The limits document isn't valid.");
  let document: unknown;
  try {
    document = JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    if (error instanceof SyntaxError) return badLimits();
    throw error;
  }
  if (!isPlainObject(document)) return badLimits();
  let result: "applied" | "stale";
  try {
    result = await usage.applyLimits(scope, limitsOfPush(document));
  } catch (error) {
    // The object's checks refuse a malformed document with a RangeError; over RPC it keeps its name.
    if (error instanceof Error && error.name === "RangeError") return badLimits();
    throw error;
  }
  return Response.json({ limits: result }, { status: 200, headers: noStore });
}

/**
 * The pushed document as the usage object keeps it. Cloud names the customer's plan in `plan`
 * (`{ state, id, version, name }`, as in its `limits.customer` documents); the object keeps its
 * id, version and name, and only from there, so a pushed `planName` is dropped and a push can't
 * name the plan any other way. A plan in state `none`, or a document without a plan, keeps no plan:
 * documents pushed before Cloud sent plans keep working as they are. The object checks the plan,
 * so a malformed one is a `bad_limits`.
 */
function limitsOfPush(document: Record<string, unknown>): UsageLimits {
  const { plan, planName: _pushedName, ...limits } = document;
  if (plan === undefined) return limits as unknown as UsageLimits;
  if (!isPlainObject(plan)) return { ...limits, plan } as unknown as UsageLimits;
  if (plan["state"] === "none") return limits as unknown as UsageLimits;
  const kept = { id: plan["id"], version: plan["version"], name: plan["name"] };
  return { ...limits, plan: kept } as unknown as UsageLimits;
}

function variable(env: object, name: string): string | undefined {
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * The route's context from the Worker's `env`, or `undefined` when the deployment isn't sold
 * through Cloud (none of the usage binding, the key set or the product is there), so the path
 * gets the same 404 as any other.
 *
 * @throws ConfigurationError when only some of them are there, or the key set can't be read; it names the variables, never a value
 */
export async function limitsPushContextOf(env: RuntimeEnv): Promise<LimitsPushContext | undefined> {
  const keysText = variable(env, cloudKeysVariable);
  const product = variable(env, cloudProductVariable);
  const { USAGE } = env;
  if (keysText === undefined && product === undefined && USAGE === undefined) return undefined;
  const keys = keysText === undefined ? undefined : await readKeys(keysText);
  const missing = [
    ...(keys === undefined ? [cloudKeysVariable] : []),
    ...(product === undefined ? [cloudProductVariable] : []),
    ...(USAGE === undefined ? ["USAGE"] : []),
  ];
  if (keys === undefined || product === undefined || USAGE === undefined) {
    throw new ConfigurationError(missing);
  }
  return {
    keys,
    product,
    clock: systemClock,
    usageOf: (scope) => USAGE.get(USAGE.idFromName(scope)),
  };
}

async function readKeys(text: string): Promise<PublicKeySet | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const keys = await readPublicKeySet(parsed);
  return keys.ok ? keys.value : undefined;
}

/**
 * Answers a limits push, or `undefined` when the path isn't one or the deployment isn't sold
 * through Cloud. An incomplete Cloud configuration answers 503 without saying what is missing.
 */
export async function answerLimitsPushOf(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | undefined> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(limitsPushPrefix)) return undefined;
  // A path that isn't a scope gets the usual 404 before the key set is read.
  if (parseScope(pathname.slice(limitsPushPrefix.length)) === null) return undefined;
  let context: LimitsPushContext | undefined;
  try {
    context = await limitsPushContextOf(env);
  } catch (error) {
    if (!(error instanceof ConfigurationError)) throw error;
    console.error(`halonic: the Cloud limits route isn't configured. Missing: ${error.missing}.`);
    return refusal(503, "unavailable", "The server isn't ready.");
  }
  return context === undefined ? undefined : answerLimitsPush(request, context);
}
