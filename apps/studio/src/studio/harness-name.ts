const harnessNames = new Map([
  ["claude-code", "Claude Code"],
  ["codex", "Codex"],
]);

/** The program an agent's harness starts, as the agent page names it: "Claude Code", "Codex". */
export function harnessName(harness: string): string {
  return harnessNames.get(harness) ?? harness;
}
