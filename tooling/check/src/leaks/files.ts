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

/** Other files that hold settings with secrets: Cloudflare's local vars, Terraform values. */
const otherEnvFileNames = new Set([".dev.vars"]);
const otherEnvFileEndings = [".env", ".tfvars"];

function isEnvFile(fileName: string): boolean {
  if (fileName === ".env" || fileName === ".envrc" || otherEnvFileNames.has(fileName)) {
    return true;
  }
  if (otherEnvFileEndings.some((ending) => fileName.endsWith(ending))) {
    return true;
  }
  const suffix = /^\.env\.(.+)$/.exec(fileName)?.[1];
  return suffix !== undefined && !envTemplates.has(suffix);
}

/** SSH private keys, also with a suffix (`id_rsa_work`); the `.pub` half is public. */
const sshKeyName = /^id_(?:rsa|dsa|ecdsa|ed25519)(?:[_-][\w-]*)?$/;
const keyFileEndings = [".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".ppk"];

function isKeyFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return sshKeyName.test(lower) || keyFileEndings.some((ending) => lower.endsWith(ending));
}

/** Files that hold login details: registry and machine logins, database and cloud credentials. */
const credentialFileNames = new Set([".npmrc", ".netrc", "_netrc", ".pgpass", "credentials"]);

function isCredentialFile(fileName: string): boolean {
  return credentialFileNames.has(fileName.toLowerCase());
}

export const fileRules: readonly FileRule[] = [
  { name: "env-file", label: "an environment file", matches: isEnvFile },
  { name: "key-file", label: "a private key or keystore file", matches: isKeyFile },
  { name: "credential-file", label: "a credentials file", matches: isCredentialFile },
];

/** The last part of a repo path: `apps/x/.env` → `.env`. */
export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
