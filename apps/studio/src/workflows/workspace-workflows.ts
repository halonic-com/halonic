import { stateAgentsOf } from "@halonicjs/adapter-workspace-models";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import {
  type NewWorkflow,
  type StartRefusal,
  startRefusalOf,
  type WorkflowConfiguration,
  type WorkflowHub,
  type WorkflowListing,
  type WorkflowRef,
  type WorkflowStepChange,
  type WorkflowsHost,
  type WorkflowTests,
  type WorkflowView,
} from "@halonicjs/studio-feature-workflows/api";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { editYaml, type YamlEdit } from "@halonicjs/yaml";
import { type PageRuns, workflowRefusalOf } from "../engine/page-refusal.ts";
import { checkedSource } from "../library/workspace-library-items.ts";
import { programOf } from "./step-program.ts";
import {
  endedIn,
  newWorkflowText,
  problemsOf,
  testFile,
  withTestCase,
  workflowFolder,
  workflowSuffix,
} from "./workflow-files.ts";

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
  /** The workspace folder's absolute path, which the commands to copy name (D1, HAL-12725). */
  readonly folder?: string;
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
   * Opens the window's trust check, for a start refused because the workspace isn't trusted yet.
   * Absent: the Run panel offers only **Try again**.
   */
  readonly askTrust?: () => Promise<"trusted" | "declined">;
  /**
   * The page's engine, which starts a run. Absent where the page has no engine, so the host has no
   * `startRun` and the page shows no **Run**.
   */
  readonly engine?: {
    startRun(
      run: { readonly hubId: string; readonly workflowId: string },
      input: Record<string, unknown>,
    ): Promise<{ readonly id: string }>;
    /** What it can start: an agent in a harness program, and a run's `stdio` connectors. */
    readonly pageRuns: PageRuns;
  };
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
  /** Who hears that a name was learned or changed, so a tab opened before the read follows it. */
  readonly #nameListeners = new Set<() => void>();

  readonly folder: string | undefined;

  /** Present only when the page has an engine; see {@link WorkflowsHost.startRun}. */
  startRun?: NonNullable<WorkflowsHost["startRun"]>;
  /** Present only when the app can show the trust check; see {@link WorkflowsHost.askTrust}. */
  askTrust?: NonNullable<WorkflowsHost["askTrust"]>;
  /** Present with `startRun`; see {@link WorkflowsHost.startRefusal}. */
  startRefusal?: (ref: WorkflowRef) => Promise<StartRefusal | undefined>;

  constructor(parts: WorkspaceWorkflowsParts) {
    this.#parts = parts;
    this.folder = parts.folder;
    const { engine, askTrust } = parts;
    if (askTrust !== undefined) {
      this.askTrust = askTrust;
    }
    if (engine !== undefined) {
      this.startRun = async ({ hubId, id }, input) => {
        // The engine reads the files on disk: wait for a pending save, so a new workflow has its file.
        await this.#saved();
        const { id: runId } = await engine.startRun({ hubId, workflowId: id }, input);
        return { runId };
      };
      // The engine's own check, on the files as the page shows them.
      this.startRefusal = async ({ hubId, id }) => {
        const refusal = workflowRefusalOf(
          await this.#load(),
          { hubId, workflowId: id },
          engine.pageRuns,
        );
        return refusal === undefined ? undefined : startRefusalOf(refusal);
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
      throw new KindedError("unavailable", "The workspace couldn't be saved.");
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
      const issues = problemsOf(workspace, file);
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
    this.#learnNames(listings);
    return listings;
  }

  /** Reads one workflow from its file, with unsaved changes applied; throws when the hub has no such workflow. */
  async read({ hubId, id }: WorkflowRef): Promise<WorkflowView> {
    const workspace = await this.#load();
    const file = filesOf(workspace, "workflow").find(
      (one) => one.hub === hubId && one.value.id === id,
    );
    if (file === undefined) throw workflowGone();
    const { value } = file;
    this.#learnNames([{ hubId, id, name: value.name }]);
    const stateAgents = stateAgentsOf(workspace, { hubId, workflowId: id });
    return {
      hubId,
      id,
      name: value.name,
      initial: value.initial,
      steps: Object.entries(value.states).map(([stepId, state]) => ({
        id: stepId,
        type: state.type,
        title: stepTitle(state.description),
        agent: state.agent,
        description: state.description,
        prompt: typeof state.input === "string" ? state.input : undefined,
        promptIsData: state.input !== undefined && typeof state.input !== "string",
        output: state.output,
        program: programOf(stateAgents.get(stepId)),
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
    if (file === undefined) throw workflowGone();
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
      problems: problemsOf(workspace, file).map((issue) => ({
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        stepId: issue.path[0] === "states" ? String(issue.path[1]) : undefined,
      })),
    };
  }

  /**
   * The cases of the workflow's test files, with no results: the app doesn't run tests yet, so
   * there is no `runTests` and the page shows the command that runs them in a terminal instead.
   */
  async tests({ hubId, id }: WorkflowRef): Promise<WorkflowTests> {
    const workspace = await this.#load();
    const exists = filesOf(workspace, "workflow").some(
      (one) => one.hub === hubId && one.value.id === id,
    );
    if (!exists) throw workflowGone();
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
    const final = endedIn(runId, summary.state);
    const testCase = { name, input: started.input, expect: { final } };
    const path = testFile(ref);
    const text = withTestCase(path, await this.#parts.files.read(path), ref.id, testCase);
    this.#parts.files.change(`Saved a run as the test ${name}`, { [path]: text });
  }

  /**
   * Adds the step at the end of the file's steps, with its place in `layout`, as one undoable
   * change; the file keeps its comments and the order of its keys.
   */
  async addStep(
    ref: WorkflowRef,
    type: "task" | "wait",
    at: { readonly x: number; readonly y: number },
  ): Promise<string> {
    const { file, text } = await this.#fileOf(ref);
    const id = uniqueName(type === "wait" ? "wait" : "step", Object.keys(file.value.states));
    const edited = editYaml(text, [
      { kind: "set", path: ["states", id], value: type === "wait" ? { type: "wait" } : {} },
      { kind: "set", path: ["layout", id], value: { x: at.x, y: at.y } },
    ]);
    if (!edited.ok) throw cantChange();
    this.#parts.files.change(`Added step ${id} to workflow ${file.value.name}`, {
      [file.path]: edited.value.text,
    });
    return id;
  }

  /** Takes `layout` out of the workflow's file, as one undoable change; writes nothing when it has none. */
  async resetLayout(ref: WorkflowRef): Promise<void> {
    const { file, text } = await this.#fileOf(ref);
    if (Object.keys(file.value.layout).length === 0) return;
    const edited = editYaml(text, [{ kind: "delete", path: ["layout"] }]);
    if (!edited.ok) throw cantChange();
    this.#parts.files.change(`Laid out workflow ${file.value.name} again`, {
      [file.path]: edited.value.text,
    });
  }

  /** The workflow's file, as read and as text; throws `not_found` when the hub has no such workflow. */
  async #fileOf({ hubId, id }: WorkflowRef) {
    const workspace = await this.#load();
    const file = filesOf(workspace, "workflow").find(
      (one) => one.hub === hubId && one.value.id === id,
    );
    if (file === undefined) throw workflowGone();
    const text = await this.#parts.files.read(file.path);
    if (text === null) throw workflowGone();
    return { file, text };
  }

  /**
   * Edits the step in the workflow's file in place, so comments and the order of its keys stay, as
   * one undoable change: each field given is set, and an empty one is taken out of the file.
   */
  async changeStep(ref: WorkflowRef, stepId: string, change: WorkflowStepChange): Promise<void> {
    const { file, text } = await this.#fileOf(ref);
    const state = Object.hasOwn(file.value.states, stepId) ? file.value.states[stepId] : undefined;
    if (state === undefined) {
      throw new KindedError("not_found", `This workflow has no step "${stepId}" any more.`);
    }
    if (
      change.prompt !== undefined &&
      state.input !== undefined &&
      typeof state.input !== "string"
    ) {
      throw new KindedError(
        "invalid_input",
        "This step's prompt is written as data in its file, so it can only be changed there.",
      );
    }
    const edits: YamlEdit[] = [];
    for (const [field, key] of stepFieldKeys) {
      const next = change[field];
      if (next === undefined) continue;
      const path = ["states", stepId, key];
      if (next.trim() !== "") edits.push({ kind: "set", path, value: next });
      else if (state[key] !== undefined) edits.push({ kind: "delete", path });
    }
    if (edits.length === 0) return;
    const edited = editYaml(text, edits);
    if (!edited.ok) throw cantChange();
    this.#parts.files.change(`Changed step ${stepId} of workflow ${file.value.name}`, {
      [file.path]: edited.value.text,
    });
  }

  subscribe(listener: () => void): () => void {
    this.#nameListeners.add(listener);
    const stops = [this.#parts.onChange(listener), this.#parts.runs.subscribe(listener)];
    return () => {
      this.#nameListeners.delete(listener);
      for (const stop of stops) stop();
    };
  }

  /**
   * Keeps the names for {@link WorkspaceWorkflows.nameOf} and tells subscribers once when one is
   * new or changed: a tab opened before the first read shows the id until then (L14, HAL-12730).
   */
  #learnNames(named: readonly { hubId: string; id: string; name: string }[]): void {
    let learned = false;
    for (const { hubId, id, name } of named) {
      const key = `${hubId}/${id}`;
      if (this.#names.get(key) === name) continue;
      this.#names.set(key, name);
      learned = true;
    }
    if (!learned) return;
    for (const listener of [...this.#nameListeners]) listener();
  }

  /**
   * Sets the workflow's `name` in its file, so comments and the order of its keys stay, as one
   * undoable change; the id and the file's path stay. Throws `conflict` when another workflow of the
   * hub has the name, whatever its case.
   */
  async rename(ref: WorkflowRef, name: string): Promise<void> {
    const trimmed = name.trim();
    if (trimmed === "") throw new KindedError("invalid_input", "A workflow needs a name.");
    const workspace = await this.#load();
    const inHub = filesOf(workspace, "workflow").filter((one) => one.hub === ref.hubId);
    const file = inHub.find((one) => one.value.id === ref.id);
    if (file === undefined) throw workflowGone();
    const other = inHub.find(
      (one) => one.value.id !== ref.id && one.value.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (other !== undefined) {
      throw new KindedError("conflict", `A workflow called ${other.value.name} already exists.`);
    }
    const text = await this.#parts.files.read(file.path);
    if (text === null) throw workflowGone();
    const edited = editYaml(text, [{ kind: "set", path: ["name"], value: trimmed }]);
    if (!edited.ok) throw cantChange();
    this.#parts.files.change(`Renamed workflow ${file.value.name} to ${trimmed}`, {
      [file.path]: edited.value.text,
    });
    this.#learnNames([{ hubId: ref.hubId, id: ref.id, name: trimmed }]);
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
    // The checks' files, so an agent's `model:` alias is checked against models.yaml.
    const workspace = await loadWorkspace(checkedSource(this.#parts.files));
    this.#hubs = filesOf(workspace, "hub").map((file) => ({
      id: file.value.id,
      name: file.value.name,
    }));
    return workspace;
  }
}

/** The key in the step's part of the file that each field of the docked step card changes. */
const stepFieldKeys = [
  ["description", "description"],
  ["prompt", "input"],
  ["output", "output"],
] as const satisfies readonly (readonly [keyof WorkflowStepChange, string])[];

/** What a read of a workflow the workspace doesn't have rejects with: Studio shows the item-gone state for it. */
function workflowGone(): KindedError {
  return new KindedError("not_found", "This workflow isn't in this workspace any more.");
}

/** What an edit of a workflow's file rejects with when the file is written in a way it can't change. */
function cantChange(): KindedError {
  return new KindedError(
    "invalid_input",
    "This workflow's file couldn't be changed as it is written.",
  );
}

/**
 * A step's own words for it: the first line of its description, as the run page and the CLI name
 * it. `undefined` when there is none, or when the line still holds a `{{ }}` placeholder that only
 * a run can fill in.
 */
function stepTitle(description: string | undefined): string | undefined {
  const line = description?.split("\n")[0]?.trim();
  return line === undefined || line === "" || line.includes("{{") ? undefined : line;
}
