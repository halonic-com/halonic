import type { DefinitionSource } from "@halonicjs/ports";
import type {
  InboxRequests,
  RequestWorkflow,
  StartedRun,
} from "@halonicjs/studio-feature-inbox/api";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";

/** What {@link WorkspaceRequests} needs of the workspace's files and the page's engine. */
export interface WorkspaceRequestsParts {
  /** The kernel's `WorkspaceFiles`: reads with unsaved changes applied. */
  readonly files: {
    read(path: string): Promise<string | null>;
    list(dir: string): Promise<string[]>;
  };
  /** Calls `listener` after every change of the workspace's files; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
  /** The page's engine, which starts a run. Absent where the page has no engine, so nothing is offered. */
  readonly engine?: {
    startRun(
      run: { readonly hubId: string; readonly workflowId: string },
      input: Record<string, unknown>,
    ): Promise<{ readonly id: string }>;
  };
}

/** What the Inbox hands back for a workflow: its hub and id, as one key. */
const keyOf = (hubId: string, id: string): string => `${hubId}/${id}`;

/**
 * The Inbox's request form for one open workspace (requirement `studio.inbox-requests`), over its
 * files: every workflow with a `start:` block is offered by its `start.label`, and a request starts
 * it with the message as the `start.field` input. What is offered depends only on the files, so the
 * Inbox hears of file changes only, not of every run event, and one change costs one read. Without an
 * engine to start a run nothing is offered.
 *
 * @example
 * services.provide(InboxRequestsService, new WorkspaceRequests({ files, onChange, engine }));
 */
export class WorkspaceRequests implements InboxRequests {
  readonly #parts: WorkspaceRequestsParts;
  constructor(parts: WorkspaceRequestsParts) {
    this.#parts = parts;
  }

  async offered(): Promise<readonly RequestWorkflow[]> {
    if (this.#parts.engine === undefined) return [];
    return (await this.#requestable()).map(({ hubId, id, name, label, description }) => ({
      key: keyOf(hubId, id),
      name,
      label,
      description,
    }));
  }

  subscribe(listener: () => void): () => void {
    return this.#parts.onChange(listener);
  }

  async start(key: string, message: string): Promise<StartedRun> {
    const { engine } = this.#parts;
    if (engine === undefined) throw new Error("The engine isn't there to start the workflow.");
    // Read now, not from the last offer: the workflow may have been edited since.
    const found = (await this.#requestable()).find((one) => keyOf(one.hubId, one.id) === key);
    if (found === undefined) throw new Error(`"${key}" isn't offered as a request any more.`);
    const { id: runId } = await engine.startRun(
      { hubId: found.hubId, workflowId: found.id },
      { [found.field]: message },
    );
    return { runId, hubId: found.hubId };
  }

  /** The workflows with a `start:` block, from one load of the workspace as it is now. */
  async #requestable() {
    const { files } = this.#parts;
    const source: DefinitionSource = {
      location: "workspace:unsaved",
      list: async () => files.list("hubs"),
      read: (path) => files.read(path),
      version: async () => "unsaved",
    };
    const workspace = await loadWorkspace(source);
    return filesOf(workspace, "workflow").flatMap((file) => {
      const { start } = file.value;
      if (file.hub === null || start === undefined) return [];
      return [
        {
          hubId: file.hub,
          id: file.value.id,
          name: file.value.name,
          label: start.label,
          field: start.field,
          description: file.value.description,
        },
      ];
    });
  }
}
