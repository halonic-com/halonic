import { spawn } from "node:child_process";
import { win32 } from "node:path";
import type { BrowserOpener } from "./browser-opener.ts";

type Opener = { program: string; before: readonly string[] };

/**
 * The system's own opener, by platform: the program and the arguments before the address.
 *
 * macOS and Windows get the program's full path. On Windows a bare name is looked
 * up in the current folder before `PATH`, so a `rundll32.exe` in a workspace folder
 * would run instead. Without `SystemRoot` there is no safe path, so there is no opener.
 */
function openerFor(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): Opener | undefined {
  switch (platform) {
    case "darwin":
      return { program: "/usr/bin/open", before: [] };
    case "win32": {
      const systemRoot = env["SystemRoot"];
      if (!systemRoot || !win32.isAbsolute(systemRoot)) {
        return undefined;
      }
      return {
        program: win32.join(systemRoot, "System32", "rundll32.exe"),
        before: ["url.dll,FileProtocolHandler"],
      };
    }
    default:
      return { program: "xdg-open", before: [] };
  }
}

/** The address as the opener gets it, or `undefined` when it is not an `http` or `https` address. */
function webAddress(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Opens an address in the person's browser with the system's own opener.
 *
 * It starts one program with one argument, never through a shell, and only for an
 * `http` or `https` address. A file path, a `file:` address or anything else is
 * refused before anything starts, so this can't be used to run a script.
 */
export function createSystemBrowserOpener(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): BrowserOpener {
  const opener = openerFor(platform, env);
  return {
    open(url) {
      const address = webAddress(url);
      if (opener === undefined || address === undefined) {
        return Promise.resolve(false);
      }
      const { program, before } = opener;
      return new Promise((resolve) => {
        const child = spawn(program, [...before, address], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.once("error", () => resolve(false));
        child.once("spawn", () => {
          child.unref();
          resolve(true);
        });
      });
    },
  };
}
