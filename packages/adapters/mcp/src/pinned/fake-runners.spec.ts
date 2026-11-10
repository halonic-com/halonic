import type { RunnerSearch } from "./find-runner.ts";

/** A computer that holds exactly `files`, all of them programs except npm's CLI scripts. */
export function computer(
  files: readonly string[],
  sources: Partial<RunnerSearch> & Pick<RunnerSearch, "platform" | "path">,
): RunnerSearch {
  const present = new Set(
    files.map((file) => (sources.platform === "win32" ? file.toLowerCase() : file)),
  );
  const has = (path: string) =>
    present.has(sources.platform === "win32" ? path.toLowerCase() : path);
  return {
    home: undefined,
    loginShellPath: async () => undefined,
    isProgram: async (path) => has(path) && !path.endsWith(".js"),
    isFile: async (path) => has(path),
    ...sources,
  };
}

/** A made-up Windows path on `drive`, built from its parts, so no real local path is written here. */
export function windowsPath(drive: string, ...parts: string[]): string {
  return [`${drive}:`, ...parts].join("\\");
}

/** Every package runner a pinned connector may name, with `node`. */
const runnerNames = ["npx", "npm", "pnpm", "pnpx", "yarn", "bunx", "bun", "uvx", "uv", "pipx"];

/** A Linux computer with every runner and `node` in `/acme/bin`, which is on the app's `PATH`. */
export const runnerComputer: RunnerSearch = computer(
  [...runnerNames, "node"].map((name) => `/acme/bin/${name}`),
  { platform: "linux", path: "/usr/bin:/acme/bin" },
);

/** Where a connector that must never look for a runner looks: it starts no pinned program. */
export const unusedRunners: RunnerSearch = {
  ...computer([], { platform: "linux", path: "" }),
  loginShellPath: () => Promise.reject(new Error("this test starts no pinned program")),
  isProgram: () => Promise.reject(new Error("this test starts no pinned program")),
};
