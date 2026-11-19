import { constants } from "node:fs";
import { copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { sandboxRuntimeFolder } from "./srt-runner.ts";
import { reachesNoNetwork } from "./srt-session-env.ts";

/** srt's JVM agent: it reads srt's proxy variables, token included, and points Java at the proxy. */
const javaAgentName = "srt-proxy-agent.jar";

/** Where srt ships the agent, inside its package. */
function shippedJavaAgent(): string {
  return join(sandboxRuntimeFolder(), "vendor", "java-proxy-agent", javaAgentName);
}

/**
 * Copies srt's JVM agent into the session's temp folder, which the sandbox
 * account can read without a grant (Halonic's install may sit in the user's
 * profile, which it can't). Whatever is at that path is removed first and the
 * copy refuses an existing file, so a link a program left there can't turn the
 * copy into a write elsewhere. Returns the copy, or null when there is none:
 * Java then reaches no network, as the `schannel-tls-fails` limit says.
 */
export async function copyJavaAgent(
  tempFolder: string,
  source: string = shippedJavaAgent(),
): Promise<string | null> {
  const target = join(tempFolder, javaAgentName);
  try {
    await rm(target, { force: true });
    await copyFile(source, target, constants.COPYFILE_EXCL);
    return target;
  } catch {
    return null;
  }
}

/** The profile's value of `name`, found without regard to case, as Windows reads names. */
function profileValue(profile: SandboxProfile, name: string): string | undefined {
  const found = Object.keys(profile.env).find((key) => key.toUpperCase() === name.toUpperCase());
  return found === undefined ? undefined : profile.env[found];
}

/**
 * What Java and npm need inside native srt on Windows, set on top of the
 * profile's variables. npm keeps its cache in the session's temp folder,
 * because the sandbox account's own profile folder isn't writable to it,
 * unless the profile names a cache. Java gets srt's agent (`javaAgent`, see
 * {@link copyJavaAgent}) when the session reaches the network: the JVM reads
 * no proxy variable, and srt's proxy wants a token that plain
 * `-Dhttps.proxyHost` can't send. The profile's own `JAVA_TOOL_OPTIONS` is
 * kept after it. A path with a space is left out: the JVM splits the variable
 * on spaces, and `cmd.exe` refuses the quotes that would hold it together.
 */
export function windowsToolEnv(
  profile: SandboxProfile,
  javaAgent: string | null,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (profileValue(profile, "npm_config_cache") === undefined) {
    env["npm_config_cache"] = join(profile.tempFolder, "npm-cache");
  }
  if (javaAgent !== null && !/\s/.test(javaAgent) && !reachesNoNetwork(profile)) {
    const own = profileValue(profile, "JAVA_TOOL_OPTIONS");
    env["JAVA_TOOL_OPTIONS"] = [
      `-javaagent:${javaAgent}`,
      ...(own === undefined ? [] : [own]),
    ].join(" ");
  }
  return env;
}

/** What Halonic adds to the program's variables: {@link windowsToolEnv} on Windows, nothing elsewhere, where srt sets Java's agent itself. */
export async function sessionToolEnv(
  profile: SandboxProfile,
  platform: NodeJS.Platform = process.platform,
): Promise<Record<string, string>> {
  if (platform !== "win32") return {};
  return windowsToolEnv(profile, await copyJavaAgent(profile.tempFolder));
}
