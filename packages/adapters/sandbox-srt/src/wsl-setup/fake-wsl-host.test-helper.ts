import type { ProgramResult, WslDistro, WslHost, WslPolicy } from "./host.ts";
import { RUNTIME_UPDATER } from "./runtime.ts";

/** A Windows machine as a test sets it up: what WSL says, and every call the setup made. */
export interface FakeWsl {
  host: WslHost;
  calls: string[];
  /** Registered distros; `wsl --import` adds one. */
  distros: WslDistro[];
  runOnce: string | null;
  machine: {
    build: number | null;
    bootedAt: string;
    policy: WslPolicy;
    installed: boolean;
    virtualisationOff: boolean;
    kernel: string;
    importCode: number;
    cancel: boolean;
    /** What `wsl --install` ends with once it ran; the machine then counts WSL as installed. */
    installCode: number;
    dockerSocket: boolean;
    wslFolder: string;
    distroStarts: boolean;
    /** The runtime version `/opt/halonic/current` points at, or `null`: the image ships none. */
    runtime: string | null;
    /** What the runtime updater's `install` ends with; 0 makes the version current. */
    runtimeInstallCode: number;
  };
}

const ok = (output = ""): ProgramResult => ({ code: 0, output });

/** What the runtime updater's `status` prints in the fake distro. */
const runtimeStatus = (current: string | null): ProgramResult =>
  ok(`{"current":"${current ?? ""}","previous":"","securityUpdated":""}\n`);

export function fakeWsl(): FakeWsl {
  const fake: FakeWsl = {
    calls: [],
    distros: [],
    runOnce: null,
    machine: {
      build: 22631,
      bootedAt: "boot-1",
      policy: { allowWsl: undefined },
      installed: false,
      virtualisationOff: false,
      kernel: "6.6.87.2-1",
      importCode: 0,
      cancel: false,
      installCode: 3010,
      dockerSocket: false,
      wslFolder: "",
      distroStarts: true,
      runtime: null,
      runtimeInstallCode: 0,
    },
    host: undefined as never,
  };
  const { machine } = fake;
  fake.host = {
    windowsBuild: async () => machine.build,
    bootedAt: async () => machine.bootedAt,
    policy: async () => machine.policy,
    status: async () => {
      fake.calls.push("wsl --status");
      if (!machine.installed)
        return { code: 1, output: "The Windows Subsystem for Linux is not installed." };
      if (machine.virtualisationOff)
        return {
          code: 1,
          output: "WSL2 is not supported: virtualization is disabled (0x80370102)",
        };
      return ok("Default Version: 2");
    },
    distros: async () => fake.distros,
    installWsl: async () => {
      fake.calls.push("wsl --install --no-distribution --web-download");
      if (machine.cancel) return { code: 1223, output: "", cancelled: true };
      if (machine.virtualisationOff)
        return { code: 1, output: "Error: 0x80370102", cancelled: false };
      if (machine.installCode === 0 || machine.installCode === 3010) machine.installed = true;
      return { code: machine.installCode, output: "", cancelled: false };
    },
    updateWsl: async () => {
      fake.calls.push("wsl --update");
      machine.kernel = "6.6.87.2-1";
      return { code: 0, output: "", cancelled: false };
    },
    importDistro: async (name, location, rootfs) => {
      fake.calls.push(`wsl --import ${name} ${location} ${rootfs} --version 2`);
      if (machine.importCode !== 0) return { code: machine.importCode, output: "import failed" };
      fake.distros.push({
        name,
        state: "Stopped",
        version: 2,
        isDefault: fake.distros.length === 0,
      });
      return ok();
    },
    runInDistro: async (_name, program) => {
      fake.calls.push(`in distro: ${program.join(" ")}`);
      if (!machine.distroStarts) return { code: 1, output: "cannot start" };
      if (program[0] === "true") return ok();
      if (program[0] === "uname") return ok(`${machine.kernel}\n`);
      if (program[0] === "test") return { code: machine.dockerSocket ? 0 : 1, output: "" };
      if (program[0] === "ls") return ok(machine.wslFolder);
      if (program[0] === RUNTIME_UPDATER) return runtimeStatus(machine.runtime);
      return { code: 127, output: "" };
    },
    installRuntime: async (_name, runtime) => {
      fake.calls.push(`install runtime ${runtime.version} ${runtime.sha256} ${runtime.archive}`);
      if (machine.runtimeInstallCode === 0) machine.runtime = runtime.version;
      return { code: machine.runtimeInstallCode, output: "" };
    },
    setRunOnce: async (command) => {
      fake.calls.push("set RunOnce");
      fake.runOnce = command;
    },
    clearRunOnce: async () => {
      fake.calls.push("clear RunOnce");
      fake.runOnce = null;
    },
  };
  return fake;
}
