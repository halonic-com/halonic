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

/** The code of the warning for a Codex agent on an OpenAI-compatible provider. */
export const harnessEndpointCode = "harness-endpoint-unchecked";

/**
 * One problem per agent whose harness is a program and whose `model` is an
 * alias of its hub that the program can't call (an error), or that Codex
 * calls at an address that may not speak the Responses API (a warning). A
 * name that is no alias goes to the program as written, so it gets none, as
 * does an alias whose provider no file has: the loader reports that.
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
  if (agent.hub === null || harness === undefined || model === undefined) return undefined;
  if (model.includes("/")) return undefined;
  const target = resolveModel(workspace, agent.hub, model);
  if (target === undefined) return undefined;
  const provider = definitionsOf(workspace, agent.hub).providers[target.provider];
  if (provider === undefined) return undefined;
  const fit = harnessModelFit(harness, provider.type);
  if (fit === "fits") return undefined;
  const refused = fit === "refused";
  return {
    file: agent.path,
    severity: refused ? "error" : "warning",
    source: "check",
    code: refused ? harnessModelRefusedCode : harnessEndpointCode,
    path: ["model"],
    line: 1,
    col: 1,
    message: plainText(
      refused
        ? validateMessages.harnessModelRefused(id, model, harness).phrase
        : validateMessages.harnessEndpoint(id, provider.id).phrase,
    ),
  };
}
