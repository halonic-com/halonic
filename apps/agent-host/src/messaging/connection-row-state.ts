import type { ConnectionRowState } from "@halonicjs/adapter-agent-host-client";
import type { PaperclipConnection } from "@halonicjs/format";
import { type PaperclipConnectionNow, paperclipOrigin } from "@halonicjs/host-agent-messaging-hub";
import type { MessagingId, MessagingSource, MessagingSourceState } from "@halonicjs/ports";

/**
 * A row's state. On this computer, a connection the host holds no key for is
 * `no-key`, so Studio doesn't call a key that is still valid "expired or
 * revoked" (HAL-19032); a server engine's rows stay `signed-out`, as before.
 */
export function rowState(
  joined: boolean,
  noKey: boolean,
  connected: () => MessagingSourceState,
): ConnectionRowState {
  if (!joined) return { kind: "signed-out" };
  return noKey ? { kind: "no-key" } : connected();
}

/** Whether the file still names the address and company the key held for it was made for; true with no key. */
export function fileMatchesKey(
  held: PaperclipConnectionNow | undefined,
  file: PaperclipConnection,
): boolean {
  if (held === undefined) return true;
  return paperclipOrigin(file.address) === held.address && file.company === held.company;
}

/** A connected source's state; offline when its sources couldn't be read. */
export function stateOf(
  id: MessagingId,
  sources: readonly MessagingSource[] | undefined,
  asOf: string,
): MessagingSourceState {
  if (sources === undefined) return { kind: "offline", asOf };
  return sources.find((source) => source.id === id)?.state ?? { kind: "signed-out" };
}
