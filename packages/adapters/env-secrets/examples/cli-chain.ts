import { MemorySecrets } from "@halonicjs/adapter-memory";
import { EnvSecrets, firstSecret } from "../src/index.ts";

/** Reads secrets the way the CLI does: the environment first, then the keychain. */
export async function runExample(): Promise<{
  fromEnvironment: string | null;
  fromKeychain: string | null;
  notConfigured: string | null;
}> {
  // The CLI passes `process.env`; an invented environment keeps the example repeatable.
  const env = new EnvSecrets({
    HALONIC_SECRET_OPENAI: "env-value", // a made-up value; never print a real one
    OPENAI_API_KEY: "ignored", // a provider's own variable is never read
  });
  // A stand-in for the OS keychain reader, which isn't there on a CI runner.
  const keychain = new MemorySecrets({ openai: "keychain-value", anthropic: "keychain-value" });

  const secrets = firstSecret(env, keychain);

  const fromEnvironment = await secrets.get("openai"); // "env-value": the environment wins
  const fromKeychain = await secrets.get("anthropic"); // "keychain-value"
  const notConfigured = await secrets.get("google"); // null

  return { fromEnvironment, fromKeychain, notConfigured };
}
