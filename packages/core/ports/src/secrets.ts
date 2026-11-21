/** Version of the {@link Secrets} port. A breaking change bumps it and comes with an ADR. */
export const secretsVersion = 1;

/**
 * The secrets someone configured: provider keys, the sign-in password hash,
 * the token key. Read-only at run time (OS keychain, a mode-0600 file,
 * environment variables, Workers secrets). What the server writes itself goes
 * in the {@link TokenStore} instead.
 *
 * **Names** match `^[A-Za-z][A-Za-z0-9_-]*$` and are at most 128 characters,
 * so the same name works as an environment variable, a Workers secret and a
 * keychain entry. `secretKey` and `isSecretName` below hold the rule, so
 * every adapter checks names the same way.
 *
 * **Two names that differ only in upper and lower case, or in `-` versus
 * `_`, are the same secret on every adapter.** The old environment adapter
 * upper-cased names and mapped `-` to `_` (`serve-password` is
 * `HALONIC_SECRET_SERVE_PASSWORD`), so a keychain or file store must match
 * names the same way. A prefix is up to the adapter.
 */
export interface Secrets {
  /**
   * The secret's value, or `null` when it isn't configured.
   *
   * @throws RangeError when the name breaks the rule above
   *
   * Any error `get` throws, for this or any other reason, never holds the
   * secret's value in its message or its cause, so a caller may show the
   * message.
   */
  get(name: string): Promise<string | null>;
}

/**
 * The secrets a person sets and removes with `halonic secret`: {@link Secrets}
 * that can also be written. A host that only reads secrets (a Worker, the
 * environment) implements `Secrets` alone; only a store the person owns, such
 * as a file in the profile, implements this. It follows the version of
 * {@link Secrets}, which it extends without changing.
 *
 * The same name rule and the same matching apply: every method runs
 * {@link secretKey} on a name before it touches storage, so a bad name is a
 * `RangeError` that changes nothing, and `Open-AI` and `open_ai` are one secret.
 * **A value never appears in an error, a log or a listing.**
 */
export interface SecretStore extends Secrets {
  /**
   * Saves a value, replacing the one stored under the same name. The name is
   * kept as it was written last, so a listing shows what the person typed.
   *
   * @throws RangeError when the name breaks the rule, or the value is empty or
   *   longer than {@link maxSecretValueLength}; the message never repeats the value
   */
  set(name: string, value: string): Promise<void>;
  /**
   * Removes a secret. Removing one that isn't stored succeeds and changes nothing.
   *
   * @throws RangeError when the name breaks the rule
   */
  remove(name: string): Promise<void>;
  /** The names of the stored secrets, sorted by their `secretKey` form, and never a value. */
  names(): Promise<readonly string[]>;
}

/** The longest value a {@link SecretStore} saves, in UTF-16 code units. Bounds what one secret may cost a store. */
export const maxSecretValueLength = 64 * 1024;

/**
 * Checks a value before a {@link SecretStore} saves it, so every store refuses
 * the same ones: an empty value (`EnvSecrets` treats it as unset, so it would
 * look like no secret) and one over {@link maxSecretValueLength}.
 *
 * @throws RangeError; the message never repeats the value, only its length
 *
 * @example
 * checkSecretValue("sk-live-1234"); // fine
 * checkSecretValue(""); // throws a RangeError
 */
export function checkSecretValue(value: string): void {
  if (value === "") {
    throw new RangeError("A secret's value can't be empty. Remove the secret instead.");
  }
  if (value.length > maxSecretValueLength) {
    throw new RangeError(
      `A secret's value can be at most ${maxSecretValueLength} characters; this one has ${value.length}.`,
    );
  }
}

/** The longest a `Secrets` or `TokenStore` name may be. */
export const maxSecretNameLength = 128;

const secretNamePattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const printableAscii = /^[\x20-\x7E]*$/;

/**
 * Whether a name follows the name rule of the `Secrets` port: a letter,
 * then letters, digits, `-` or `_`, at most 128 characters. Workspace checks
 * use it to report a bad name in a file before anything asks a store for it.
 *
 * @example
 * isSecretName("openai-key"); // true
 * isSecretName("openai key"); // false
 */
export function isSecretName(name: string): boolean {
  return name.length <= maxSecretNameLength && secretNamePattern.test(name);
}

/**
 * The form two names are compared in: upper case, with `-` as `_`. Names
 * with the same key are the same secret on every adapter, as the
 * `Secrets` port requires. An adapter may store a different case of
 * it, but must match by it.
 *
 * @throws RangeError when the name breaks the rule; the message repeats the
 *   name only when {@link describeSecretName} allows it
 *
 * @example
 * secretKey("serve-password"); // "SERVE_PASSWORD"
 */
