import type { InboxRequests, RequestWorkflow } from "@halonicjs/studio-feature-inbox/api";
import type { WorkflowRef, WorkflowsHost } from "@halonicjs/studio-feature-workflows/api";

/** What the Inbox hands back for a workflow: its hub and id, as one key. */
const keyOf = ({ hubId, id }: WorkflowRef): string => `${hubId}/${id}`;

/**
 * The Inbox's request form for one open workspace (requirement `studio.inbox-requests`), over its
 * workflows: every workflow with a `start:` block is offered by its `start.label`, and a request
 * starts it with the message as the `start.field` input. Without an engine to start a run the host
 * has no `startRun`, so nothing is offered.
 *
 * @example
 * services.provide(InboxRequestsService, new WorkspaceRequests(workflowsHost));
 */
export class WorkspaceRequests implements InboxRequests {
  readonly #workflows: WorkflowsHost;
  constructor(workflows: WorkflowsHost) {
    this.#workflows = workflows;
  }

  async offered(): Promise<readonly RequestWorkflow[]> {
    if (this.#workflows.startRun === undefined) return [];
    const listings = await this.#workflows.list();
    const configurations = await Promise.all(
      listings.map((listing) => this.#workflows.configuration(listing)),
    );
    return configurations.flatMap((configuration) => {
      const { request } = configuration;
      const field = request?.fields[0]?.name;
      if (request === undefined || field === undefined) return [];
      return [
        { key: keyOf(configuration), label: request.label, description: configuration.description },
      ];
    });
  }

  subscribe(listener: () => void): () => void {
    return this.#workflows.subscribe(listener);
  }

  async start(key: string, message: string): Promise<{ readonly runId: string }> {
    const { startRun } = this.#workflows;
    const separator = key.indexOf("/");
    const ref = { hubId: key.slice(0, separator), id: key.slice(separator + 1) };
    if (startRun === undefined) throw new Error("The engine isn't there to start the workflow.");
    // Read now, not from the last offer: the workflow may have been edited since.
    const field = (await this.#workflows.configuration(ref)).request?.fields[0]?.name;
    if (field === undefined) {
      throw new Error(`"${key}" isn't offered as a request any more.`);
    }
    return startRun(ref, { [field]: message });
  }
}
