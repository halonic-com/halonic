// What the WSL setup asks of the Windows machine. A test hands it a fake one;
// `system-host.ts` is the real one. It has no way to touch `.wslconfig`: that
// file is shared by every distro of the user (HAL-3779, section 5.2).

/** One distro as `wsl --list --verbose` shows it. */
export interface WslDistro {
  name: string;
  /** `Running`, `Stopped`, `Installing` and so on, as WSL words it. */
  state: string;
  version: 1 | 2;
  /** Whether this is the distro `wsl` starts when none is named. */
  isDefault: boolean;
}

/** What a program ended with. Output is decoded text, never UTF-16 with NULs. */
export interface ProgramResult {
  /** The exit code, or `null` when the program didn't start. */
  code: number | null;
  output: string;
}

/** The WSL group policy values this setup reads. A value that isn't set is `undefined`. */
export interface WslPolicy {
  /** `AllowWSL`: 0 turns WSL off for the machine. */
  allowWsl: number | undefined;
}

/** The machine, as far as the WSL setup looks at it. */
export interface WslHost {
  /** The Windows build number (19041 is Windows 10 2004, the first with WSL 2). `null` when not Windows. */
  windowsBuild(): Promise<number | null>;
  /** When Windows last started, as text. Equal texts mean no restart in between. */
  bootedAt(): Promise<string>;
  /** The WSL group policy values. */
  policy(): Promise<WslPolicy>;
  /** `wsl --status`. */
  status(): Promise<ProgramResult>;
  /** `wsl --version`: its output carries the kernel's version. */
  version(): Promise<ProgramResult>;
  /** The registered distros, or an empty list when WSL can't list them. */
  distros(): Promise<WslDistro[]>;
  /**
   * `wsl --install --no-distribution --web-download` with one administrator
   * prompt. `code` is the exit code of the elevated program; a turned-down
   * prompt is `cancelled`.
   */
  installWsl(): Promise<ProgramResult & { cancelled: boolean }>;
  /** `wsl --update`, with an administrator prompt when Windows asks for one. */
  updateWsl(): Promise<ProgramResult & { cancelled: boolean }>;
  /** `wsl --import <name> <location> <rootfs> --version 2`. No administrator. */
  importDistro(name: string, location: string, rootfs: string): Promise<ProgramResult>;
  /** Runs a program in the distro without a shell (`wsl -d <name> --exec`), as the distro's default user. */
  runInDistro(name: string, program: string[]): Promise<ProgramResult>;
  /** Puts `command` in the user's `RunOnce` key (no administrator) under Halonic's own value name. */
  setRunOnce(command: string): Promise<void>;
  /** Takes Halonic's value out of `RunOnce`; fine when it isn't there. */
  clearRunOnce(): Promise<void>;
}
