import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  type DetachedStart,
  macLaunchFile,
  openTerminal,
  quoteForSh,
  type StartDetached,
  type TerminalCommand,
} from "./open-terminal.ts";

const onWindows = process.platform === "win32";

const signIn: TerminalCommand = {
  program: "/opt/claude/bin/claude",
  args: ["auth", "login"],
  variables: { CLAUDE_CONFIG_DIR: "/data/agents/writer/settings" },
};

/** Invented Windows folders, built from one drive so the paths stay made up. */
const drive = "W:\\"; // leak-guard: allow absolute-path an invented Windows drive
const windowsFolder = `${drive}Windows`;
const windowsHome = `${drive}person`;
const windowsClaude = `${windowsHome}\\bin\\claude.exe`;

const windowsSignIn: TerminalCommand = {
  program: windowsClaude,
  args: ["auth", "login"],
  variables: { CLAUDE_CONFIG_DIR: `${windowsHome}\\halonic\\agents\\writer` },
};

/** A starter that records what it is asked to start and starts nothing. */
function recordingStarter(): { start: StartDetached; started: DetachedStart[] } {
  const started: DetachedStart[] = [];
  return {
    started,
    start: async (start) => {
      started.push(start);
    },
  };
}

const folders: string[] = [];

async function newFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "open-terminal-test-"));
  folders.push(folder);
  return folder;
}

afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

describe("on Windows", () => {
  const env = { SystemRoot: windowsFolder, PATH: `${windowsFolder}\\System32` };

  it("asks cmd.exe from the system folder to start the program in a new window", async () => {
    const { start, started } = recordingStarter();

    const opened = await openTerminal(windowsSignIn, {
      platform: "win32",
      env,
      home: windowsHome,
      start,
    });

    expect(opened).toEqual({ opened: true });
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      program: `${windowsFolder}\\System32\\cmd.exe`,
      args: ["/d", "/v:off", "/s", "/c", `"start "Halonic" "${windowsClaude}" auth login"`],
      cwd: windowsHome,
      verbatim: true,
    });
  });

  it("passes the variables in the environment, never on the command line", async () => {
    const { start, started } = recordingStarter();

    await openTerminal(windowsSignIn, { platform: "win32", env, home: windowsHome, start });

    expect(started[0]?.env).toMatchObject({
      PATH: `${windowsFolder}\\System32`,
      CLAUDE_CONFIG_DIR: windowsSignIn.variables["CLAUDE_CONFIG_DIR"],
    });
    expect(started[0]?.args.join(" ")).not.toContain("agents");
  });

  it("starts nothing for a program path with a %, which cmd.exe would expand", async () => {
    const { start, started } = recordingStarter();
    const odd = { ...windowsSignIn, program: `${drive}100%\\claude.exe` };

    const opened = await openTerminal(odd, {
      platform: "win32",
      env,
      home: windowsHome,
      start,
    });

    expect(opened.opened).toBe(false);
    expect(started).toEqual([]);
  });

  it("starts nothing when the Windows folder isn't known", async () => {
    const { start, started } = recordingStarter();

    const opened = await openTerminal(windowsSignIn, {
      platform: "win32",
      env: { PATH: `${windowsFolder}\\System32` },
      home: windowsHome,
      start,
    });

    expect(opened.opened).toBe(false);
    expect(started).toEqual([]);
  });
});

describe("on macOS", () => {
  it("opens a .command file that runs the program with the variables", async () => {
    const tempFolder = await newFolder();
    const { start, started } = recordingStarter();

    const opened = await openTerminal(signIn, {
      platform: "darwin",
      env: { PATH: "/usr/bin" },
      home: "/person",
      tempFolder,
      start,
    });

    expect(opened).toEqual({ opened: true });
    expect(started[0]).toMatchObject({ program: "/usr/bin/open", cwd: "/person" });
    const file = started[0]?.args[0] ?? "";
    expect(file.startsWith(tempFolder)).toBe(true);
    expect(file.endsWith(".command")).toBe(true);
    expect(await readFile(file, "utf8")).toBe(
      "#!/bin/sh\nexec '/usr/bin/env' 'CLAUDE_CONFIG_DIR=/data/agents/writer/settings' '/opt/claude/bin/claude' 'auth' 'login'\n",
    );
  });

  it.skipIf(onWindows)(
    "[platform:win32] Windows has no file modes: lets only the person read and run the file",
    async () => {
      const tempFolder = await newFolder();
      const { start, started } = recordingStarter();

      await openTerminal(signIn, {
        platform: "darwin",
        env: {},
        home: "/person",
        tempFolder,
        start,
      });

      const mode = (await stat(started[0]?.args[0] ?? "")).mode & 0o777;
      expect(mode).toBe(0o700);
    },
  );

  it.skipIf(onWindows)(
    "[platform:win32] needs /bin/sh: keeps a folder with quotes and $( ) in it as one word",
    async () => {
      const folder = '/data/it\'s "here" $(touch pwned) `id` \\ end';
      const file = join(await newFolder(), "launch.command");
      const printing = {
        program: "/usr/bin/printenv",
        args: ["AGENT_FOLDER"],
        variables: { AGENT_FOLDER: folder },
      };
      await writeFile(file, macLaunchFile(printing));

      const { stdout } = await promisify(execFile)("/bin/sh", [file]);

      expect(stdout).toBe(`${folder}\n`);
    },
  );

  it("quotes a single quote the way sh reads it back", () => {
    expect(quoteForSh("it's")).toBe("'it'\\''s'");
  });
});

