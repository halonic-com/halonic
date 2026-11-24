import type { Clock } from "@halonicjs/std";
import { RunContainerState, type RunContainerStorage } from "./run-container-state.ts";
import type { ContainerControl, ContainerProcess, RunContainer } from "./run-container-types.ts";

/** A clock the test moves by hand. */
export class HandClock implements Clock {
  nowMs: number;

  constructor(nowMs: number) {
    this.nowMs = nowMs;
  }

  now(): Date {
    return new Date(this.nowMs);
  }
}

/** A gate the fake records by the rules it was built for. */
export interface FakeGate {
  rules: unknown;
}

/** A program the fake starts: it ends with `code` when the test calls `finish`, or when killed. */
export class FakeProcess implements ContainerProcess {
  readonly stdin = new WritableStream<Uint8Array>();
  readonly stdout = new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });
  readonly stderr = null;
  readonly exitCode: Promise<number>;
  finish: (code: number) => void = () => undefined;
  killedWith: number | undefined;
  readonly command: string[];

  constructor(command: string[]) {
    this.command = command;
    this.exitCode = new Promise((resolve) => {
      this.finish = resolve;
    });
  }

  kill(signal?: number): void {
    this.killedWith = signal;
    this.finish(137);
  }
}

/** Cloudflare's container, recorded: what it was started with, what it intercepts and runs. */
export class FakeContainer implements ContainerControl<FakeGate> {
  running = false;
  starts: { enableInternet: boolean; env: Record<string, string> }[] = [];
  destroyed = 0;
  intercepts: { scheme: "http" | "https"; host: string; gate: FakeGate }[] = [];
  processes: FakeProcess[] = [];

  start(options: { enableInternet: boolean; env: Record<string, string> }): void {
    this.running = true;
    this.starts.push(options);
  }

  destroy(): Promise<void> {
    this.running = false;
    this.destroyed += 1;
    return Promise.resolve();
  }

  interceptOutboundHttp(host: string, gate: FakeGate): Promise<void> {
    this.intercepts.push({ scheme: "http", host, gate });
    return Promise.resolve();
  }

  interceptOutboundHttps(host: string, gate: FakeGate): Promise<void> {
    this.intercepts.push({ scheme: "https", host, gate });
    return Promise.resolve();
  }

  exec(command: string[]): Promise<ContainerProcess> {
    const started = new FakeProcess(command);
    this.processes.push(started);
    return Promise.resolve(started);
  }
}

/** A Durable Object's storage and alarm, in memory. */
export class FakeStorage implements RunContainerStorage {
  readonly values = new Map<string, unknown>();
  alarmAt: number | null = null;

  get(key: "run"): Promise<never> {
    return Promise.resolve(this.values.get(key) as never);
  }

  put(key: "run", value: unknown): Promise<void> {
    this.values.set(key, { ...(value as object) });
    return Promise.resolve();
  }

  setAlarm(atMs: number): Promise<void> {
    this.alarmAt = atMs;
    return Promise.resolve();
  }

  deleteAlarm(): Promise<void> {
    this.alarmAt = null;
    return Promise.resolve();
  }
}

/** One fake container object: its state, with the container and storage it works on. */
export interface FakeObject {
  state: RunContainerState<FakeGate>;
  container: FakeContainer;
  storage: FakeStorage;
}

/** Builds the fake container object named `objectName`. */
export function fakeObject(objectName: string | undefined, clock: Clock): FakeObject {
  const container = new FakeContainer();
  const storage = new FakeStorage();
  const state = new RunContainerState<FakeGate>({
    objectName,
    container,
    storage,
    gateFor: (rules) => ({ rules }),
    clock,
  });
  return { state, container, storage };
}

/** A container namespace: one fake object per name, made on first use, as Cloudflare does. */
export class FakeNamespace {
  readonly objects = new Map<string, FakeObject>();
  readonly #clock: Clock;

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  /** The object named `name`, as the RPC stub the sandbox calls. */
  get(name: string): RunContainer {
    let object = this.objects.get(name);
    if (object === undefined) {
      object = fakeObject(name, this.#clock);
      this.objects.set(name, object);
    }
    return object.state;
  }
}
