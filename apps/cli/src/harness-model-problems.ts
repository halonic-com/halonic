// What `halonic validate` adds for an agent whose harness can't use its model
// alias (HAL-18930, flow 5.6): Claude Code calls only Anthropic's API and
// Codex only OpenAI's, so `run` refuses such an agent before it starts. Only
// `doctor` said so before; now `validate` does too, with the same check the
// run uses, so the three always agree.

import { harnessModelFit } from "@halonicjs/adapter-workspace-models";
import {
  definitionsOf,
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  resolveModel,
  type WorkspaceIssue,
} from "@halonicjs/workspace";
import { plainText } from "./messages/phrase.ts";
import { validateMessages } from "./messages/validate.ts";

/** The code of the error for a model the agent's harness can't use. */
export const harnessModelRefusedCode = "harness-model-refused";

/**
 * One error per agent whose harness is a program and whose `model` is an
 * alias of its hub that the program can't call. A name that is no alias goes
 * to the program as written, so it gets none, as does an alias whose provider
 * no file has: the loader reports that. Only what `run` refuses: the Model
 * page's endpoint line for Codex on an OpenAI-compatible provider isn't a
 * problem here, since `validate` couldn't ever set it aside and `--strict`
 * would never pass.
 *
 * @example
 * harnessModelProblems(workspace);
 * // [{ file: "hubs/support/agents/coder.agent.yaml", severity: "error", code: "harness-model-refused", … }]
 */
export function harnessModelProblems(workspace: LoadedWorkspace): WorkspaceIssue[] {
  return filesOf(workspace, "agent").flatMap((agent) => {
    const problem = problemOf(workspace, agent);
    return problem === undefined ? [] : [problem];
  });
}

function problemOf(
  workspace: LoadedWorkspace,
  agent: LoadedFileOf<"agent">,
): WorkspaceIssue | undefined {
  const { id, harness, model } = agent.value;
  if (agent.hub === null || model === undefined) return undefined;
  if (harness === undefined || harness === "halonic") return undefined;
  if (model.includes("/")) return undefined;
  const target = resolveModel(workspace, agent.hub, model);
  if (target === undefined) return undefined;
  const provider = definitionsOf(workspace, agent.hub).providers[target.provider];
  if (provider === undefined) return undefined;
  if (harnessModelFit(harness, provider.type) !== "refused") return undefined;
  return {
    file: agent.path,
    severity: "error",
    source: "check",
    code: harnessModelRefusedCode,
    path: ["model"],
    line: 1,
    col: 1,
    message: plainText(validateMessages.harnessModelRefused(id, model, harness).phrase),
  };
}
