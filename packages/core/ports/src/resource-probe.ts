/** Version of the {@link ResourceProbe} port. A breaking change bumps it and comes with an ADR. */
export const resourceProbeVersion = 1;

/** One process the engine started, such as a harness, a sandbox or an MCP server. */
export interface ProcessUsage {
  /** The operating system's process id. */
  readonly pid: number;
  /** The program's name, such as "claude", without its folder. */
  readonly name: string;
  /** The memory the process holds now (its resident set), in bytes. */
  readonly memoryBytes: number;
}

/**
 * How much disk space a folder's files take. `complete` is `false` when the
 * adapter stopped counting at its limit, so `bytes` is a lower bound.
 */
export interface FolderSize {
  readonly bytes: number;
  readonly complete: boolean;
}

/**
 * Reads what the engine uses on this machine: memory, the processes it
 * started and disk space (failure-path guide, rule 3; requirement
 * `ports.resource-probe`). `ResourceReport` in `core/app` puts the numbers
 * together for `halonic doctor` and the Studio.
 *
 * Every method reads the machine once, when it's called; nothing here polls
 * or keeps a timer. All numbers are whole, non-negative bytes.
 *
 * @example
 * const free = await probe.freeDisk(dataFolder);
 * if (free < 1024 ** 3) warnings.push("low-disk");
 */
export interface ResourceProbe {
  /** The engine process's own memory (its resident set), in bytes. */
  engineMemory(): Promise<number>;

  /**
   * Every process below the engine's own process, children and their
   * children, in ascending `pid` order. Processes that end while they're
   * being read are left out.
   */
  childProcesses(): Promise<readonly ProcessUsage[]>;

  /**
   * The sizes of the files in the folder at `path` and in the folders below
   * it: the bytes they hold, not the blocks the drive sets aside. Symbolic
   * links aren't followed, so a link out of the folder adds nothing. A path
   * where nothing is gives 0 bytes, complete.
   *
   * @param path - an absolute path
   */
  folderSize(path: string): Promise<FolderSize>;

  /**
   * The free space a program without special rights can use on the drive
   * that holds `path`, in bytes. When nothing is at `path` yet, the drive of
   * its nearest existing parent folder.
   *
   * @param path - an absolute path
   */
  freeDisk(path: string): Promise<number>;
}
