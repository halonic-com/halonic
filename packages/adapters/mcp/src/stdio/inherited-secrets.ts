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
 * The shortest user name of an `http(s)` URL with no password that counts
 * as a token, such as a Sentry DSN's 32-character key or a 40-character
 * GitHub token. Plain user names such as `acme` or `x-access-token` are
 * shorter, and removing them would hide who a failing request ran as.
 */
const shortestUserNameToken = 16;

/** The URL schemes whose user name, with no password, can be the token itself. */
const tokenUserNameSchemes = new Set(["http:", "https:"]);

/**
 * The secrets a program inherits from the app's own environment, as
 * opposed to the ones the connector's `secretEnv` gives it: the value of
 * each variable whose name holds a word such as `TOKEN`, `KEY` or
 * `PASSWORD`, the password in a value written as a URL, such as
 * `postgres://acme:hush@db.acme.test/notes`, and the user name of an
 * `http(s)` URL with no password that is long enough to be a token, such
 * as a Sentry DSN. Both launches pass on what the app inherited
 * (`mcp.stdio-connector`), so a program can echo any of these, whatever
 * their shape (`mcp.stdio-inherited-secrets`).
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
    const urlSecret = urlCredential(value);
    if (urlSecret !== undefined) secrets.push(urlSecret);
  }
  return secrets;
}

/** Whether a name such as `NODE_AUTH_TOKEN` or `authToken` holds one of the {@link secretWords}. */
function hasSecretName(name: string): boolean {
  const words = name.split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/);
  return words.some((word) => secretWords.has(word.toUpperCase()));
}

/**
 * The secret written in a URL's user part, decoded, if the value is such a
 * URL: the password of `user:password@`, or the user name of an `http(s)`
 * URL's `token@` when it is at least {@link shortestUserNameToken} long.
 * `git@host:repo` isn't a URL, and other schemes such as
 * `postgres://acme@db` put a plain user name there, so they are left alone.
 */
function urlCredential(value: string): string | undefined {
  if (!URL.canParse(value)) return undefined;
  const { password, username, protocol } = new URL(value);
  if (password !== "") return decoded(password);
  if (!tokenUserNameSchemes.has(protocol)) return undefined;
  if (username.length < shortestUserNameToken) return undefined;
  return decoded(username);
}

/** A URL part with its `%` escapes decoded. */
function decoded(urlPart: string): string {
  try {
    return decodeURIComponent(urlPart);
  } catch {
    // A broken escape: the part stays as written, which the scrubber still finds.
    return urlPart;
  }
}