describe("on Linux", () => {
  /** A PATH folder holding empty executable files with these names. */
  async function pathWith(names: readonly string[]): Promise<string> {
    const folder = await newFolder();
    for (const name of names) await writeFile(join(folder, name), "", { mode: 0o755 });
    return folder;
  }

  it.skipIf(onWindows)(
    "[platform:win32] needs executable file modes: uses the first terminal it finds, in order",
    async () => {
      const path = await pathWith(["xterm", "konsole"]);
      const { start, started } = recordingStarter();

      const opened = await openTerminal(signIn, {
        platform: "linux",
        env: { PATH: path, DISPLAY: ":0" },
        home: "/person",
        start,
      });

      expect(opened).toEqual({ opened: true });
      expect(started[0]).toMatchObject({
        program: join(path, "konsole"),
        args: ["-e", "/opt/claude/bin/claude", "auth", "login"],
        cwd: "/person",
      });
      expect(started[0]?.env).toMatchObject({ CLAUDE_CONFIG_DIR: "/data/agents/writer/settings" });
    },
  );

  it("starts nothing when no terminal is on the PATH", async () => {
    const path = await pathWith([]);
    const { start, started } = recordingStarter();

    const opened = await openTerminal(signIn, {
      platform: "linux",
      env: { PATH: path, WAYLAND_DISPLAY: "wayland-0" },
      home: "/person",
      start,
    });

    expect(opened).toEqual({ opened: false, reason: "No terminal was found on this computer." });
    expect(started).toEqual([]);
  });

  it("starts nothing without a desktop session", async () => {
    const { start, started } = recordingStarter();

    const opened = await openTerminal(signIn, {
      platform: "linux",
      env: { PATH: "/usr/bin" },
      home: "/person",
      start,
    });

    expect(opened.opened).toBe(false);
    expect(started).toEqual([]);
  });
});

describe("whatever the system", () => {
  it("says no terminal opened when the terminal can't start", async () => {
    const failing: StartDetached = async () => {
      throw new Error("spawn ENOENT");
    };

    const opened = await openTerminal(signIn, {
      platform: "darwin",
      env: {},
      home: "/person",
      tempFolder: await newFolder(),
      start: failing,
    });

    expect(opened).toEqual({ opened: false, reason: "The terminal couldn't be started." });
  });

  it.each<[string, TerminalCommand]>([
    ["a relative program", { ...signIn, program: "claude" }],
    ["an argument a shell would read", { ...signIn, args: ["auth", "login;id"] }],
    ["a variable name that isn't one", { ...signIn, variables: { "A-B": "x" } }],
  ])("refuses %s, a mistake in the caller", async (_case, command) => {
    const { start, started } = recordingStarter();

    await expect(
      openTerminal(command, { platform: "linux", env: {}, home: "/person", start }),
    ).rejects.toThrow();
    expect(started).toEqual([]);
  });

  it.skipIf(onWindows)(
    "[platform:win32] needs POSIX paths: never starts a file under a skill's scripts/ folder",
    async () => {
      const skill = join(await newFolder(), "library", "skills", "mail", "scripts");
      await mkdir(skill, { recursive: true });
      const { start, started } = recordingStarter();
      const options = {
        platform: "linux" as const,
        env: { DISPLAY: ":0" },
        home: "/person",
        start,
      };

      await expect(
        openTerminal({ ...signIn, program: join(skill, "send") }, options),
      ).rejects.toThrow("Halonic never runs a file under a skill's scripts/ folder");
      await expect(
        openTerminal({ ...signIn, variables: { CLAUDE_CONFIG_DIR: skill } }, options),
      ).rejects.toThrow("Halonic never runs a file under a skill's scripts/ folder");
      expect(started).toEqual([]);
    },
  );
});
