// What can make a package runner fetch a pinned package from somewhere
// other than the pin's registry: the runner options and the variables that
// `app.package-runner-launch` refuses for a pinned connector.

/** A group of variables that share one refusal reason. */
interface VariableGroup {
  names: ReadonlySet<string>;
  prefixes: readonly string[];
  reason: string;
}

/**
 * Runner options that can fetch the package from somewhere other than the
 * pin's registry: another registry or index, a folder of files, another
 * config file or another cache. Compared in lowercase, before any `=`.
 * `-i` and `-f` are the short forms of `--index-url` and `--find-links`.
 */
const registryOptions = new Set([
  "--registry",
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
]);

/**
 * Groups of variables that no pinned transport may set, in any case, each
 * with the reason a refusal gives. A name is in a group when it is one of
 * its `names` or starts with one of its `prefixes`.
 */
const blockedVariables: readonly VariableGroup[] = [
  {
    names: new Set(["node_options", "node_path", "pythonpath", "pythonstartup", "pythonhome"]),
    prefixes: ["npm_config_", "yarn_", "pnpm_", "bun_", "corepack_", "uv_", "pip_", "pipx_"],
    reason: "could move the registry or run code before the pinned package",
  },
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

/** The words that set a registry option, in the order they appear. */
export function findRegistryOptions(words: readonly string[]): string[] {
  return words.filter(isRegistryOption);
}

/**
 * Whether a word sets a registry option, written `--registry url` or
 * `--registry=url`. An npm scope's registry, `--@acme:registry=url`, counts.
 * A word after the package, which the package reads itself, counts too:
 * the check can't tell where the runner's options end, so it errs to the
 * safe side.
 */
function isRegistryOption(word: string): boolean {
  if (!word.startsWith("-")) {
    return false;
  }
  const name = word.split("=", 1)[0]?.toLowerCase() ?? "";
  return registryOptions.has(name) || (name.startsWith("--@") && name.endsWith(":registry"));
}

function isInGroup(group: VariableGroup, name: string): boolean {
  const lower = name.toLowerCase();
  return group.names.has(lower) || group.prefixes.some((prefix) => lower.startsWith(prefix));
}
