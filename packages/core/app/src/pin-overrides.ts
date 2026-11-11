// What can make a package runner fetch a pinned package from somewhere
// other than the pin's registry: the runner options, shell options and
// variables that `app.package-runner-launch` refuses for a pinned connector.

/** A group of variables that share one refusal reason. */
interface VariableGroup {
  names: ReadonlySet<string>;
  prefixes: readonly string[];
  reason: string;
}

/**
 * Runner options that can fetch the package from somewhere other than the
 * pin's registry: another registry or index, a folder of files, another
 * config file or another cache, a folder whose config or installed packages
 * the runner reads, a requirements file, a host it may reach without TLS,
 * or another proxy or certificate. Compared in lowercase, before any `=`.
 * `--reg` is npm's shortened `--registry`; the other shortened spellings
 * are refused by `checkAllowedOptions`, which allows only a few options.
 * `-i` and `-f` are the short forms of `--index-url` and `--find-links`;
 * `-c` stands for npm's `-C` (`--prefix`) and pnpm's `-C` (`--dir`).
 */
const registryOptions = new Set([
  "--registry",
  "--reg",
  "--userconfig",
  "--globalconfig",
  "--cache",
  "--index-url",
  "-i",
  "--extra-index-url",
  "--index",
  "--default-index",
  "--find-links",
  "-f",
  "--config-file",
  "--cache-dir",
  "--pip-args",
  "--prefix",
  "-c",
  "--dir",
  "--cwd",
  "--directory",
  "--project",
  "--with-requirements",
  "--with-editable",
  "--constraints",
  "--overrides",
  "--trusted-host",
  "--allow-insecure-host",
  "--proxy",
  "--https-proxy",
  "--cafile",
  "--ca",
  "--cert",
  "--strict-ssl",
  "--node-options",
]);

/** pnpm options that set any config key, written `--config.registry=url`. */
const configPrefix = "--config.";

/**
 * Options that make npm or pnpm run a shell command rather than the
 * package's program: npm's `-c` and `--call`, pnpm's `-c` and
 * `--shell-mode`. `-c` is compared as written, because npm's `-C` is
 * `--prefix`, which `registryOptions` refuses with its own reason.
 */
const shellOptions = new Set(["-c", "--call", "--shell-mode"]);

/**
 * Groups of variables that no pinned transport may set, in any case, each
 * with the reason a refusal gives. A name is in a group when it is one of
 * its `names` or starts with one of its `prefixes`.
 */
const packageManagerVariables: VariableGroup = {
  names: new Set(["node_options", "node_path", "pythonpath", "pythonstartup", "pythonhome"]),
  prefixes: ["npm_config_", "yarn_", "pnpm_", "bun_", "corepack_", "uv_", "pip_", "pipx_"],
  reason: "could move the registry or run code before the pinned package",
};

const blockedVariables: readonly VariableGroup[] = [
  packageManagerVariables,
  {
    names: new Set(["https_proxy", "http_proxy", "all_proxy"]),
    prefixes: [],
    reason: "could send the registry's answers through another server",
  },
  {
    names: new Set([
      "node_extra_ca_certs",
      "node_tls_reject_unauthorized",
      "ssl_cert_file",
      "ssl_cert_dir",
      "requests_ca_bundle",
      "curl_ca_bundle",
    ]),
    prefixes: [],
    reason: "could make the runner trust a server that only claims to be the registry",
  },
  {
    names: new Set(["ld_preload", "ld_library_path", "dyld_insert_libraries", "dyld_library_path"]),
    prefixes: [],
    reason: "could load other code into the runner before the pinned package",
  },
  {
    names: new Set([
      "home",
      "userprofile",
      "appdata",
      "localappdata",
      "xdg_config_home",
      "xdg_cache_home",
      "path",
      "pathext",
      "comspec",
    ]),
    prefixes: [],
    reason: "could make the runner read another config, cache or program",
  },
];

/**
 * The first group of variables that `env` sets, with the names it sets and
 * the group's reason, or `undefined` when it sets none.
 */
export function findBlockedVariables(
  env: Readonly<Record<string, string>>,
): { names: string[]; reason: string } | undefined {
  for (const group of blockedVariables) {
    const names = Object.keys(env).filter((name) => isInGroup(group, name));
    if (names.length > 0) {
      return { names, reason: group.reason };
    }
  }
  return undefined;
}

/**
 * Whether a variable is a package-manager or language setting, in any case,
 * such as `NODE_OPTIONS` or `npm_config_registry`. A pinned launch drops
 * these when it inherits them from its own process, and sets the registry
 * itself. It keeps an inherited proxy, certificate or library folder, which
 * are the person's own machine settings (`app.connector-base-env`).
 */
export function isPackageManagerVariable(name: string): boolean {
  return isInGroup(packageManagerVariables, name);
}

/** The words that set a registry option, in the order they appear. */
export function findRegistryOptions(words: readonly string[]): string[] {
  return words.filter(isRegistryOption);
}

/** The words that make the runner run a shell command, in the order they appear. */
export function findShellOptions(words: readonly string[]): string[] {
  return words.filter((word) => {
    const name = word.split("=", 1)[0] ?? "";
    return shellOptions.has(name.startsWith("--") ? name.toLowerCase() : name);
  });
}

/**
 * Whether a word sets a registry option, written `--registry url` or
 * `--registry=url`. An npm scope's registry, `--@acme:registry=url`, and
 * any pnpm `--config.<key>` count.
 * A word after the package, which the package reads itself, counts too:
 * the check can't tell where the runner's options end, so it errs to the
 * safe side.
 */
function isRegistryOption(word: string): boolean {
  if (!word.startsWith("-")) {
    return false;
  }
  const name = word.split("=", 1)[0]?.toLowerCase() ?? "";
  return (
    registryOptions.has(name) ||
    name.startsWith(configPrefix) ||
    (name.startsWith("--@") && name.endsWith(":registry"))
  );
}

function isInGroup(group: VariableGroup, name: string): boolean {
  const lower = name.toLowerCase();
  return group.names.has(lower) || group.prefixes.some((prefix) => lower.startsWith(prefix));
}
