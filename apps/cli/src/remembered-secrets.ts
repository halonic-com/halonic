import type { Secrets } from "@halonicjs/ports";
import type { SecretScrubber } from "@halonicjs/std";

/**
 * The secrets, with every value `get` hands out told to `scrubber` before
 * the caller sees it. The CLI scrubs every error it prints with that
 * scrubber, so a secret a command, the engine or a provider loaded can't
 * end up on the screen, whichever adapter it came from.
 *
 * `runCli` wraps the store once; nothing the CLI builds gets the raw one.
 */
export function rememberedSecrets(secrets: Secrets, scrubber: SecretScrubber): Secrets {
  return {
    async get(name) {
      const value = await secrets.get(name);
      if (value !== null) scrubber.remember(value);
      return value;
    },
  };
}

/** A store with nothing configured, for a CLI started without one. */
export const noSecrets: Secrets = {
  get: async () => null,
};
