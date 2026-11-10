import type { IncomingHttpHeaders } from "node:http";
import type { BridgeProvider, Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { BridgeRequestContext } from "./route.ts";

/** Each provider's name as people know it, for error messages. */
const providerNames: Record<BridgeProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

/** How a provider takes a key: the request headers that carry it, such as Anthropic's `x-api-key`. */
export type KeyHeaders = (key: string) => Record<string, string>;

/**
 * The headers that sign a call to `provider` in, for this agent:
 *
 * - With a key, the value of the agent's key secret, as `keyHeaders` puts it
 *   (requirements `harness-bridge.anthropic` and `harness-bridge.openai`).
 * - With a subscription, the program's own `authorization` header, exactly as
 *   it came (requirement `harness-bridge.sign-in`). The bridge adds nothing to
 *   it and keeps nothing of it.
 *
 * Errors name the secret or the header, never a value.
 *
 * @throws KindedError `denied` when the agent doesn't use the provider
 * @throws KindedError `unauthenticated` when the key isn't set or isn't a usable key, or the program sent no usable sign-in
 */
export async function providerAuthorization(
  context: BridgeRequestContext,
  secrets: Secrets,
  provider: BridgeProvider,
  keyHeaders: KeyHeaders,
): Promise<Record<string, string>> {
  const name = providerNames[provider];
  const access = context.run.providers[provider];
  if (access === undefined) {
    throw new KindedError("denied", `This agent isn't set up to use ${name} models.`);
  }
  if (access.kind === "sign-in") return programSignIn(context.request.headers, name);
  return keyHeaders(await providerKey(secrets, access.secret, name));
}

/**
 * The program's own sign-in, as the one `authorization` header the call to
 * the provider gets. Node's server keeps only the first of two
 * `authorization` headers, so it is always one value.
 */
function programSignIn(headers: IncomingHttpHeaders, name: string): Record<string, string> {
  const signIn = headers.authorization;
  if (signIn === undefined || signIn === "") {
    throw new KindedError(
      "unauthenticated",
      `This agent signs in to ${name} with a subscription, but the program sent no sign-in in its authorization header.`,
    );
  }
  if (!isUsableSignIn(signIn)) {
    // Name only the header: the value must not reach an error, a cause or a log.
    throw new KindedError(
      "unauthenticated",
      `The program's authorization header for ${name} holds something that can't go on to ${name}, such as a character outside ASCII.`,
    );
  }
  return { authorization: signIn };
}

/** The value of the agent's key secret for the provider called `name`. */
async function providerKey(secrets: Secrets, secret: string, name: string): Promise<string> {
  const key = await secrets.get(secret);
  if (key === null) {
    throw new KindedError(
      "unauthenticated",
      `The secret "${secret}" that holds this agent's ${name} key isn't set.`,
    );
  }
  if (!isUsableKey(key)) {
    // Name only the secret: the value must not reach an error, a cause or a log.
    throw new KindedError(
      "unauthenticated",
      `The secret "${secret}" that holds this agent's ${name} key holds something that isn't a key, such as a line break.`,
    );
  }
  return key;
}

/**
 * True for a key that can go in a header as it is: visible ASCII only. A line
 * break in a header value makes `fetch` fail with an error that can quote the
 * value, so such a key never reaches the call.
 */
function isUsableKey(key: string): boolean {
  return /^[\x21-\x7e]+$/.test(key);
}

/**
 * True for a sign-in `fetch` sends on as it is: visible ASCII and spaces, as
 * in `Bearer <token>`. Anything else could make `fetch` fail with an error
 * that quotes the value.
 */
function isUsableSignIn(signIn: string): boolean {
  return /^[\x20-\x7e]+$/.test(signIn);
}