export function secretKey(name: string): string {
  if (!isSecretName(name)) {
    throw new RangeError(
      `${describeSecretName(name)} must be a letter, then letters, digits, "-" or "_", at most ${maxSecretNameLength} characters.`,
    );
  }
  return name.toUpperCase().replaceAll("-", "_");
}

/**
 * Whether a message may repeat a secret name: only when it is at most 128
 * printable ASCII characters. Anything else is more likely a value passed as
 * a name by mistake, so it must never reach a log or an error report.
 *
 * @example
 * isQuotableSecretName("openai key"); // true
 * isQuotableSecretName("x".repeat(300)); // false
 */
export function isQuotableSecretName(name: string): boolean {
  return name.length <= maxSecretNameLength && printableAscii.test(name);
}

/**
 * How a message may refer to a secret name: quoted when
 * {@link isQuotableSecretName} allows it, otherwise by its length only.
 *
 * @example
 * describeSecretName("openai key"); // 'Secret name "openai key"'
 * describeSecretName("x".repeat(300)); // "A secret name of 300 characters"
 */
export function describeSecretName(name: string): string {
  if (isQuotableSecretName(name)) {
    return `Secret name ${JSON.stringify(name)}`;
  }
  return `A secret name of ${name.length} characters`;
}

// A workspace names the secrets its providers and models use. Those names
// share one namespace with Halonic's own secrets, and on desktop with the
// tokens too (one keychain backs both stores). So every name a workspace
// picks goes through `workspaceSecrets`, which refuses the ones that belong
// to Halonic or to a plugin, whatever their case or `-`/`_` spelling.

/**
 * Halonic's own secrets: the key of the encrypted token store and the hash of
 * the sign-in password. Only Halonic reads them; no workspace may pick them.
 */
export const halonicSecretNames: readonly string[] = ["token-key", "serve-password"];

/**
 * The secrets only the agent host keeps, for itself: the remote host's static
 * key (tunnel phase B). Like {@link halonicSecretNames}, no workspace may pick
 * them, but no deployment needs them, so they aren't in that list.
 */
export const hostSecretNames: readonly string[] = ["remote-host-key"];

/**
 * The prefix of a token's name in a store that also holds secrets, such as
 * the desktop keychain. A secret name with this prefix is a token, so no
 * workspace may pick it.
 */
export const tokenNamePrefix = "halonic_token_";

const halonicSecretKeys = new Set([...halonicSecretNames, ...hostSecretNames].map(secretKey));
const tokenKeyPrefix = secretKey(tokenNamePrefix);

/**
 * Whether a secret name belongs to Halonic: one of {@link halonicSecretNames}
 * or {@link hostSecretNames}, or a token name under {@link tokenNamePrefix}. Names are compared in their
 * `secretKey` form, so `Token_Key` is `token-key`.
 *
 * @throws RangeError when the name breaks the rule of the `Secrets` port
 *
 * @example
 * isHalonicSecretName("Serve_Password"); // true
 * isHalonicSecretName("openai-key"); // false
 */
export function isHalonicSecretName(name: string): boolean {
  const key = secretKey(name);
  return halonicSecretKeys.has(key) || key.startsWith(tokenKeyPrefix);
}

/**
 * The prefix of every secret a plugin declares: the app keeps a plugin's
 * secret under `plugin__<id>__<secret>`. A secret name with this prefix
 * belongs to a plugin, so no workspace may pick it.
 */
export const pluginSecretNamePrefix = "plugin__";

/**
 * Comes between the plugin's id and the secret's name in a plugin's secret
 * name, and ends {@link pluginSecretNamePrefix}'s share of it. `Secrets`
 * takes `-` and `_` as the same character, so a single one can't tell
 * `a-b` + `c` from `a` + `b-c`. Ids and secret names never hold two `-` in a
 * row, so a doubled `_` can't come from either of them.
 */
export const pluginSecretSeparator = "__";

const pluginKeyPrefix = secretKey(pluginSecretNamePrefix);

/**
 * Whether a secret name belongs to a plugin: it starts with
 * {@link pluginSecretNamePrefix}. Names are compared in their `secretKey`
 * form, so `Plugin-_weather` counts too.
 *
 * @throws RangeError when the name breaks the rule of the `Secrets` port
 *
 * @example
 * isPluginSecretName("plugin__weather__acme-key"); // true
 * isPluginSecretName("plugin-key"); // false
 */
export function isPluginSecretName(name: string): boolean {
  return secretKey(name).startsWith(pluginKeyPrefix);
}

/**
 * The secrets as a workspace may read them: by any name it picks, except the
 * ones that belong to Halonic ({@link isHalonicSecretName}) or to a plugin
 * ({@link isPluginSecretName}). Pass this, never the raw store, wherever a
 * workspace's choice of name reaches `Secrets`.
 *
 * @throws RangeError from `get`, for a name of Halonic's own or a plugin's;
 *   the message never repeats the name
 *
 * @example
 * const picks = workspaceSecrets(secrets);
 * await picks.get("openai-key"); // the configured key, or null
 * await picks.get("token-key"); // throws a RangeError
 * await picks.get("plugin__weather__acme-key"); // throws a RangeError
 */
