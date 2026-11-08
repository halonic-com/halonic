/**
 * Files that should never be committed, whatever they contain: local
 * environment files and private key or keystore files. The rules look at
 * the file name only.
 */

export interface FileRule {
  /** The rule name, as used in reports and in the allow file. */
  readonly name: string;
  /** What the rule finds, in a few words. */
  readonly label: string;
  /** True when a file with this name (the last path part) breaks the rule. */
  readonly matches: (fileName: string) => boolean;
}

/** `.env` templates that hold placeholders and are meant to be committed. */
const envTemplates = new Set(["example", "sample", "template", "defaults"]);

function isEnvFile(fileName: string): boolean {
  if (fileName === ".env" || fileName === ".envrc") {
    return true;
  }
  const suffix = /^\.env\.(.+)$/.exec(fileName)?.[1];
  return suffix !== undefined && !envTemplates.has(suffix);
}

const keyFileNames = new Set(["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);
const keyFileEndings = [".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".ppk"];

function isKeyFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return keyFileNames.has(lower) || keyFileEndings.some((ending) => lower.endsWith(ending));
}

export const fileRules: readonly FileRule[] = [
  { name: "env-file", label: "an environment file", matches: isEnvFile },
  { name: "key-file", label: "a private key or keystore file", matches: isKeyFile },
];

/** The last part of a repo path: `apps/x/.env` → `.env`. */
export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
