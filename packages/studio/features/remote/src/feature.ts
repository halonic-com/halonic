import { defineFeature, type WorkspaceContext } from "@halonicjs/studio-shell";
import { RemoteControlService } from "./api.ts";
import { followRemote, remoteNow } from "./remote-state.ts";
import { DESCRIPTION, summary } from "./settings/remote-text.ts";

/**
 * Remote: Settings › Remote, where a person lets phones reach this computer, pairs them and
 * revokes them. It shows only while the host's `RemoteControl` says remote is available, which
 * stays false until the gateway passes its attack suite (build plan decision 19).
 */
export const remoteFeature = defineFeature({
  id: "remote",
  title: "Remote",
  wants: [RemoteControlService],
  register(studio) {
    studio.settings.add({
      id: "remote",
      title: "Remote",
      scope: "host",
      order: 35,
      description: DESCRIPTION,
      summary: remoteSummary,
      available: remoteAvailable,
      view: "RemoteSection",
      load: () => import("./settings/remote-section.tsx"),
    });
  },
});

/** Follows the host's `available`; without a `RemoteControl` the section never shows. */
export function remoteAvailable(
  context: WorkspaceContext,
  set: (available: boolean) => void,
): () => void {
  const remote = context.services.find(RemoteControlService);
  if (remote === undefined) return () => undefined;
  return followRemote(remote, (state) => set(state.available));
}

/** The phone list's line under Remote: "Off", or "On · 2 phones". */
export async function remoteSummary(context: WorkspaceContext): Promise<string | undefined> {
  const remote = context.services.find(RemoteControlService);
  if (remote === undefined) return undefined;
  const state = await remoteNow(remote);
  return summary(state.on, state.phones.length);
}
