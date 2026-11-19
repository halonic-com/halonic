import type { RemoteControl } from "@halonicjs/ports";
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { act } from "react";
import { RemoteControlService } from "../api.ts";
import { remoteFeature } from "../feature.ts";

/** A feature context over `remote` (or none), whose announcer writes into `announced`. */
export function remoteContext(
  remote: RemoteControl | undefined,
  announced: string[] = [],
): WorkspaceContext {
  const find = (key: unknown) => (key === RemoteControlService ? remote : undefined);
  const services = limitedLookup(remoteFeature, { get: find, find });
  const announcer = { announce: (line: string) => announced.push(line) };
  return { services, announcer } as unknown as WorkspaceContext;
}

/** Lets the remote's streams and React catch up, inside `act`. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
