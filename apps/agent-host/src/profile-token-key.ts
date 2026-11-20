import { EnvSecrets, firstSecret } from "@halonicjs/adapter-env-secrets";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { FileSecretStore } from "@halonicjs/adapter-secrets-file";
import { madeTokenKey } from "@halonicjs/adapter-token-store";
import type { Digest, Secrets } from "@halonicjs/ports";
import { type ProfileFolder, secretsFile, tokenFolders } from "@halonicjs/profile";

/**
 * The secrets the token key is read from: `HALONIC_SECRET_TOKEN_KEY` in the
 * environment first, then the profile's secrets file, as the CLI reads them,
 * so the host opens what the CLI sealed. When neither has one and no token
 * is sealed yet, the key is made and saved in the secrets file the first
 * time a token is sealed (`madeTokenKey`), the same way the CLI makes it.
 * The file is opened on the first name the environment doesn't have.
 *
 * @param env - the host's own environment
 */
export function tokenKeySecrets(
  profile: ProfileFolder,
  env: Readonly<Record<string, string | undefined>>,
): Secrets {
  let file: FileSecretStore | undefined;
  const secretStore = () => {
    file ??= new FileSecretStore(secretsFile(profile));
    return file;
  };
  const folders = tokenFolders(profile);
  return madeTokenKey({
    secrets: firstSecret(new EnvSecrets(env), { get: (name) => secretStore().get(name) }),
    store: { setIfMissing: (name, value) => secretStore().setIfMissing(name, value) },
    tokenRecords: [folders.google, folders.integrationSignIns].map(
      (folder) => new FileRecordStore(folder),
    ),
  });
}

/** The {@link Digest} port over the Web Crypto API. */
export const webCryptoDigest: Digest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    // A copy on its own ArrayBuffer: Web Crypto refuses views of a SharedArrayBuffer.
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
