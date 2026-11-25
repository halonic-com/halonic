// Halonic's coding tools server, as a harness names it to its program
// (HAL-16737, HAL-16753). The program starts it as its own child, inside
// the same fence. Two checks keep it from being a way round that fence:
// the profile builder names it only when nothing the program may write
// holds its code (checked here, from outside, before anything in the
// sandbox runs), and a harness names it only for a `fenced` session, since
// outside Halonic's fence a program's own sandbox wraps only its shell
// commands and an MCP server would run unfenced.

import type { CodingToolsServer } from "@halonicjs/ports";
import { isInsideOrSame, overlaps } from "./working-folder.ts";

export {
  askingCodingTools,
  type CodingToolsChoice,
  type CodingToolsCommand,
  codingToolsCommand,
  codingToolsServerName,
  readOnlyCodingTools,
} from "./coding-tools-command.ts";

/** Where a run's program may write, and what it may not read. */
export interface CodingToolsRunFolders {
  /** Every folder the profile lets the program write, at its real place. */
  readonly writable: readonly string[];
  /** Whether the profile hides `path` from the program. */
  isDenied(path: string): boolean;
}

/**
 * `server` when the run's program can read its code and can't change it:
 * it names at least one code path, its program lies inside one, none of
 * its code paths is, holds or is inside a writable folder, and none is
 * denied. `undefined` otherwise, so the run names no server (requirement
 * `harness-kit.coding-tools-server`). Every path must be at its real place,
 * as the writable folders are, so a link can't hide where the code is.
 * This is the check that counts: the server checks itself again when it
 * starts, but code rewritten before that would skip its own check.
 */
export function allowedCodingTools(
  server: CodingToolsServer | undefined,
  folders: CodingToolsRunFolders,
): CodingToolsServer | undefined {
  if (server === undefined || server.codePaths.length === 0) return undefined;
  if (!server.codePaths.some((code) => isInsideOrSame(server.program, code))) return undefined;
  const allowed = server.codePaths.every(
    (code) => !folders.writable.some((folder) => overlaps(code, folder)) && !folders.isDenied(code),
  );
  return allowed ? server : undefined;
}
