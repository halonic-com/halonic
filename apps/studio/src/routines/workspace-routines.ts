import { shortRunId } from "@halonicjs/app";
import type { RoutineVersions } from "@halonicjs/app/routines";
import type { RunSummary } from "@halonicjs/events";
import type { DefinitionSource } from "@halonicjs/ports";
import { describeTrigger, routineKey, routineStart } from "@halonicjs/routines";
import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import {
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
  type WorkflowWithAgent,
} from "@halonicjs/studio-feature-routines/api";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { editYaml } from "@halonicjs/yaml";
import type { RoutineVersionsAt } from "../changes/workspace-liveness.ts";
import type { RoutineRunStart } from "../engine/engine-service.ts";
import { deleteWithUndo } from "../files/undoable-delete.ts";
import {
  editsOf,
  newRoutineText,
  routineFolder,
  routineIdOf,
  routinePath,
  targetOfFile,
  triggerOfFile,
} from "./routine-files.ts";
import { listedVersionsAt, livenessOf, runningOf } from "./routine-liveness.ts";
import {
  errorsOf,
  findRoutine,
  idOf,
  mailboxesOf,
  nameKey,
  type PlacedFile,
  refusedOf,
  routineFiles,
  routineGone,
  routineKeyOf,
  runsOf,
  type StoredSkip,
  skipOf,
  startedByOf,
  startsOwner,
  summaryOf,
  targetFound,
  targetName,
  targetStartsProgram,
  targetsOf,
  targetWithPrompt,
  workflowsWithAgent,
} from "./routine-reads.ts";
import { nextRunOf, nextTimesOf } from "./routine-times.ts";
import { runNowFailureOf } from "./run-now-failure.ts";

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
  /**
   * Opens the window's trust check, for a Run now refused as not trusted. Absent: the refusal only
   * says so.
   */
  readonly askTrust?: () => Promise<"trusted" | "declined">;
  /** The times the scheduler dropped for a routine, by its key; none when absent. */
  readonly skips?: (key: string) => Promise<readonly StoredSkip[]>;
  /** Calls `listener` each time the scheduler adds to a routine's skips, which starts no run. */
  readonly onSkips?: (listener: () => void) => () => void;
  /**
   * Reads the live version once, then gives the routine at a path from the workspace folder as that
   * version has it and as it is saved (core's `routineVersions`). Without it a routine counts as
   * live and unchanged.
   */
  readonly liveness?: () => Promise<RoutineVersionsAt>;
  /** Hears why a list fell back to the saved files; the console when absent. */
  readonly reportError?: (error: unknown) => void;
  /**
   * Opens Create version with only `paths` in it (source control's `VersionDialogService`), and
   * answers once a version is made or the dialog is closed. With `name`, the dialog says it makes
   * that item live. Absent where the app can't offer that, so there is no `makeLive`.
   */
  readonly versionDialog?: (
    paths: readonly string[],
    options?: { readonly name?: string },
  ) => Promise<"made" | "cancelled">;
  /**
   * Starts what a routine runs, as the scheduler would start it. Absent where the app has no
   * engine, so there is no `runNow`. Rejects with `WindowCantStart` or `StartRefused` for what
   * the window can't start, with the engine's `InputRefused` for an input it can't take, and with
   * the shell's `EngineNotAnswering` when the engine can't be reached.
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
  /** Present only when the app can open Create version; see {@link RoutinesHost.makeLive}. */
  makeLive?: NonNullable<RoutinesHost["makeLive"]>;
  /** Present only when the app can show the trust check; see {@link RoutinesHost.askTrust}. */
  askTrust?: NonNullable<RoutinesHost["askTrust"]>;

  constructor(parts: WorkspaceRoutinesParts) {
    this.#parts = parts;
    const { engine, versionDialog, askTrust } = parts;
    if (engine !== undefined) {
      this.runNow = (ref) => this.#runNow(ref, engine);
    }
    if (versionDialog !== undefined) {
      // Only the routine's own file, so the version holds nothing else the person changed.
      this.makeLive = (ref, options) => versionDialog([routinePath(ref)], options);
    }
    if (askTrust !== undefined) {
      this.askTrust = askTrust;
    }
  }

  hubs(): readonly RoutineHub[] {
    return this.#hubs;
  }

  nameOf(ref: RoutineRef): string | undefined {
    return this.#names.get(nameKey(ref));
  }

  subscribe(listener: () => void): () => void {
    const stops = [
      this.#parts.onChange(listener),
      this.#parts.runs.subscribe(listener),
      this.#parts.onSkips?.(listener) ?? (() => undefined),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }

  async list(): Promise<readonly RoutineListing[]> {
    const [workspace, runs, trusted, versionsAt] = await Promise.all([
      this.#load(),
      this.#parts.runs.list(),
      this.#parts.trusted?.() ?? true,
      this.#listedVersionsAt(),
    ]);
    const now = this.#parts.now();
    const refused = await refusedOf(workspace, runs, this.#parts.skips);
    const listings = await Promise.all(
      routineFiles(workspace).map(async (file, index): Promise<RoutineListing> => {
        const own = runsOf(runs, routineKeyOf(file));
        const versions = await versionsAt(file.path);
        const routine = runningOf(file, versions);
        const target = targetOfFile(file.value.run, file.hub);
        return {
          hubId: file.hub,
          id: idOf(file),
          name: file.value.name,
          enabled: file.value.enabled,
          summary: summaryOf(workspace, routine, file.hub),
          targetName: targetName(workspace, file),
          nextRun: nextRunOf(routine, now, this.#parts.timeZone),
          changesNotLive: versions?.liveState.state === "not-live",
          targetKind: target.kind,
          targetFound: targetFound(workspace, target),
          problems: errorsOf(workspace, file),
          needsSignIn: false,
          needsYou: own.filter((run) => run.status === "waiting").length,
          pausedUntilTrusted: !trusted,
          ...refused[index],
        };
      }),
    );
    for (const listing of listings) this.#names.set(nameKey(listing), listing.name);
    return listings;
  }

  async read(ref: RoutineRef): Promise<RoutineView> {
    const workspace = await this.#load();
    const file = findRoutine(workspace, ref);
    const { value } = file;
    this.#names.set(nameKey(ref), value.name);
    const target = targetOfFile(value.run, file.hub);
    const versions = await this.#versionsOf(file);
    return {
      ...ref,
      name: value.name,
      enabled: value.enabled,
      trigger: triggerOfFile(value.trigger),
      triggerSentence: describeTrigger(value.trigger),
      summary: summaryOf(workspace, runningOf(file, versions), file.hub),
      targetName: targetName(workspace, file),
      target,
      targetState: targetFound(workspace, target) ? "ready" : "not-found",
      startsProgram: targetStartsProgram(workspace, target),
      overlap: value.overlap,
      catchUp: value.catchUp,
      file: file.path,
      ...livenessOf(workspace, file, versions),
      // The row's errors, so the page says why it can't start as the row does (HAL-15300).
      problems: errorsOf(workspace, file),
      inputMissing: workspace.issues.some(
        (issue) => issue.file === file.path && issue.code === "missing-routine-input",
      ),
    };
  }

  async targets(ref: RoutineRef): Promise<readonly RoutineTargetChoice[]> {
    const workspace = await this.#load();
    findRoutine(workspace, ref);
    return targetsOf(workspace, ref.hubId);
  }

  async mailboxes(ref: RoutineRef): Promise<readonly RoutineMailbox[]> {
    const workspace = await this.#load();
    findRoutine(workspace, ref);
    return mailboxesOf(workspace, ref.hubId);
  }

  /** Writes the fields present as edits of the routine's file, which keep its comments and layout. */
  async save(ref: RoutineRef, changes: RoutineChanges): Promise<void> {
    const workspace = await this.#load();
    const file = findRoutine(workspace, ref);
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
    const file = findRoutine(workspace, ref);
    const routine = runningOf(file, await this.#versionsOf(file));
    return nextTimesOf(ref.hubId, routine, count, this.#parts);
  }

  async runs(ref: RoutineRef): Promise<RoutineRuns> {
    const workspace = await this.#load();
    const { value } = findRoutine(workspace, ref);
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
   * Deletes the routine's file as one change, with the way back of {@link deleteWithUndo}: it puts
   * the routine back after later changes too, unless a file has taken its place.
   */
  async trash(ref: RoutineRef): Promise<TrashedRoutine> {
    const { files } = this.#parts;
    const workspace = await this.#load();
    const { value } = findRoutine(workspace, ref);
    return deleteWithUndo(files, {
      paths: [routinePath(ref)],
      what: `routine ${value.name}`,
      name: value.name,
    });
  }

  async starterTarget(hubId: string): Promise<RoutineTargetChoice | undefined> {
    const choices = targetsOf(await this.#load(), hubId);
    // Workflows first, as the hub lists them; the hub's first agent when it has none.
    return choices.find((one) => one.kind === "workflow") ?? choices[0];
  }

  async create({ name, hubId, prompt = "" }: NewRoutine): Promise<RoutineRef> {
    // The hubs are known once the workspace has loaded.
    await this.#load();
    if (!this.#hubs.some((hub) => hub.id === hubId)) {
      throw new Error(`The workspace has no hub "${hubId}".`);
    }
    const choice = await this.starterTarget(hubId);
    if (choice === undefined) throw new NothingToRun();
    return this.#write(name, hubId, targetWithPrompt(choice, prompt));
  }

  async startingRoutines(owner: TriggerOwner): Promise<readonly TriggerRow[]> {
    const workspace = await this.#load();
    const now = this.#parts.now();
    const files = routineFiles(workspace).filter(
      (file) => file.hub === owner.hubId && startsOwner(file, owner),
    );
    const versionsAt = await this.#listedVersionsAt();
    const rows = await Promise.all(
      files.map(async (file): Promise<TriggerRow> => {
        const routine = runningOf(file, await versionsAt(file.path));
        return {
          hubId: file.hub,
          id: idOf(file),
          name: file.value.name,
          enabled: file.value.enabled,
          sentence: describeTrigger(routine.trigger),
          nextRun: nextRunOf(routine, now, this.#parts.timeZone),
        };
      }),
    );
    return rows.sort((first, second) => first.name.localeCompare(second.name));
  }

  async ownerName(owner: TriggerOwner): Promise<string | undefined> {
    return (await this.#owner(owner))?.name;
  }

  async addTrigger(owner: TriggerOwner, prompt = ""): Promise<RoutineRef> {
    const choice = await this.#owner(owner);
    if (choice === undefined)
      throw new Error(`The hub "${owner.hubId}" has no ${owner.kind} "${owner.id}".`);
    return this.#write(choice.name, owner.hubId, targetWithPrompt(choice, prompt));
  }

  async workflowsWithAgent(agent: TriggerOwner): Promise<readonly WorkflowWithAgent[]> {
    return workflowsWithAgent(await this.#load(), agent);
  }

  /** The workflow or agent a Triggers section is on, as its hub lists it. */
  async #owner(owner: TriggerOwner): Promise<RoutineTargetChoice | undefined> {
    return targetsOf(await this.#load(), owner.hubId).find(
      (one) => one.kind === owner.kind && one.id === owner.id,
    );
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
    const { value } = findRoutine(await this.#load(), ref);
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
      throw runNowFailureOf(error);
    }
  }

  /** The versions of one routine, for its page and Next: a history that can't be read rejects, so the page says why. */
  async #versionsOf(file: PlacedFile): Promise<RoutineVersions | undefined> {
    const versionsAt = await this.#parts.liveness?.();
    return versionsAt?.(file.path);
  }

  /** The versions of every routine a list shows, from one read; see {@link listedVersionsAt}. */
  #listedVersionsAt() {
    const { liveness, reportError } = this.#parts;
    return listedVersionsAt(
      liveness,
      reportError ?? ((error) => console.error("Reading which routines are live", error)),
    );
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
