import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import type { GoogleSetupPorts } from "@halonicjs/host-server";
import type { TrustStore } from "@halonicjs/ports";
import { type ProfileFolder, type ProfilePlatform, trustFolder } from "@halonicjs/profile";
import { openGoogleSetup } from "./google/google-setup.ts";

/** The trust records in the profile folder, which workspace connectors' grants are checked against. */
export function profileTrustStore(profileFolder: string): TrustStore {
  return new FileTrustStore(trustFolder(profileOf(profileFolder)));
}

/** The Google setup of the profile folder, or `undefined` without one. */
export function profileGoogleSetup(
  profileFolder: string | undefined,
  workspaceRoots: readonly string[],
): GoogleSetupPorts | undefined {
  if (profileFolder === undefined) return undefined;
  return openGoogleSetup({ profile: profileOf(profileFolder), env: process.env, workspaceRoots });
}

/** The profile folder `--profile-folder` names, or `undefined` without one. */
export function optionalProfileOf(root: string | undefined): ProfileFolder | undefined {
  return root === undefined ? undefined : profileOf(root);
}

/** The profile folder `--profile-folder` names, with the system its path belongs to. */
export function profileOf(root: string): ProfileFolder {
  const platforms: Partial<Record<NodeJS.Platform, ProfilePlatform>> = {
    win32: "windows",
    darwin: "macos",
  };
  return { platform: platforms[process.platform] ?? "linux", root };
}
