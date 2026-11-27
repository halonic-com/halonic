import { type ServiceRegistry, serviceKey } from "@halonicjs/app";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { type TauriIpc, tauriIpc } from "./tauri-ipc.ts";

/**
 * What the shell's `server_session_open` answered. Services can't import a feature, so this is
 * the same shape as the action-steppers feature's `ServerSessionAnswer`, which accepts it.
 */
export type ServerSessionOpened =
  | { readonly kind: "terminal-opened" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "no-terminal" }
  | { readonly kind: "not-configured" }
  | { readonly kind: "unsupported-platform" }
  | { readonly kind: "refused"; readonly reason: string };

/** What the page gives the shell for a server session: never a host, a user, a command or a path. */
export interface ServerSessionOpenRequest {
  readonly task: string;
  readonly brief: string;
  readonly requestHash: string;
}

/** Opens a server session through the desktop shell, which asks the user again in its own window. */
export interface ServerSessionOpener {
  open(request: ServerSessionOpenRequest): Promise<ServerSessionOpened>;
}

/** The app service "Run with Claude" opens a terminal on the user's server with. */
export const serverSessionShellKey = serviceKey<ServerSessionOpener>("platform.server-session");

/** The refusal for an answer this Studio doesn't know, such as one from a newer shell. */
export const unknownShellAnswer = "the desktop app gave an answer this Studio doesn't know";

/** The answers without a field of their own. */
const plainAnswers: ReadonlySet<unknown> = new Set([
  "terminal-opened",
  "cancelled",
  "no-terminal",
  "not-configured",
  "unsupported-platform",
]);

/** The shell's answer, checked: anything not in {@link ServerSessionOpened} becomes a refusal. */
function checkedAnswer(raw: unknown): ServerSessionOpened {
  if (typeof raw !== "object" || raw === null)
    return { kind: "refused", reason: unknownShellAnswer };
  const kind: unknown = Reflect.get(raw, "kind");
  if (plainAnswers.has(kind)) return { kind } as ServerSessionOpened;
  const reason: unknown = Reflect.get(raw, "reason");
  if (kind === "refused" && typeof reason === "string") return { kind, reason };
  return { kind: "refused", reason: unknownShellAnswer };
}

/** The opener over the shell's IPC: it sends exactly the task, the brief and the request hash. */
function shellOpener(ipc: TauriIpc): ServerSessionOpener {
  return {
    open: async ({ task, brief, requestHash }) =>
      checkedAnswer(await ipc.invoke("server_session_open", { task, brief, requestHash })),
  };
}

/**
 * Gives a workspace's services the opener "Run with Claude" calls
 * (`services.server-session-shell`), in the desktop app on macOS and Linux only. In a browser and
 * on Windows nothing is provided, so the screen shows the manual guide straight away. A rejected
 * call rejects, so the screen can report it.
 *
 * @param services - the services of the workspace that is opening
 * @param page - the page's global object, usually `window`
 * @param platform - the computer's operating system
 * @returns whether an opener was provided
 * @throws ServiceError when the key is already provided
 *
 * @example
 * provideServerSessionShell(services, window, "linux");
 * await services.get(serverSessionShellKey).open({ task, brief, requestHash });
 */
export function provideServerSessionShell(
  services: Pick<ServiceRegistry, "provide">,
  page: object,
  platform: KeyboardPlatform,
): boolean {
  const ipc = tauriIpc(page);
  if (ipc === undefined || platform === "windows") return false;
  services.provide(serverSessionShellKey, shellOpener(ipc));
  return true;
}
