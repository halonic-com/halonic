/**
 * Words in a variable's name that say its value is a secret, such as
 * `API_KEY`, `NODE_AUTH_TOKEN` or `npm_config__authToken`. Only whole words
 * count, so `KEYMAP` or `AUTHOR` don't.
 */
const secretWords = new Set([
  "APIKEY",
  "AUTH",
  "COOKIE",
  "CREDENTIAL",
  "CREDENTIALS",
  "KEY",
  "PASSPHRASE",
  "PASSWD",
  "PASSWORD",
  "PRIVATE",
  "SECRET",
  "TOKEN",
]);

/**
 * Values this short are left alone: under a secret-looking name they are
 * flags such as `1` or `on`, and removing every `1` from a program's error
 * output would hide what went wrong without hiding a key.
 */
const shortestSecret = 4;

/**
 * The secrets a program inherits from the app's own environment, as
 * opposed to the ones the connector's `secretEnv` gives it: the value of
 * each variable whose name holds a word such as `TOKEN`, `KEY` or
 * `PASSWORD`, and the password in a value written as a URL, such as
 * `postgres://acme:hush@db.acme.test/notes`. Both launches pass on
 * what the app inherited (`mcp.stdio-connector`), so a program can echo
 * any of these, whatever their shape (`mcp.stdio-inherited-secrets`).
 *
 * @example
 * inheritedSecrets({ ACME_API_KEY: "plain-words", PATH: "/usr/bin" }); // ["plain-words"]
 */
export function inheritedSecrets(env: Readonly<Record<string, string | undefined>>): string[] {
  const secrets: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.length < shortestSecret) continue;
    if (hasSecretName(name)) {
      secrets.push(value);
      continue;
    }
    const password = urlPassword(value);
    if (password !== undefined) secrets.push(password);
  }
  return secrets;
}

/** Whether a name such as `NODE_AUTH_TOKEN` or `authToken` holds one of the {@link secretWords}. */
function hasSecretName(name: string): boolean {
  const words = name.split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/);
  return words.some((word) => secretWords.has(word.toUpperCase()));
}

/** The password written in a URL's `user:password@` part, decoded, if the value is such a URL. */
function urlPassword(value: string): string | undefined {
  if (!URL.canParse(value)) return undefined;
  const { password } = new URL(value);
  if (password === "") return undefined;
  try {
    return decodeURIComponent(password);
  } catch {
    // A broken escape: the password stays as written, which the scrubber still finds.
    return password;
  }
}
