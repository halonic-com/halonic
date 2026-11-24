// The parts of Cloudflare's Container API this package uses, written out
// here so the logic and its tests don't need workerd's types. The Durable
// Object in the Worker runtime hands in the real `ctx.container`.

/** A program the container started, as Cloudflare's `ExecProcess` gives it. */
export interface ContainerProcess {
  /** The program's standard input, or `null` when it wasn't piped. */
  readonly stdin: WritableStream<Uint8Array> | null;
  /** The program's standard output, or `null` when it wasn't piped. */
  readonly stdout: ReadableStream<Uint8Array> | null;
  /** The program's standard error, or `null` when it wasn't piped. */
  readonly stderr: ReadableStream<Uint8Array> | null;
  /** Settles with the exit code when the program has ended. */
  readonly exitCode: Promise<number>;
  /** Sends the program a signal. */
  kill(signal?: number): void;
}

/** The container of one Durable Object: Cloudflare's `ctx.container`, as far as this package uses it. */
export interface ContainerControl<Gate> {
  /** Whether the container is running. */
  readonly running: boolean;
  /** Starts the container. */
  start(options: { enableInternet: boolean; env: Record<string, string> }): void;
  /** Stops the container and throws its disk away. */
  destroy(): Promise<void>;
  /** Sends plain HTTP for `host` to `gate`. */
  interceptOutboundHttp(host: string, gate: Gate): Promise<void>;
  /** Sends HTTPS for `host` to `gate`. */
  interceptOutboundHttps(host: string, gate: Gate): Promise<void>;
  /** Starts a program in the running container. */
  exec(
    command: string[],
    options: { cwd: string; stdin: "pipe"; stdout: "pipe"; stderr: "pipe" },
  ): Promise<ContainerProcess>;
}

/** Where outbound traffic may go: the rules {@link outboundGate} checks every request against. */
export interface OutboundRules {
  /**
   * The name the program calls the bridge by, over plain HTTP on port 80, or
   * `null` for a run with no bridge.
   */
  bridgeHost: string | null;
  /** Further sites by host name, or `*.` and a name for every subdomain, reached over HTTPS only. */
  allowedSites: string[];
}

/** What a run's container is started with. */
export interface RunContainerSetup extends OutboundRules {
  /** The run's id. The container object's name must be the same. */
  runId: string;
  /** When the run's time limit runs out, in epoch milliseconds. The container is stopped then. */
  deadlineMs: number;
  /** The only environment variables the container gets, the bridge credential among them. */
  env: Record<string, string>;
}

/** What to start in a run's container. */
export interface RunContainerCommand {
  /** The program, by name or path. */
  program: string;
  /** Its arguments, passed as they are, never through a shell. */
  args: string[];
  /** Where it starts, an absolute path inside the container. */
  cwd: string;
}

/**
 * One run's container object, as the Worker side calls it. Every call names
 * the run, and the object refuses a call for any run but its own.
 */
export interface RunContainer {
  /** Starts the run's container. Refused for a second start, even with the same run id. */
  begin(setup: RunContainerSetup): Promise<void>;
  /** Starts a program in the run's container. */
  exec(runId: string, command: RunContainerCommand): Promise<ContainerProcess>;
  /** Stops the run's container for good. Safe to call twice. */
  end(runId: string): Promise<void>;
}
