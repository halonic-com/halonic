import { spawn } from "node:child_process";
import type { BrowserOpener } from "./browser-opener.ts";

/** The system's own opener for an address, by platform: the program and the arguments before the address. */
function openerFor(platform: NodeJS.Platform): { program: string; before: readonly string[] } {
  switch (platform) {
    case "darwin":
      return { program: "open", before: [] };
    case "win32":
      return { program: "rundll32", before: ["url.dll,FileProtocolHandler"] };
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
): BrowserOpener {
  const { program, before } = openerFor(platform);
  return {
    open(url) {
      const address = webAddress(url);
      if (address === undefined) {
        return Promise.resolve(false);
      }
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
