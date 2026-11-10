// A task state with `artifact` saves its agent's answer as a file. The old
// engine logged it as `artifact.created` right after the answer went into
// the context, with the blob of the answer's text (the base fixture's
// recorded run log has one), and this keeps that place and that text.

import type { WorkflowState } from "@halonicjs/format";
import type { SaveArtifact } from "../../kernel/decide-types.ts";
import type { StateOutcome } from "../../kernel/registry.ts";

/**
 * HTTP token characters (RFC 9110), for each half of `type/subtype`: the
 * media types the blob store takes, as its adapters check them.
 */
const token = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const mediaTypePattern = new RegExp(`^${token}/${token}$`, "u");

/**
 * The file a task state saves from its agent's answer: the text of a string
 * answer as it is, any other answer as JSON with two spaces. A media type the
 * blob store would refuse fails the run instead, because `step` would throw
 * on every try and the run would never move on.
 *
 * @returns nothing for a state without `artifact`
 */
export function artifactOf(
  stateId: string,
  state: WorkflowState,
  answer: unknown,
): SaveArtifact | Extract<StateOutcome, { type: "fail" }> | null {
  const artifact = state.artifact;
  if (artifact === undefined) {
    return null;
  }
  if (!mediaTypePattern.test(artifact.mediaType)) {
    const error =
      `State "${stateId}" saves "${artifact.name}" as ${JSON.stringify(artifact.mediaType)}, ` +
      "which isn't a type/subtype media type without parameters, such as text/markdown.";
    return { type: "fail", error };
  }
  return {
    type: "save-artifact",
    state: stateId,
    name: artifact.name,
    mediaType: artifact.mediaType,
    text: typeof answer === "string" ? answer : (JSON.stringify(answer, null, 2) ?? String(answer)),
  };
}
