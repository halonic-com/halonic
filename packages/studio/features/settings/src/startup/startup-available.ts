import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { LoginItemService } from "../api.ts";
import { description } from "./startup-text.ts";

/**
 * Shows Settings › Startup only where the app gives a login item: the desktop app. Served Studio
 * and the demo give none, so there the section, its row and its Ctrl K command never show.
 */
export function startupAvailable(
  context: WorkspaceContext,
  set: (available: boolean) => void,
): () => void {
  set(context.services.find(LoginItemService) !== undefined);
  return () => undefined;
}

/** The line under the section's name, with "in the menu bar" on macOS. */
export function startupDescription(context: WorkspaceContext): string | undefined {
  const host = context.services.find(LoginItemService);
  return host === undefined ? undefined : description(host.iconIn);
}
