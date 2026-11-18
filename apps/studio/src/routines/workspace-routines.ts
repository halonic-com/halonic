import { shortRunId } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import type { DefinitionSource } from "@halonicjs/ports";
import {
  CronError,
  describeCron,
  describeTrigger,
  nextRun,
  occurrences,
  routineKey,
  routineStart,
} from "@halonicjs/routines";
import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import {
  EngineNotAnswering,
  type NewRoutine,
  NothingToRun,
  type RoutineChanges,
  type RoutineHub,
  type RoutineListing,
  type RoutineMailbox,
  type RoutineNextTimes,
  type RoutineRef,
  type RoutineRun,
  type RoutineRuns,
  type RoutinesHost,
  type RoutineTarget,
  type RoutineTargetChoice,
  type RoutineView,
  type RunNowResult,
  type TrashedRoutine,
  type TriggerOwner,
  type TriggerRow,
} from "@halonicjs/studio-feature-routines/api";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { editYaml } from "@halonicjs/yaml";
import type { RoutineRunStart } from "../engine/engine-service.ts";
import {
  editsOf,
  newRoutineText,
  routineFolder,
  routineIdOf,
  routinePath,
  targetOfFile,
  triggerOfFile,
} from "./routine-files.ts";
import {
  idOf,
  mailboxesOf,
  nameKey,
  type PlacedFile,
  routineFiles,
  routineGone,
  routineKeyOf,
  runsOf,
  type StoredSkip,
  skipOf,
  startedByOf,
  startsOwner,
  summaryOf,
  targetFor,
  targetFound,
  targetName,
  targetsOf,
} from "./routine-reads.ts";

/** What {@link WorkspaceRoutines} needs of the workspace's files, runs, clock and engine. */
export interface WorkspaceRoutinesParts {
  /** The kernel's `WorkspaceFiles`: reads with unsaved changes applied, and changes as one undo step. */
  readonly files: {
    read(path: string): Promise<string | null>;
    list(dir: string): Promise<string[]>;
    change(label: string, changes: Record<string, string | null>): void;
    /** The kernel's `WorkspaceFiles.undo`: `false` when there was nothing to undo. */
    undo(): boolean;
    /** The kernel's `WorkspaceFiles.step`: moves on every change, so it tells a step is still the newest. */
    readonly step: number;
  };
  /** Calls `listener` after every change of the workspace's files; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
  /** The workspace's runs, which the rows and the Runs view read, and the way to hear one change. */
  readonly runs: {
    list(): Promise<readonly { readonly summary: RunSummary }[]>;
    subscribe(listener: () => void): () => void;
  };
  /** The time zone of a schedule that names none: the computer's own, as the scheduler has it. */
  readonly timeZone: string;
  readonly now: () => Date;
  /** Whether the workspace is trusted; routines wait until it is. Trusted when absent. */
  readonly trusted?: () => Promise<boolean>;
  /** The times the scheduler dropped for a routine, by its key; none when absent. */
  readonly skips?: (key: string) => Promise<readonly StoredSkip[]>;
  /**
   * Whether the routine's file is in a live version and whether the saved file differs from it.
   * Without it a routine counts as live and unchanged.
   */
  readonly liveness?: (
    ref: RoutineRef,
  ) => Promise<{ readonly everLive: boolean; readonly changesNotLive: boolean }>;
  /**
   * Starts what a routine runs, as the scheduler would start it. Absent where the app has no
   * engine, so there is no `runNow`.
   */
  readonly engine?: {
    start(
      start: RoutineRunStart,
      trigger: { readonly routineKey: string; readonly at: string },
    ): Promise<{ readonly id: string }>;
  };
}

/** How many of a routine's newest runs the Runs view lists. */
const RUNS_SHOWN = 20;

/** How far ahead the next times of a schedule are looked for. */
const LOOK_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * The Routines feature's host (`studio.workspace-routines`), over the workspace's files: every
 * change is written to the routine files as one undo step, so the list, a new routine and an edit
 * work while the engine is stopped, and only `runNow` needs the engine.
 *
 * @example
 * services.provide(RoutinesHostService, new WorkspaceRoutines({ files, onChange, runs, timeZone, now }));
 */
