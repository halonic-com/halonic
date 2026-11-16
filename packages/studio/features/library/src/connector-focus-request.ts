import type { ConnectorRef } from "./new-connector-host.ts";

/**
 * A request to focus a connector's page title, made after **Create** in New connector. The page
 * opens after the request, so the request waits until that connector's page takes it.
 */
let pending: string | undefined;

function keyOf({ hub, id }: ConnectorRef): string {
  return `${hub ?? ""}/${id}`;
}

/** Asks the page of `connector` to focus its title when it is drawn. */
export function requestConnectorTitleFocus(connector: ConnectorRef): void {
  pending = keyOf(connector);
}

/** Whether `connector`'s page is the one asked to focus its title; asking once is answered once. */
export function takeConnectorTitleFocus(connector: ConnectorRef): boolean {
  if (pending !== keyOf(connector)) return false;
  pending = undefined;
  return true;
}
