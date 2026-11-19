import { EnvSecrets, firstSecret } from "@halonicjs/adapter-env-secrets";
import { FileSecretStore } from "@halonicjs/adapter-secrets-file";
import type { Digest, Secrets } from "@halonicjs/ports";
import { type ProfileFolder, secretsFile } from "@halonicjs/profile";

/**
 * The secrets the token key (`HALONIC_SECRET_TOKEN_KEY`) is read from: the
 * environment first, then the profile's secrets file, as the CLI reads them,
 * so the host opens what the CLI sealed. The file is opened on the first name
 * the environment doesn't have.
 *
 * @param env - the host's own environment
 */
export function tokenKeySecrets(
  profile: ProfileFolder,
  env: Readonly<Record<string, string | undefined>>,
): Secrets {
  let file: FileSecretStore | undefined;
  return firstSecret(new EnvSecrets(env), {
    get: (name) => {
      file ??= new FileSecretStore(secretsFile(profile));
      return file.get(name);
    },
  });
}

/** The {@link Digest} port over the Web Crypto API. */
export const webCryptoDigest: Digest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    // A copy on its own ArrayBuffer: Web Crypto refuses views of a SharedArrayBuffer.
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
