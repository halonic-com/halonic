import { err, ok, type Result } from "@halonicjs/std";

/** The user's own server, from their profile's settings: never from a request, a card or the page. */
export interface ServerTarget {
  host: string;
  user: string;
  /** The ssh port, when it isn't 22. */
  port?: number;
}

/**
 * A DNS name, an ssh config alias or an IPv4 address: labels of letters,
 * digits and `-`, each starting with a letter or digit. So a host never
 * starts with `-` and can't be read as an ssh option, and never holds `@`,
 * `:`, a space or a shell character.
 */
const hostPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,62}(?:\.[A-Za-z0-9][A-Za-z0-9-]{0,62})*$/;

/** A POSIX user name: never starting with `-`. */
const userPattern = /^[a-z_][a-z0-9_-]{0,31}$/;

function checkPort(port: unknown): Result<number | undefined, string> {
  if (port === undefined || port === null) return ok(undefined);
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    return err("the port must be a whole number from 1 to 65535");
  }
  return ok(port);
}

/**
 * Checks the server settings before anything is built from them (plan on
 * HAL-17834, section 3). The shell repeats the same check in Rust against
 * the same cases (`src/golden/server-session-cases.json`), because it trusts
 * nothing from the page.
 *
 * @returns the target, or why it's refused; the reason never echoes the value
 *
 * @example
 * validateServerTarget({ host: "build.acme.example", user: "ops" }); // ok
 * validateServerTarget({ host: "-oProxyCommand=x", user: "ops" }); // refused
 */
export function validateServerTarget(settings: {
  host: unknown;
  user: unknown;
  port?: unknown;
}): Result<ServerTarget, string> {
  const { host, user } = settings;
  if (typeof host !== "string" || host.length > 253 || !hostPattern.test(host)) {
    return err("the server must be a host name, an ssh alias or an IPv4 address");
  }
  if (typeof user !== "string" || !userPattern.test(user)) {
    return err("the user must be a lower-case user name, such as ops");
  }
  const port = checkPort(settings.port);
  if (!port.ok) return port;
  return ok(port.value === undefined ? { host, user } : { host, user, port: port.value });
}
