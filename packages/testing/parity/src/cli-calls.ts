/** One call of the old CLI. `<workspace>` in `args` stands for the workspace folder. */
export interface CliCall {
  /** What the call shows, unique in its list; the golden names each call by it. */
  readonly name: string;
  readonly args: readonly string[];
}

/** One call of the base, to the old CLI and to the new one. */
export interface BaseCliCall extends CliCall {
  /**
   * The same call to the new `halonic` CLI, without `--dir`: the compare adds
   * the workspace as `--dir`. `--hub` and `--workflow` are a `--filter` on
   * `<hub>/<workflow>/`, and a workflow is named `<hub>/<workflow>`.
   */
  readonly halonic: readonly string[];
}

const ws = "<workspace>";

/**
 * The old `studio test` and `studio run` calls recorded on the base. `run`
 * has no model script, so the old mock model echoes; only calls whose output
 * is the same on every run are here (see the README on concurrent foreach).
 */
export const baseCliCalls: readonly BaseCliCall[] = [
  { name: "test", args: ["test", ws], halonic: ["test"] },
  {
    name: "test one workflow",
    args: ["test", ws, "--workflow", "approval"],
    halonic: ["test", "--filter", "billing/approval/"],
  },
  {
    name: "test an unknown hub",
    args: ["test", ws, "--hub", "nope"],
    halonic: ["test", "--filter", "nope/"],
  },
  {
    name: "run and approve",
    args: ["run", ws, "billing", "approval", "--event", "approve"],
    halonic: ["run", "billing/approval", "--event", "approve"],
  },
  {
    name: "run and reject",
    args: ["run", ws, "billing", "approval", "--event", "reject"],
    halonic: ["run", "billing/approval", "--event", "reject"],
  },
  {
    name: "run that waits",
    args: ["run", ws, "billing", "approval"],
    halonic: ["run", "billing/approval"],
  },
  {
    name: "run with an event the state doesn't accept",
    args: ["run", ws, "billing", "approval", "--event", "nonsense"],
    halonic: ["run", "billing/approval", "--event", "nonsense"],
  },
  {
    name: "run an agent with the echo model",
    args: ["run", ws, "billing", "line-check", "--input", '{"line":"paper"}'],
    halonic: ["run", "billing/line-check", "--input", '{"line":"paper"}'],
  },
  {
    name: "run a foreach over a nested workflow",
    args: ["run", ws, "billing", "batch", "--input", '{"lines":["paper"]}'],
    halonic: ["run", "billing/batch", "--input", '{"lines":["paper"]}'],
  },
  {
    name: "run with a signed-out connector",
    args: [
      "run",
      ws,
      "billing",
      "invoice",
      "--input",
      '{"invoice":"Acme Paper, 120 EUR","lines":["paper"]}',
      "--event",
      "approve",
    ],
    halonic: [
      "run",
      "billing/invoice",
      "--input",
      '{"invoice":"Acme Paper, 120 EUR","lines":["paper"]}',
      "--event",
      "approve",
    ],
  },
  {
    name: "run an unknown workflow",
    args: ["run", ws, "billing", "nope"],
    halonic: ["run", "billing/nope"],
  },
  {
    name: "run with input that isn't JSON",
    args: ["run", ws, "billing", "approval", "--input", "{nope"],
    halonic: ["run", "billing/approval", "--input", "{nope"],
  },
  { name: "run without a workflow", args: ["run", ws, "billing"], halonic: ["run"] },
];
