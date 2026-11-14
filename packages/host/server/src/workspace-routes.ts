import type { ServerPorts, WorkspaceFacts } from "./api.ts";

/** What `GET /api/workspace` answers. The served Studio shows it and the phone's workspace picker lists it. */
export interface WorkspaceBody {
  readonly name: string;
  /** Whether this is the sample workspace. */
  readonly sample: boolean;
  /** The folder with the home folder shortened to `~`, or only the folder's own name. Never an absolute path. */
  readonly folder: string;
}

export interface WorkspaceRoutes {
  /** `GET /api/workspace`: which workspace this server shows. Read-only. */
  show(): Promise<Response>;
}

/**
 * The folder as a person sees it: `~/Projects/acme` for a folder under the
 * home folder, `~` for the home folder itself, and for any other folder only
 * its own name. The absolute path stays on the computer, because it tells a
 * caller the account's name and how the disk is laid out.
 * Both slash kinds count as separators, so a Windows path works too.
 */
export function shownFolder(folder: string, home: string | null): string {
  const path = withoutTrailingSlashes(folder.replaceAll("\\", "/"));
  const homePath = home === null ? "" : withoutTrailingSlashes(home.replaceAll("\\", "/"));
  if (homePath !== "") {
    if (path === homePath) return "~";
    if (path.startsWith(`${homePath}/`)) return `~${path.slice(homePath.length)}`;
  }
  return path.slice(path.lastIndexOf("/") + 1);
}

function withoutTrailingSlashes(path: string): string {
  return path.replace(/\/+$/u, "");
}

export function createWorkspaceRoutes(
  workspace: NonNullable<ServerPorts["workspace"]>,
): WorkspaceRoutes {
  return {
    async show() {
      const facts: WorkspaceFacts = await workspace.describe();
      const body: WorkspaceBody = {
        name: facts.name,
        sample: facts.sample,
        folder: shownFolder(facts.folder, facts.home),
      };
      return Response.json(body);
    },
  };
}
