// The one way a command opens the secrets of this computer: the profile's
// secrets file, the password hash `serve` checks against, and stdin, so every
// `halonic secret` command and every command that reads a secret use the same
// file.

import { StringDecoder } from "node:string_decoder";
import { EnvSecrets, firstSecret } from "@halonicjs/adapter-env-secrets";
import { createScryptHasher } from "@halonicjs/adapter-password-scrypt";
import { FileSecretStore } from "@halonicjs/adapter-secrets-file";
import { SecretService } from "@halonicjs/app";
import { maxSecretValueLength, type PasswordHasher, type Secrets } from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder, secretsFile } from "@halonicjs/profile";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

/** Where a command reads a piped value from. */
export interface SecretStdin {
  /** Whether stdin is a terminal, where the value is typed at a hidden prompt. */
  readonly isTerminal: boolean;
  /** Everything piped in, as text. */
  read(): Promise<string>;
}

/** What the secret commands use on this computer, so tests can fix the profile folder, the hasher and stdin. */
export interface SecretSetup {
  /** Where the profile folder is; this process's by default. */
  readonly profile?: ProfileEnvironment;
  /** Hashes the sign-in password; scrypt by default. */
  readonly hasher?: PasswordHasher;
  /** This process's stdin by default. */
  readonly stdin?: SecretStdin;
}

/** The secrets file of the profile. Nothing is created until a secret is saved. */
export function openSecretStore(
  profile: ProfileEnvironment = nodeProfileEnvironment(),
): FileSecretStore {
  return new FileSecretStore(secretsFile(profileFolder(profile)));
}

/**
 * The secret service over the profile's secrets file.
 *
 * @throws when `HALONIC_HOME` or the home folder isn't an absolute folder
 */
export function openSecretService(setup: SecretSetup): SecretService {
  return new SecretService({
    store: openSecretStore(setup.profile),
    hasher: setup.hasher ?? createScryptHasher(),
  });
}

/** This process's stdin: a terminal, or a pipe read as text, up to a little past the longest secret. */
export const processStdin: SecretStdin = {
  get isTerminal() {
    return process.stdin.isTTY === true;
  },
  read: () => readCapped(process.stdin),
};

/**
 * Reads `stream` as text, and stops a little past the longest value a secret
 * can have: room for a closing line ending and one character more, so the
 * service still refuses the value as too long while a large file piped in by
 * mistake is never loaded into memory.
 */
export async function readCapped(stream: AsyncIterable<string | Buffer>): Promise<string> {
  const limit = maxSecretValueLength + 3;
  const decoder = new StringDecoder("utf8");
  let text = "";
  for await (const chunk of stream) {
    text += typeof chunk === "string" ? chunk : decoder.write(chunk);
    if (text.length >= limit) break;
  }
  return text;
}

/**
 * The secrets every command reads: the environment first, then the secrets
 * file. The file is opened on the first name the environment doesn't have,
 * so a bad `HALONIC_HOME` or a damaged file only stops a command that needs
 * a secret the environment lacks, and `halonic --version` never touches it.
 */
export function chainedSecrets(
  env: Readonly<Record<string, string | undefined>>,
  profile: () => ProfileEnvironment = nodeProfileEnvironment,
): Secrets {
  const file = lazily(() => openSecretStore(profile()));
  return firstSecret(new EnvSecrets(env), { get: (name) => file().get(name) });
}

function lazily<T>(make: () => T): () => T {
  let made: T | undefined;
  return () => {
    made ??= make();
    return made;
  };
}
