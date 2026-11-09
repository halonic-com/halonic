/** Version of the {@link Sandbox} port. A breaking change bumps it and comes with an ADR. */
export const sandboxVersion = 1;

/**
 * How files reach the sandbox. `shared`: the program sees the same folders as
 * Halonic, so nothing is copied (a sandbox on this computer). `copied`: the
 * sandbox has its own file system, and the adapter syncs the working folder
 * in before a run and out after it (a VM or Halonic Cloud).
 */
export type SandboxFileAccess = "shared" | "copied";

/**
 * How strong the fence is. `os`: the operating system confines the program
 * (kernel escapes are not covered). `vm`: a micro-VM, with its own kernel.
 * `remote`: another machine.
 */
export type SandboxStrength = "os" | "vm" | "remote";

/** What a sandbox adapter can do. */
export interface SandboxCapabilities {
  /** How files reach the sandbox. */
  files: SandboxFileAccess;
  /** How strong the fence is. */
  strength: SandboxStrength;
}

/** Whether a sandbox works on this machine. */
export interface SandboxCheck {
  /** True when {@link Sandbox.open} can be expected to work. */
  ok: boolean;
  /** What is missing, one plain sentence each, such as "bubblewrap is not installed". Empty when `ok`. */
  missing: string[];
}

/**
 * What a program in the sandbox may reach. Halonic builds it from the
 * person's profile and the trusted workspace, and the agent can't change it.
 * Every path is absolute, in the host's notation.
 *
 * The profile is Halonic's own format, not that of a particular sandbox
 * library, so an adapter for a VM or for Halonic Cloud reads the same one.
 * It is a plain type and not a schema: Halonic builds it in process and never
 * reads it from data, and a port may not import the schema package. An
 * adapter that takes one from outside must check it itself.
 */
export interface SandboxProfile {
  /** The one folder the program writes to, and where it starts. */
  workingFolder: string;
  /** A private temp folder, writable. A fresh one per session; the adapter doesn't clean it up. */
  tempFolder: string;
  /**
   * The agent's own settings folder inside Halonic's data (such as
   * `CLAUDE_CONFIG_DIR`), writable, never the person's own. `null` when the
   * program needs none.
   */
  settingsFolder: string | null;
  /** Paths the program may read but not change, such as the workspace's definition files. */
  readOnlyPaths: string[];
  /** Paths the program may not read or write, such as SSH keys and Halonic's own data. Wins over every other list. */
  deniedPaths: string[];
  /**
   * The only environment variables the program gets, by name and value. The
   * host's own environment is never passed on.
   */
  env: Readonly<Record<string, string>>;
  /** The network. Everything not named here is blocked. */
  network: SandboxNetwork;
  /** How long the whole run may last, in milliseconds, counted from {@link Sandbox.open}. */
  timeLimitMs: number;
}

/** The network a {@link SandboxProfile} allows. */
export interface SandboxNetwork {
  /**
   * The Halonic bridge: the one loopback address the program can reach. An
   * adapter rejects a host that is not a loopback address (`127.0.0.1`, `::1`
   * or `localhost`) when {@link Sandbox.open} is called.
   */
  bridge: { host: string; port: number };
  /**
   * Further sites, by host name such as "registry.npmjs.org" or with a
   * leading "*." for every subdomain. Empty by default.
   */
  allowedSites: string[];
}

/** What to start in a session. */
export interface SandboxCommand {
  /** The program, by name or path. */
  program: string;
  /** Its arguments, passed as they are, never through a shell. */
  args: string[];
  /** Where it starts: the working folder or a folder inside it. Absent means the working folder. */
  cwd?: string;
}

/** How a started program ended. */
export interface SandboxExit {
  /**
   * The exit code, or `null` when a signal ended it. A program the fence can't
   * find or run ends with a non-zero code, not `null`.
   */
  code: number | null;
  /** The signal that ended it, such as "SIGKILL", or `null`. */
  signal: string | null;
  /** Why: it finished by itself, it was stopped (`kill`, `close`, cancel), or the time limit ran out. */
  reason: "exited" | "stopped" | "timeout";
}

/** A program a session started. */
export interface SandboxProcess {
  /** Writes to the program's standard input. Close it to end the input. */
  stdin: WritableStream<Uint8Array>;
  /** The program's standard output, as bytes. */
  stdout: ReadableStream<Uint8Array>;
  /** The program's standard error, as bytes. */
  stderr: ReadableStream<Uint8Array>;
  /** Settles when the program and everything it started has ended. Never rejects. */
  exited: Promise<SandboxExit>;
  /** Stops the program and everything it started. Safe to call twice. */
  kill(): Promise<void>;
}

/** An access the sandbox refused. It becomes the run's `sandbox.blocked` event. */
export type SandboxBlock =
  | { kind: "file"; path: string; access: "read" | "write" }
  | { kind: "network"; host: string; port: number | null };

/** Hears the session's blocked accesses. */
export type SandboxBlockListener = (block: SandboxBlock) => void;

/** One run's sandbox: the programs it started, the fence they are in and the time limit. */
export interface SandboxSession {
  /** The profile the session was opened with. */
  readonly profile: SandboxProfile;
  /**
   * Starts a program inside the fence.
   *
   * @throws when the session is closed, or the sandbox can't launch anything.
   * A program that is missing inside the fence doesn't throw: it ends with a
   * non-zero {@link SandboxExit.code}.
   */
  start(command: SandboxCommand): Promise<SandboxProcess>;
  /** Reports each blocked access from now on. Returns a function that stops the reports. */
  onBlocked(listener: SandboxBlockListener): () => void;
  /**
   * Stops every program the session started, and everything they started, and
   * resolves when they have ended. The session does this by itself when the
   * time limit runs out or the signal given to {@link Sandbox.open} aborts.
   * Safe to call twice.
   */
  close(): Promise<void>;
}

/** Runs programs inside a fence: a sandbox on this computer today, a VM or Halonic Cloud later. */
export interface Sandbox {
  /** Whether it works on this machine and what is missing. Never throws. */
  check(): Promise<SandboxCheck>;
  /** How files reach it and how strong the fence is. */
  capabilities(): SandboxCapabilities;
  /**
   * Opens a session for one run. Cancelling the run, by aborting `signal`,
   * closes the session.
   *
   * @throws when the sandbox doesn't work here (see {@link Sandbox.check}) or the profile can't be applied, including a bridge that is not a loopback address
   */
  open(profile: SandboxProfile, options?: { signal?: AbortSignal }): Promise<SandboxSession>;
}