export class WorkspaceRoutines implements RoutinesHost {
  readonly #parts: WorkspaceRoutinesParts;
  #hubs: readonly RoutineHub[] = [];
  /** The names of the routines read or made so far, by hub and id, for {@link WorkspaceRoutines.nameOf}. */
  readonly #names = new Map<string, string>();

  /** Present only when the app has an engine; see {@link RoutinesHost.runNow}. */
  runNow?: NonNullable<RoutinesHost["runNow"]>;

  constructor(parts: WorkspaceRoutinesParts) {
    this.#parts = parts;
    const { engine } = parts;
    if (engine !== undefined) {
      this.runNow = (ref) => this.#runNow(ref, engine);
    }
  }

  hubs(): readonly RoutineHub[] {
    return this.#hubs;
  }

  nameOf(ref: RoutineRef): string | undefined {
    return this.#names.get(nameKey(ref));
  }

  subscribe(listener: () => void): () => void {
    const stops = [this.#parts.onChange(listener), this.#parts.runs.subscribe(listener)];
    return () => {
      for (const stop of stops) stop();
    };
  }

  async list(): Promise<readonly RoutineListing[]> {
    const [workspace, runs, trusted] = await Promise.all([
      this.#load(),
      this.#parts.runs.list(),
      this.#parts.trusted?.() ?? true,
    ]);
    const now = this.#parts.now();
    const listings = routineFiles(workspace).map((file): RoutineListing => {
      const own = runsOf(runs, routineKeyOf(file));
      return {
        hubId: file.hub,
        id: idOf(file),
        name: file.value.name,
        enabled: file.value.enabled,
        summary: summaryOf(workspace, file),
        targetName: targetName(workspace, file),
        nextRun: file.value.enabled ? this.#nextRunOf(file, now) : undefined,
        needsSignIn: false,
        needsYou: own.filter((run) => run.status === "waiting").length,
        pausedUntilTrusted: !trusted,
      };
    });
    for (const listing of listings) this.#names.set(nameKey(listing), listing.name);
    return listings;
  }

  async read(ref: RoutineRef): Promise<RoutineView> {
    const workspace = await this.#load();
    const file = this.#find(workspace, ref);
    const { value } = file;
    this.#names.set(nameKey(ref), value.name);
    const target = targetOfFile(value.run, file.hub);
    const liveness = (await this.#parts.liveness?.(ref)) ?? {
      everLive: true,
      changesNotLive: false,
    };
    return {
      ...ref,
      name: value.name,
      enabled: value.enabled,
      trigger: triggerOfFile(value.trigger),
      triggerSentence: describeTrigger(value.trigger),
      summary: summaryOf(workspace, file),
      targetName: targetName(workspace, file),
      target,
      targetState: targetFound(workspace, target) ? "ready" : "not-found",
      overlap: value.overlap,
      catchUp: value.catchUp,
      file: file.path,
      ...liveness,
      problems: [
        ...workspace.issues
          .filter((issue) => issue.file === file.path)
          .map((issue) => issue.message),
        ...this.#triggerProblems(file),
      ],
    };
  }

  async targets(ref: RoutineRef): Promise<readonly RoutineTargetChoice[]> {
    const workspace = await this.#load();
    this.#find(workspace, ref);
    return targetsOf(workspace, ref.hubId);
  }

  async mailboxes(ref: RoutineRef): Promise<readonly RoutineMailbox[]> {
    const workspace = await this.#load();
    this.#find(workspace, ref);
    return mailboxesOf(workspace, ref.hubId);
  }

  /** Writes the fields present as edits of the routine's file, which keep its comments and layout. */
  async save(ref: RoutineRef, changes: RoutineChanges): Promise<void> {
    const workspace = await this.#load();
    const file = this.#find(workspace, ref);
    const path = routinePath(ref);
    const text = await this.#parts.files.read(path);
    if (text === null) throw routineGone();
    const edited = editYaml(text, editsOf(changes, file.value, ref.hubId));
    if (!edited.ok)
      throw new Error(`The routine file ${path} can't be changed: ${edited.error.message}`);
    this.#parts.files.change(`Changed routine ${changes.name ?? file.value.name}`, {
      [path]: edited.value.text,
    });
    if (changes.name !== undefined) this.#names.set(nameKey(ref), changes.name);
  }

  async nextTimes(ref: RoutineRef, count: number): Promise<RoutineNextTimes> {
    const workspace = await this.#load();
    const { value } = this.#find(workspace, ref);
    const none = { times: [], atNextCheck: false };
    if (!value.enabled) return none;
    const now = this.#parts.now();
    try {
      if ("schedule" in value.trigger) {
        const to = new Date(now.getTime() + LOOK_AHEAD_MS);
        const times = occurrences(value.trigger, now, to, count, this.#parts.timeZone);
        return { times: times.map((time) => time.toISOString()), atNextCheck: false };
      }
      if (!("every" in value.trigger)) return none;
      const ran = runsOf(
        await this.#parts.runs.list(),
        routineKey({ hub: ref.hubId, routine: value }),
      );
      if (ran.length === 0) return { times: [], atNextCheck: true };
      const times: string[] = [];
      for (let after = now; times.length < count; ) {
        const next = nextRun(value.trigger, after, this.#parts.timeZone);
        if (next === null) break;
        times.push(next.toISOString());
        after = next;
      }
      return { times, atNextCheck: false };
    } catch (error) {
      // A cron or an interval that doesn't parse has no times; `read` lists it among the problems.
      if (error instanceof CronError) return none;
      throw error;
    }
  }

  async runs(ref: RoutineRef): Promise<RoutineRuns> {
    const workspace = await this.#load();
    const { value } = this.#find(workspace, ref);
    const key = routineKey({ hub: ref.hubId, routine: value });
    const runs = runsOf(await this.#parts.runs.list(), key)
      .slice(0, RUNS_SHOWN)
      .map(
        (summary): RoutineRun => ({
          runId: summary.id,
          shortId: shortRunId(summary.id),
          startedAt: summary.startedAt,
          outcome: summary.status,
          startedBy: startedByOf(summary),
        }),
      );
    const stored = (await this.#parts.skips?.(key)) ?? [];
    return { runs, skips: stored.map(skipOf) };
  }

  /**
   * Undo is the workspace's undo, so it puts the routine back only while the delete is still the
   * newest step: after any other change it rejects and undoes nothing.
   */
  async trash(ref: RoutineRef): Promise<TrashedRoutine> {
    const { files } = this.#parts;
    const workspace = await this.#load();
    const { value } = this.#find(workspace, ref);
    files.change(`Deleted routine ${value.name}`, { [routinePath(ref)]: null });
    const afterDelete = files.step;
    return {
      undo: async () => {
        if (files.step !== afterDelete || !files.undo()) {
          throw new KindedError(
            "conflict",
            `${value.name} can't be put back, because the workspace changed after it was deleted.`,
          );
        }
      },
    };
  }

  async starterTarget(hubId: string): Promise<RoutineTargetChoice | undefined> {
    const choices = targetsOf(await this.#load(), hubId);
    // Workflows first, as the hub lists them; the hub's first agent when it has none.
    return choices.find((one) => one.kind === "workflow") ?? choices[0];
  }

  async create({ name, hubId }: NewRoutine): Promise<RoutineRef> {
    // The hubs are known once the workspace has loaded.
    await this.#load();
    if (!this.#hubs.some((hub) => hub.id === hubId)) {
      throw new Error(`The workspace has no hub "${hubId}".`);
    }
    const choice = await this.starterTarget(hubId);
    if (choice === undefined) throw new NothingToRun();
    return this.#write(name, hubId, targetFor(choice));
  }

  async startingRoutines(owner: TriggerOwner): Promise<readonly TriggerRow[]> {
    const workspace = await this.#load();
    const now = this.#parts.now();
    return routineFiles(workspace)
      .filter((file) => file.hub === owner.hubId && startsOwner(file, owner))
      .map(
        (file): TriggerRow => ({
          hubId: file.hub,
          id: idOf(file),
          name: file.value.name,
          enabled: file.value.enabled,
          sentence: describeTrigger(file.value.trigger),
          nextRun: file.value.enabled ? this.#nextRunOf(file, now) : undefined,
        }),
      )
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  async addTrigger(owner: TriggerOwner): Promise<RoutineRef> {
    const workspace = await this.#load();
    const choice = targetsOf(workspace, owner.hubId).find(
      (one) => one.kind === owner.kind && one.id === owner.id,
    );
    if (choice === undefined)
      throw new Error(`The hub "${owner.hubId}" has no ${owner.kind} "${owner.id}".`);
    return this.#write(choice.name, owner.hubId, targetFor(choice));
  }

  /** Writes a new manual routine that starts `target`, with an id taken from `name` (`-2` when the hub has it). */
  async #write(name: string, hubId: string, target: RoutineTarget): Promise<RoutineRef> {
    const folder = routineFolder(hubId);
    const taken = (await this.#parts.files.list(folder)).flatMap(
      (path) => routineIdOf(folder, path) ?? [],
    );
    const id = uniqueName(slugify(name), taken);
    const ref = { hubId, id };
    this.#parts.files.change(`Created routine ${name}`, {
      [routinePath(ref)]: newRoutineText(name, target),
    });
    this.#names.set(nameKey(ref), name);
    return ref;
  }

  async #runNow(
    ref: RoutineRef,
    engine: NonNullable<WorkspaceRoutinesParts["engine"]>,
  ): Promise<RunNowResult> {
    const view = await this.read(ref);
    const { value } = this.#find(await this.#load(), ref);
    if (this.#parts.trusted !== undefined && !(await this.#parts.trusted())) {
      return { started: false, refusal: { reason: "not-trusted" } };
    }
    if (view.targetState === "not-found") {
      return { started: false, refusal: { reason: "target-not-found" } };
    }
    try {
      const placed = { hub: ref.hubId, routine: value };
      const key = routineKey(placed);
      const at = this.#parts.now();
      // A manual start has no earlier run to name, so `{{trigger.lastRun}}` is null.
      const what = routineStart(placed, { at, lastRun: null });
      if (what.hub === null)
        throw new Error(`Routine ${key} runs outside a hub, so it must name one.`);
      const start: RoutineRunStart =
        "workflow" in what
          ? { workflow: { hubId: what.hub, workflowId: what.workflow, input: what.input } }
          : { agent: { hubId: what.hub, agentId: what.agent, prompt: what.prompt } };
      const { id } = await engine.start(start, { routineKey: key, at: at.toISOString() });
      return { started: true, runId: id, shortId: shortRunId(id) };
    } catch (error) {
      if (error instanceof KindedError && error.kind === "unavailable")
        throw new EngineNotAnswering();
      throw error;
    }
  }

  /** The next time a routine starts on its own; none when its trigger isn't a clock or doesn't parse. */
  #nextRunOf(file: PlacedFile, now: Date): string | undefined {
    try {
      return nextRun(file.value.trigger, now, this.#parts.timeZone)?.toISOString();
    } catch (error) {
      if (error instanceof CronError) return undefined;
      throw error;
    }
  }

  /** What the checks of the schedule or interval say, which the file's own checks don't. */
  #triggerProblems(file: PlacedFile): string[] {
    try {
      const { trigger } = file.value;
      if ("schedule" in trigger) describeCron(trigger.schedule);
      nextRun(trigger, this.#parts.now(), this.#parts.timeZone);
      return [];
    } catch (error) {
      if (error instanceof CronError) return [error.message];
      throw error;
    }
  }

  #find(workspace: LoadedWorkspace, ref: RoutineRef): PlacedFile {
    const file = routineFiles(workspace).find(
      (one) => one.hub === ref.hubId && idOf(one) === ref.id,
    );
    if (file === undefined) throw routineGone();
    return file;
  }

  /** Loads the workspace from its files as they are now, and keeps its hubs for {@link WorkspaceRoutines.hubs}. */
  async #load(): Promise<LoadedWorkspace> {
    const workspace = await loadWorkspace(this.#source());
    this.#hubs = filesOf(workspace, "hub").map((file) => ({
      id: file.value.id,
      name: file.value.name,
    }));
    return workspace;
  }

  /** The workspace's hubs, its root `workflows` folder, where routines live, and its root `library`, where shared connectors are, with unsaved changes applied. */
  #source(): DefinitionSource {
    const { files } = this.#parts;
    return {
      location: "workspace:unsaved",
      list: async () => [
        ...(await files.list("hubs")),
        ...(await files.list("workflows")),
        ...(await files.list("library")),
      ],
      read: (path) => files.read(path),
      version: async () => "unsaved",
    };
  }
}
