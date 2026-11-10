import type { BridgeProvider, HarnessBridgeOptions, Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";

/** Each provider's name as people know it, for error messages. */
const providerNames: Record<BridgeProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

/**
 * True for a key that can go in a header as it is: visible ASCII only. A line
 * break in a header value makes `fetch` fail with an error that can quote the
 * value, so such a key never reaches the call.
 */
function isUsableKey(key: string): boolean {
  return /^[\x21-\x7e]+$/.test(key);
}

/**
 * The value of the key this agent uses for `provider`, from Halonic's
 * secrets. Errors name the secret, never its value.
 *
 * @throws KindedError `denied` when the agent doesn't use the provider with a key
 * @throws KindedError `unauthenticated` when the key isn't set in Halonic's secrets, or isn't a usable key
 */
export async function providerKey(
  run: HarnessBridgeOptions,
  secrets: Secrets,
  provider: BridgeProvider,
): Promise<string> {
  const name = providerNames[provider];
  const access = run.providers[provider];
  if (access === undefined) {
    throw new KindedError("denied", `This agent isn't set up to use ${name} models.`);
  }
  if (access.kind === "sign-in") {
    // Passing a person's own sign-in on comes with build plan step B5.
    throw new KindedError(
      "denied",
      "This agent signs in with a subscription, which the Halonic bridge doesn't pass on yet.",
    );
  }
  const key = await secrets.get(access.secret);
  if (key === null) {
    throw new KindedError(
      "unauthenticated",
      `The secret "${access.secret}" that holds this agent's ${name} key isn't set.`,
    );
  }
  if (!isUsableKey(key)) {
    // Name only the secret: the value must not reach an error, a cause or a log.
    throw new KindedError(
      "unauthenticated",
      `The secret "${access.secret}" that holds this agent's ${name} key holds something that isn't a key, such as a line break.`,
    );
  }
  return key;
}
