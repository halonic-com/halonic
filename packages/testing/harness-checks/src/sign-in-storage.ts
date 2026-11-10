import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

/** Where a harness can keep its sign-in: a file in its settings folder, or Keychain entries. */
export interface SignInPlace {
  /** The file's name in the settings folder, such as `.credentials.json`. */
  file: string;
  /** How the names of its Keychain entries start, such as "Claude Code". */
  keychainPrefix: string;
}

/** Claude Code's sign-in: `.credentials.json`, or the Keychain on macOS. */
export const claudeSignInPlace: SignInPlace = {
  file: ".credentials.json",
  keychainPrefix: "Claude Code",
};

/** Codex's sign-in: `auth.json`, or the Keychain when its settings say so. */
export const codexSignInPlace: SignInPlace = { file: "auth.json", keychainPrefix: "Codex" };

/** Where a harness's sign-in for one settings folder is: by name only, never its contents. */
export interface SignInStorage {
  /** Whether the sign-in file is in the settings folder. */
  credentialsFile: "present" | "absent";
  /**
   * The names of the Keychain entries whose service starts with the
   * harness's prefix, or `null` when this isn't macOS. Only the service
   * names: never the account or the password.
   */
  keychainServices: string[] | null;
}

/** Reads the names of the Keychain's entries. */
export interface Keychain {
  /** The service names of every generic password, or `null` when there is no Keychain here. */
  serviceNames(): Promise<string[] | null>;
}

/**
 * Where a harness keeps the sign-in for `settingsFolder` (requirement
 * `harness-checks.sign-in-storage`): whether its file is there, and which
 * Keychain entries are named after it. It never opens the file or asks the
 * Keychain for a password.
 */
export async function signInStorage(
  settingsFolder: string,
  place: SignInPlace,
  keychain: Keychain,
): Promise<SignInStorage> {
  const services = await keychain.serviceNames();
  return {
    credentialsFile: (await isFile(join(settingsFolder, place.file))) ? "present" : "absent",
    keychainServices:
      services === null ? null : services.filter((name) => name.startsWith(place.keychainPrefix)),
  };
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * The service names in the output of macOS's `security dump-keychain`
 * without `-d`, which lists each entry's attributes and never a password.
 *
 * @example
 * keychainServiceNames('    "svce"<blob>="Claude Code-credentials"\n'); // ["Claude Code-credentials"]
 */
export function keychainServiceNames(dump: string): string[] {
  const names = new Set<string>();
  for (const match of dump.matchAll(/^\s*"svce"<blob>="(.*)"\s*$/gm)) {
    const name = match[1];
    if (name !== undefined) names.add(name);
  }
  return [...names];
}

/** The Keychain of the person running the check; none outside macOS. */
export const systemKeychain: Keychain = {
  async serviceNames() {
    if (process.platform !== "darwin") return null;
    // Without `-d` the dump holds attributes only, so macOS asks for no permission and shows no secret.
    const { stdout } = await promisify(execFile)("security", ["dump-keychain"], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return keychainServiceNames(stdout);
  },
};
