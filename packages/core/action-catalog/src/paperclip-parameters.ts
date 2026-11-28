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
 * The environment variable an agent reads a bound secret as: a {@link secretName}, but never one
 * that changes what a run does, such as `PATH`, `NODE_OPTIONS` or `ANTHROPIC_BASE_URL`, which could
 * redirect the agent's traffic or load code (architecture note on HAL-17491, row C5's deny list).
 * The lookaheads are fine here because the variable is never in a route, so the shell's regex
 * engine never reads this pattern.
 */
export const bindableVariable: TextParameter = {
  kind: "text",
  pattern:
    /^(?!(?:PATH|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|BASH_ENV|ENV)$)(?!(?:LD_|DYLD_|GIT_|PAPERCLIP_|PYTHON|SSL_CERT_))(?![A-Z0-9_]*(?:_PROXY|_BASE_URL|_API_URL|_CA_BUNDLE|_ENDPOINT|_HOST)$)[A-Z][A-Z0-9_]{0,63}$/,
};

/** The Paperclip Secrets page of one company. */
export const secretsPage = "https://{host}/{company}/company/settings/secrets";
