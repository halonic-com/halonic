import type { TextParameter } from "@halonicjs/action-steppers";

// Shared by the Paperclip Secrets definitions. It sits next to src/paperclip/,
// not in it, because every file in a service folder is a definition.

/**
 * A Paperclip's host name; pages open there, over `https`. The pattern alone accepts any host:
 * Studio's review runs the request only when it is a Paperclip the user connected
 * (`action-steppers.paperclip-host`).
 */
export const paperclipHost: TextParameter = {
  kind: "text",
  pattern: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){1,8}$/,
};

/** The company's prefix in Paperclip's addresses, such as `ACME` in `https://paperclip.acme.example/ACME/…`. */
export const paperclipCompany: TextParameter = { kind: "text", pattern: /^[A-Za-z0-9]{1,16}$/ };

/** A secret's name, environment-variable style, as agents read it: `ANTHROPIC_API_KEY`. */
export const secretName: TextParameter = { kind: "text", pattern: /^[A-Z][A-Z0-9_]{0,63}$/ };

/**
 * Variable names a bound secret may never take, because the value alone would redirect an agent's
 * traffic, run code or point it at another folder: row C5's deny list (architecture note on
 * HAL-17491), extended in the security review of #6980 with package sources, older API-address
 * names, command and runtime-flag variables, and folder pointers.
 */
export const deniedVariables = {
  exact: [
    "PATH",
    "NODE_OPTIONS",
    "NODE_EXTRA_CA_CERTS",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "BASH_ENV",
    "ENV",
    "GOPROXY",
    "PIP_INDEX_URL",
    "PIP_EXTRA_INDEX_URL",
    "UV_INDEX_URL",
    "UV_DEFAULT_INDEX",
    "OPENAI_API_BASE",
    "CLAUDE_CODE_SHELL_PREFIX",
    "EDITOR",
    "VISUAL",
    "BROWSER",
    "JAVA_TOOL_OPTIONS",
    "JDK_JAVA_OPTIONS",
    "PERL5OPT",
    "RUBYOPT",
    "BUN_OPTIONS",
    "HOME",
    "XDG_CONFIG_HOME",
    "CLAUDE_CONFIG_DIR",
    "CODEX_HOME",
  ],
  prefixes: [
    "LD_",
    "DYLD_",
    "GIT_",
    "PAPERCLIP_",
    "PYTHON",
    "SSL_CERT_",
    "NPM_CONFIG_",
    "AWS_ENDPOINT_URL",
  ],
  suffixes: ["_PROXY", "_BASE_URL", "_API_URL", "_CA_BUNDLE", "_ENDPOINT", "_HOST"],
} as const;

/**
 * The environment variable an agent reads a bound secret as: a {@link secretName}, but never one on
 * {@link deniedVariables}. The lookaheads are fine here because the variable is never in a route,
 * so the shell's regex engine never reads this pattern.
 */
export const bindableVariable: TextParameter = {
  kind: "text",
  pattern: new RegExp(
    `^(?!(?:${deniedVariables.exact.join("|")})$)` +
      `(?!(?:${deniedVariables.prefixes.join("|")}))` +
      `(?![A-Z0-9_]*(?:${deniedVariables.suffixes.join("|")})$)` +
      "[A-Z][A-Z0-9_]{0,63}$",
  ),
};

/** The Paperclip Secrets page of one company. */
export const secretsPage = "https://{host}/{company}/company/settings/secrets";
