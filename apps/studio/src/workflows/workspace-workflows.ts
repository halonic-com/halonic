import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { DefinitionSource } from "@halonicjs/ports";
import { slugify, uniqueName } from "@halonicjs/std";
import type {
  NewWorkflow,
  WorkflowConfiguration,
  WorkflowHub,
  WorkflowListing,
  WorkflowRef,
  WorkflowsHost,
  WorkflowTests,
  WorkflowView,
} from "@halonicjs/studio-feature-workflows/api";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { editYaml, readYaml, writeYamlFile } from "@halonicjs/yaml";

/** What {@link WorkspaceWorkflows} needs of the workspace's files, events and runs. */
export interface WorkspaceWorkflowsParts {
  /** The kernel's `WorkspaceFiles`: reads with unsaved changes applied, and changes as one undo step. */
  readonly files: {
    read(path: string): Promise<string | null>;
    list(dir: string): Promise<string[]>;
    change(label: string, changes: Record<string, string | null>): void;
  };
  /**
   * Resolves once nothing is unsaved, ending a pending save at once instead of waiting out its
   * pause; rejects when the save fails. `startRun` waits for it, so a run starts on what is on disk.
   * Absent where nothing is saved by itself: the run then starts at once.
   */
  readonly settle?: () => Promise<void>;
  /** Calls `listener` after every change of the workspace's files; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
  /** The workspace's runs, which the rows count, and the way to hear one start, move on or end. */
  readonly runs: {
    list(): Promise<readonly { readonly summary: RunSummary }[]>;
    subscribe(listener: () => void): () => void;
    /** One run's whole log, oldest event first; empty when the run has no log. */
    log(runId: string): Promise<readonly RunEvent[]>;
  };
  /**
   * The page's engine, which starts a run. Absent where the page has no engine, so the host has no
   * `startRun` and the page shows no **Run**.
   */
  readonly engine?: {
    startRun(
      run: { readonly hubId: string; readonly workflowId: string },
      input: Record<string, unknown>,
    ): Promise<{ readonly id: string }>;
  };
}

/** Where the workflow files of a hub are kept. */
const workflowFolder = (hubId: string): string => `hubs/${hubId}/workflows`;

const workflowSuffix = ".workflow.yaml";

/** Where the test cases of a workflow are kept: next to it, in the hub's `workflows` folder. */
const testFile = ({ hubId, id }: WorkflowRef): string => `${workflowFolder(hubId)}/${id}.test.yaml`;

/** The text of a new workflow: a step `start` that leads to the final step `done`. */
function newWorkflowText(id: string, name: string): string {
  return [
    `id: ${id}`,
    // A JSON string is a YAML double-quoted one, so any name a person types is safe.
    `name: ${JSON.stringify(name)}`,
    "initial: start",
    "states:",
    "  start:",
    "    on:",
    "      - to: done",
    "  done:",
    "    type: final",
    "",
  ].join("\n");
}

/**
 * The Workflows feature's host (`studio.workspace-workflows`), over the workspace's files: the list
 * reads the files with their unsaved changes, so a new workflow shows at once, and a new workflow is
 * one undoable change that saves itself like any other. Only `startRun` needs the engine, which
 * opens on the first run.
 *
 * @example
 * services.provide(WorkflowsHostService, new WorkspaceWorkflows({ files, onChange, runs }));
 */
export class WorkspaceWorkflows implements WorkflowsHost {
  readonly #parts: WorkspaceWorkflowsParts;
  #hubs: readonly WorkflowHub[] = [];
  /** The names of the workflows read or made so far, by hub and id, for {@link WorkspaceWorkflows.nameOf}. */
  readonly #names = new Map<string, string>();

  /** Present only when the page has an engine; see {@link WorkflowsHost.startRun}. */
  startRun?: NonNullable<WorkflowsHost["startRun"]>;

  constructor(parts: WorkspaceWorkflowsParts) {
    this.#parts = parts;
    const { engine } = parts;
    if (engine !== undefined) {
      this.startRun = async ({ hubId, id }, input) => {
        // The engine reads the files on disk: wait for a pending save, so a new workflow has its file.
        await this.#saved();
        const { id: runId } = await engine.startRun({ hubId, workflowId: id }, input);
        return { runId };
      };
    }
  }

