import type { Clock } from "@halonicjs/std";
import type {
  ContainerControl,
  ContainerProcess,
  OutboundRules,
  RunContainerCommand,
  RunContainerSetup,
} from "./run-container-types.ts";

/** What the object keeps about its run. Kept in storage, so it outlives an eviction. */
interface StoredRun {
  runId: string;
  deadlineMs: number;
  ended: boolean;
}

/** The storage key of {@link StoredRun}. */
const runKey = "run";

/** The parts of the Durable Object's storage the state uses. */
export interface RunContainerStorage {
  /** Reads the stored run, or `undefined` before the first start. */
  get(key: typeof runKey): Promise<StoredRun | undefined>;
  /** Writes the stored run. */
  put(key: typeof runKey, value: StoredRun): Promise<void>;
  /** Sets the object's alarm. */
  setAlarm(atMs: number): Promise<void>;
  /** Clears the object's alarm. */
  deleteAlarm(): Promise<void>;
}

/** What {@link RunContainerState} works with. */
export interface RunContainerStateOptions<Gate> {
  /** The Durable Object's own name, which the Worker sets to the run id. */
  objectName: string | undefined;
  /** The object's container. */
  container: ContainerControl<Gate>;
  /** The object's storage. */
  storage: RunContainerStorage;
  /** Builds the handler the intercepts send outbound traffic to. */
  gateFor(rules: OutboundRules): Gate;
  /** The time the deadline is checked against. */
  clock: Clock;
}

/**
 * The logic of one run's container object, apart from the Durable Object so
 * it can be tested with a fake container. A container serves one run once:
 *
 * - it answers only to the run id it is named after, so no other run reaches it;
 * - it starts once, and a second start is refused rather than reattached,
 *   because whatever the first start left on its disk must not reach a new one;
 * - it is destroyed at the run's end, and its alarm destroys it at the
 *   deadline even when the run object is gone and never calls {@link end}.
 */
export class RunContainerState<Gate> {
  readonly #options: RunContainerStateOptions<Gate>;

  constructor(options: RunContainerStateOptions<Gate>) {
    this.#options = options;
  }

  /** Starts the container with internet off and intercepts only for the bridge and the allowed sites. */
  async begin(setup: RunContainerSetup): Promise<void> {
    this.#refuseOtherRun(setup.runId);
    const { storage, container, clock } = this.#options;
    if ((await storage.get(runKey)) !== undefined) {
      throw new Error(
        `The container of run ${setup.runId} was started before; it never starts again.`,
      );
    }
    if (setup.deadlineMs <= clock.now().getTime()) {
      throw new Error(`Run ${setup.runId} is past its time limit; its container doesn't start.`);
    }
    // Stored before the start, so a start that fails halfway can't be tried again.
    await storage.put(runKey, { runId: setup.runId, deadlineMs: setup.deadlineMs, ended: false });
    await storage.setAlarm(setup.deadlineMs);
    container.start({ enableInternet: false, env: setup.env });
    const gate = this.#options.gateFor({
      bridgeHost: setup.bridgeHost,
      allowedSites: setup.allowedSites,
    });
    if (setup.bridgeHost !== null) {
      await container.interceptOutboundHttp(setup.bridgeHost, gate);
    }
    for (const site of setup.allowedSites) {
      await container.interceptOutboundHttps(site, gate);
    }
  }

  /** Starts a program, while the run is running and inside its time limit. */
  async exec(runId: string, command: RunContainerCommand): Promise<ContainerProcess> {
    const run = await this.#liveRun(runId);
    if (run.deadlineMs <= this.#options.clock.now().getTime()) {
      await this.#stop(run);
      throw new Error(`Run ${runId} is past its time limit; its container was stopped.`);
    }
    return this.#options.container.exec([command.program, ...command.args], {
      cwd: command.cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
  }

  /** Destroys the container at the run's end. Safe to call twice. */
  async end(runId: string): Promise<void> {
    this.#refuseOtherRun(runId);
    const run = await this.#options.storage.get(runKey);
    if (run !== undefined) {
      await this.#stop(run);
    }
  }

  /** The alarm: the run's deadline has come, so the container is destroyed whatever the run object did. */
  async alarm(): Promise<void> {
    const run = await this.#options.storage.get(runKey);
    if (run !== undefined) {
      await this.#stop(run);
    }
  }

  #refuseOtherRun(runId: string): void {
    const name = this.#options.objectName;
    if (name === undefined || name !== runId) {
      throw new Error(`This container belongs to another run than ${runId}.`);
    }
  }

  async #liveRun(runId: string): Promise<StoredRun> {
    this.#refuseOtherRun(runId);
    const run = await this.#options.storage.get(runKey);
    if (run === undefined || run.ended) {
      throw new Error(`Run ${runId} has no running container.`);
    }
    return run;
  }

  async #stop(run: StoredRun): Promise<void> {
    const { storage, container } = this.#options;
    // Marked ended first, so nothing starts in the container while it is torn down.
    await storage.put(runKey, { ...run, ended: true });
    if (container.running) {
      await container.destroy();
    }
    await storage.deleteAlarm();
  }
}
