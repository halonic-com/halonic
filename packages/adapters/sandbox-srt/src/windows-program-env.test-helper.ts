import { join } from "node:path";

/** What a session adds on Windows only (windows-program-env): srt's JVM agent in the temp folder, and npm's cache and the agent in the program's environment. */
export function windowsExtras(tempFolder: string) {
  const onWindows = process.platform === "win32";
  return {
    tempFiles: onWindows ? ["srt-proxy-agent.jar"] : [],
    programEnv: onWindows
      ? {
          npm_config_cache: join(tempFolder, "npm-cache"),
          JAVA_TOOL_OPTIONS: `-javaagent:${join(tempFolder, "srt-proxy-agent.jar")}`,
        }
      : {},
  };
}