  /** Waits for the pending save; a failed one is why the run doesn't start (R1, HAL-10622). */
  async #saved(): Promise<void> {
    const { settle } = this.#parts;
    if (settle === undefined) return;
    try {
      await settle();
    } catch {
      // The reason of the failure is on the save's own toast; the run says only what didn't happen.
      // The save covers the whole workspace, so any file can be the one that failed.
      throw new Error("The workspace couldn't be saved.");
    }
  }

  /** The hubs the last {@link WorkspaceWorkflows.list} found; none before the first one. */
  hubs(): readonly WorkflowHub[] {
    return this.#hubs;
  }

  nameOf({ hubId, id }: WorkflowRef): string | undefined {
    return this.#names.get(`${hubId}/${id}`);
  }

  async list(): Promise<readonly WorkflowListing[]> {
    const [workspace, runs] = await Promise.all([this.#load(), this.#parts.runs.list()]);
    const listings = filesOf(workspace, "workflow").flatMap((file) => {
      if (file.hub === null) return [];
      const issues = workspace.issues.filter((issue) => issue.file === file.path);
      const own = runs.filter(
        ({ summary }) =>
          summary.kind === "run" &&
          summary.hubId === file.hub &&
          summary.workflowId === file.value.id,
      );
      const newest = own.reduce<RunSummary | undefined>(
        (best, { summary }) =>
          best === undefined || summary.startedAt > best.startedAt ? summary : best,
        undefined,
      );
      return [
        {
          hubId: file.hub,
          id: file.value.id,
          name: file.value.name,
          description: file.value.description,
          problems: {
            errors: issues.filter((issue) => issue.severity === "error").length,
            warnings: issues.filter((issue) => issue.severity === "warning").length,
          },
          runs: {
            waiting: own.filter(({ summary }) => summary.status === "waiting").length,
            running: own.filter(({ summary }) => summary.status === "running").length,
          },
          lastRun:
            newest === undefined
              ? undefined
              : { startedAt: newest.startedAt, outcome: newest.status },
        },
      ];
    });
    for (const { hubId, id, name } of listings) this.#names.set(`${hubId}/${id}`, name);
    return listings;
  }

  /** Reads one workflow from its file, with unsaved changes applied; throws when the hub has no such workflow. */
  async read({ hubId, id }: WorkflowRef): Promise<WorkflowView> {
    const workspace = await this.#load();
    const file = filesOf(workspace, "workflow").find(
      (one) => one.hub === hubId && one.value.id === id,
    );
    if (file === undefined) throw new Error(`The hub "${hubId}" has no workflow "${id}".`);
    const { value } = file;
    this.#names.set(`${hubId}/${id}`, value.name);
    return {
      hubId,
      id,
      name: value.name,
      initial: value.initial,
      steps: Object.entries(value.states).map(([stepId, state]) => ({
        id: stepId,
        type: state.type,
        agent: state.agent,
      })),
      arrows: Object.entries(value.states).flatMap(([from, state]) =>
        state.on.map((arrow) => ({ from, to: arrow.to, label: arrow.label })),
      ),
      layout: value.layout,
    };
  }

  /** One workflow's settings and the problems the checks found in its file, with unsaved changes applied. */
  async configuration({ hubId, id }: WorkflowRef): Promise<WorkflowConfiguration> {
    const workspace = await this.#load();
    const file = filesOf(workspace, "workflow").find(
      (one) => one.hub === hubId && one.value.id === id,
    );
    if (file === undefined) throw new Error(`The hub "${hubId}" has no workflow "${id}".`);
    const { value } = file;
    return {
      hubId,
      id,
      name: value.name,
      description: value.description,
      initial: value.initial,
      stepIds: Object.keys(value.states),
      file: file.path,
      request: value.start && {
        label: value.start.label,
        fields: [{ name: value.start.field }],
      },
      problems: workspace.issues
        .filter((issue) => issue.file === file.path)
        .map((issue) => ({
          severity: issue.severity,
          code: issue.code,
          message: issue.message,
          stepId: issue.path[0] === "states" ? String(issue.path[1]) : undefined,
        })),
    };
  }

  /**
   * The cases of the workflow's test files, with no results: the app doesn't run tests yet, so
   * there is no `runTests` and the page shows no **Run tests**.
   */
  async tests({ hubId, id }: WorkflowRef): Promise<WorkflowTests> {
    const workspace = await this.#load();
    const exists = filesOf(workspace, "workflow").some(
      (one) => one.hub === hubId && one.value.id === id,
    );
    if (!exists) throw new Error(`The hub "${hubId}" has no workflow "${id}".`);
    return {
      cases: filesOf(workspace, "workflowTest")
        .filter((file) => file.hub === hubId && file.value.workflow === id)
        .flatMap((file) =>
          file.value.cases.map((one) => ({
            name: one.name,
            input: JSON.stringify(one.input, null, 2),
            endsIn: one.expect.final,
          })),
        ),
    };
  }

  /**
   * Adds the run as a case to the workflow's test file: the run's input, and the step the run ended
   * in as `expect.final`. The file is made when the workflow has none. It is one undoable change,
   * and other cases and comments in the file stay as they are.
   */
  async saveRunAsTest(ref: WorkflowRef, runId: string, name: string): Promise<void> {
    await this.read(ref);
    const summary = (await this.#parts.runs.list()).find(
      (one) => one.summary.id === runId,
    )?.summary;
    const started = (await this.#parts.runs.log(runId)).find(
      (event) => event.type === "run.started",
    );
    if (summary === undefined || started === undefined) {
      throw new Error(`The run ${runId} has no log to save as a test.`);
    }
    if (summary.hubId !== ref.hubId || summary.workflowId !== ref.id) {
      throw new Error(`The run ${runId} is not a run of the workflow "${ref.id}".`);
    }
    if (summary.state === null) {
      throw new Error(`The run ${runId} ended in no step, so it can't say what to expect.`);
    }
    const testCase = { name, input: started.input, expect: { final: summary.state } };
    const path = testFile(ref);
    const text = await this.#parts.files.read(path);
    if (text === null) {
      this.#parts.files.change(`Saved a run as the test ${name}`, {
        [path]: writeYamlFile({ version: 1, workflow: ref.id, cases: [testCase] }),
      });
      return;
    }
    const read = readYaml(text);
    if (!read.ok) throw new Error(`The test file ${path} can't be read: ${read.error.message}`);
    const cases = (read.value.data as { cases?: unknown } | null)?.cases;
    if (!Array.isArray(cases)) throw new Error(`The test file ${path} has no list of cases.`);
    if (cases.some((one) => (one as { name?: unknown } | null)?.name === name)) {
      throw new Error(`The workflow already has a test case called "${name}".`);
    }
    const edited = editYaml(text, [
      { kind: "insert", path: ["cases", cases.length], value: testCase },
    ]);
    if (!edited.ok)
      throw new Error(`The test file ${path} can't be changed: ${edited.error.message}`);
    this.#parts.files.change(`Saved a run as the test ${name}`, { [path]: edited.value.text });
  }

  subscribe(listener: () => void): () => void {
    const stops = [this.#parts.onChange(listener), this.#parts.runs.subscribe(listener)];
    return () => {
      for (const stop of stops) stop();
    };
  }

  /** Creates the workflow in `hubId`; throws when the workspace has no such hub, so no stray folder is made. */
  async create({ name, hubId }: NewWorkflow): Promise<WorkflowRef> {
    await this.#load();
    if (!this.#hubs.some((hub) => hub.id === hubId)) {
      throw new Error(`The workspace has no hub "${hubId}".`);
    }
    const folder = workflowFolder(hubId);
    const taken = (await this.#parts.files.list(folder))
      .filter((path) => path.startsWith(`${folder}/`) && path.endsWith(workflowSuffix))
      .map((path) => path.slice(folder.length + 1, -workflowSuffix.length))
      .filter((id) => !id.includes("/"));
    const id = uniqueName(slugify(name), taken);
    this.#parts.files.change(`Created workflow ${name}`, {
      [`${folder}/${id}${workflowSuffix}`]: newWorkflowText(id, name),
    });
    this.#names.set(`${hubId}/${id}`, name);
    return { hubId, id };
  }

  /** Loads the workspace from its files as they are now, and keeps its hubs for {@link WorkspaceWorkflows.hubs}. */
  async #load() {
    const workspace = await loadWorkspace(this.#source());
    this.#hubs = filesOf(workspace, "hub").map((file) => ({
      id: file.value.id,
      name: file.value.name,
    }));
    return workspace;
  }

  /**
   * The workspace's hubs as files, with unsaved changes applied. Only `hubs/` is listed: a workflow
   * is checked against the agents and workflows of its own hub.
   */
  #source(): DefinitionSource {
    const { files } = this.#parts;
    return {
      location: "workspace:unsaved",
      list: async () => files.list("hubs"),
      read: (path) => files.read(path),
      version: async () => "unsaved",
    };
  }
}
