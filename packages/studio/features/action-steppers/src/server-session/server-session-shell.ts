/**
 * The desktop shell's side of "Run with Claude" as the screen sees it, and the user's server as
 * Settings keeps it (plan on HAL-17834, sections 3 and 4). The shell reads the server from the
 * profile itself and checks it again; the screen only uses it to say where the session starts.
 */
import { type ServerTarget, validateServerTarget } from "@halonicjs/action-steppers";

/**
 * What `server_session_open` answered. It never holds a path or the launcher. `terminal-opened`
 * says only that the terminal started; the terminal itself shows how the upload and Claude Code went.
 */
export type ServerSessionAnswer =
  | { readonly kind: "terminal-opened" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "no-terminal" }
  | { readonly kind: "not-configured" }
  | { readonly kind: "unsupported-platform" }
  | { readonly kind: "refused"; readonly reason: string };

/** What the page gives the shell: never a host, a user, a command or a path. */
export interface ServerSessionRequest {
  readonly task: string;
  readonly brief: string;
  readonly requestHash: string;
}

/**
 * Opens a server session through the desktop shell, which asks the user again in its own window
 * with the whole brief in it. Only the desktop app on macOS and Linux has one.
 */
export interface ServerSessionShell {
  open(request: ServerSessionRequest): Promise<ServerSessionAnswer>;
}

/** The user's server as Settings keeps it: empty texts and `null` when nothing is set. */
export interface ServerSettings {
  readonly host: string;
  readonly user: string;
  readonly port: number | null;
}

/** The user's server: not set up, set but refused (with why), or set and checked. */
export type ServerChoice =
  | { readonly kind: "not-set-up" }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "set"; readonly target: ServerTarget };

/**
 * The server `settings` name, checked with `validateServerTarget`: a host or user left empty is
 * not set up, and a refused one says why without echoing the value.
 *
 * @example
 * serverChoice({ host: "build.acme.example", user: "ops", port: null });
 * // { kind: "set", target: { host: "build.acme.example", user: "ops" } }
 */
export function serverChoice(settings: ServerSettings): ServerChoice {
  if (settings.host === "" || settings.user === "") return { kind: "not-set-up" };
  const checked = validateServerTarget({
    host: settings.host,
    user: settings.user,
    port: settings.port ?? undefined,
  });
  return checked.ok
    ? { kind: "set", target: checked.value }
    : { kind: "refused", reason: checked.error };
}