export function workspaceSecrets(secrets: Secrets): Secrets {
  return {
    get: async (name) => {
      refuseOutsideWorkspace(name);
      return await secrets.get(name);
    },
  };
}

/**
 * A store Studio writes a workspace's secrets to, such as a connector's: `set` and `remove` as in
 * {@link SecretStore}, and `has`, which says whether a value is stored without reading it, so the
 * page that shows "Set" never receives the value.
 */
export interface WorkspaceSecretWriter {
  /**
   * @throws RangeError when the name breaks the rule, or the value doesn't fit; the message never
   *   repeats the value
   */
  set(name: string, value: string): Promise<void>;
  /** Removing one that isn't stored succeeds and changes nothing. */
  remove(name: string): Promise<void>;
  /** Whether a value is stored under the name; never the value. */
  has(name: string): Promise<boolean>;
}

/**
 * The writing side of {@link workspaceSecrets}: a store as a workspace may write it, by any name it
 * picks except Halonic's own and a plugin's, refused with the same messages and without asking the
 * store. So a connector that names `token-key` or `plugin__weather__key` can't overwrite it.
 *
 * @throws RangeError from every method, for a name of Halonic's own or a plugin's; the message
 *   never repeats the name
 *
 * @example
 * const connectorSecrets = workspaceSecretWriter(keychain);
 * await connectorSecrets.set("NOTES_TOKEN", typed);
 * await connectorSecrets.set("serve-password", typed); // throws a RangeError
 */
export function workspaceSecretWriter(store: WorkspaceSecretWriter): WorkspaceSecretWriter {
  return {
    set: async (name, value) => {
      refuseOutsideWorkspace(name);
      await store.set(name, value);
    },
    remove: async (name) => {
      refuseOutsideWorkspace(name);
      await store.remove(name);
    },
    has: async (name) => {
      refuseOutsideWorkspace(name);
      return await store.has(name);
    },
  };
}

/**
 * Refuses a name a workspace may not pick: one of Halonic's own or a plugin's.
 *
 * @throws RangeError with a fixed message that never repeats the name
 */
function refuseOutsideWorkspace(name: string): void {
  if (isHalonicSecretName(name)) {
    throw new RangeError("A workspace can't pick a secret that belongs to Halonic.");
  }
  if (isPluginSecretName(name)) {
    throw new RangeError("A workspace can't pick a secret that belongs to a plugin.");
  }
}

/**
 * The secrets as one plugin's backend may read them: only the names stored
 * for that plugin, `plugin__<id>__<secret>` in `secretKey` form, and nothing
 * else, so a plugin can't read a workspace's secret, Halonic's own or
 * another plugin's. The app picks each name from the plugin's own manifest;
 * this is the second check, at the place that reads.
 *
 * @throws RangeError from `get`, for a name that isn't one of the plugin's;
 *   the message never repeats the name
 *
 * @example
 * const own = pluginSecrets(secrets, "weather");
 * await own.get("plugin__weather__acme-key"); // the stored key, or null
 * await own.get("openai-key"); // throws a RangeError
 * await own.get("plugin__rain__acme-key"); // throws a RangeError
 */
export function pluginSecrets(secrets: Secrets, pluginId: string): Secrets {
  const own = secretKey(`${pluginSecretNamePrefix}${pluginId}${pluginSecretSeparator}`);
  return {
    get: async (name) => {
      if (!secretKey(name).startsWith(own)) {
        throw new RangeError("A plugin can read only the secrets stored for it.");
      }
      return await secrets.get(name);
    },
  };
}

// The addresses a stored key may be sent to (HAL-11871, step B of HAL-11343). The key store
// keeps them next to the key; the model resolver reads them on every call.

/** The most origins one key may be allowed to go to. A short list on purpose: each one is a place the key can leak to. */
export const maxAllowedOrigins = 8;

/**
 * Where the keys in a {@link Secrets} store may be sent. A key has either a
 * list of allowed origins, or none recorded (a key saved before origins
 * existed), which the caller treats by the older rules.
 *
 * Names match as `secretKey` matches them. An origin is the scheme, host and
 * port, as {@link originOf} writes it, and is compared as a whole string,
 * never by prefix.
 */
export interface KeyOrigins {
  /**
   * The origins the key may go to, or `undefined` when none is recorded.
   * Never an empty list, and never the key.
   *
   * @throws RangeError when the name breaks the secret name rule
   */
  allowedOrigins(name: string): Promise<readonly string[] | undefined>;
}

/**
 * The key origins of a host that has no list yet, so every key has none
 * recorded. A host passes it on purpose, to say its key store can't hold them.
 */
export const noKeyOrigins: KeyOrigins = {
  allowedOrigins: async () => undefined,
};
