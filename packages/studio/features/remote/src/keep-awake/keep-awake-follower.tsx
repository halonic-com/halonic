import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import type { DialogHostProps } from "@halonicjs/studio-shell";
import { useEffect } from "react";
import { KeepAwakeService, RemoteControlService } from "../api.ts";
import { followKeepAwake } from "./keep-awake.ts";

/**
 * Keeps the shell's sleep lock following the setting and remote while Settings is closed. It sits
 * with the dialog hosts because the window draws those once, always, and it draws nothing.
 */
export function KeepAwakeFollower({ context }: DialogHostProps) {
  const settings = context.services.find(HostSettingsService);
  const remote = context.services.find(RemoteControlService);
  const host = context.services.find(KeepAwakeService);
  useEffect(() => {
    if (settings === undefined || remote === undefined || host === undefined) return;
    return followKeepAwake(settings, remote, host);
  }, [settings, remote, host]);
  return null;
}
