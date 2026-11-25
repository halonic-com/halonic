/**
 * A model name OpenCode may get: plain parts joined by `/`, at most 128
 * characters. OpenCode expands `{env:…}` and `{file:…}` anywhere in its
 * config text, so a `{` in a model name could read the run token or a file
 * and send it to the bridge as the model's name. The parts allow no `{`,
 * `}`, `$`, space or empty part.
 *
 * `/` stays allowed: OpenRouter's model ids have one, such as
 * `deepseek/deepseek-v4.1-flash-1017`. OpenCode 2.3.0 splits
 * `anthropic/<model>` at the first `/` only, so the provider stays the
 * bridge's (its `debug config` shows `providerID: "anthropic"` with the rest
 * as the model).
 */
const modelNamePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*(\/[A-Za-z0-9][A-Za-z0-9._:-]*)*$/;

/** The longest model name OpenCode may get. */
const longestModelName = 128;

/**
 * A title OpenCode may get on its command line: one plain word that can't
 * be read as an option (no leading `-`) and holds nothing to expand.
 */
const titlePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * The task's model, once it is a plain name (requirement
 * `harness-opencode.config`).
 *
 * @throws Error when the task names no model, or one that isn't a plain name
 */
export function requireModelName(model: string | undefined): string {
  if (model === undefined) {
    throw new Error("OpenCode needs a model from the agent's file, and it names none.");
  }
  if (model.length > longestModelName || !modelNamePattern.test(model)) {
    throw new Error(
      "OpenCode takes only a plain model name: letters, digits and . _ : - in parts joined by /.",
    );
  }
  return model;
}

/**
 * The agent's id as OpenCode's session title, once it is one plain word
 * (requirement `harness-opencode.command`).
 *
 * @throws Error when the id isn't one plain word
 */
export function requireTitle(agentId: string): string {
  if (!titlePattern.test(agentId)) {
    throw new Error(
      "OpenCode takes only a plain agent id as its title: letters, digits and . _ -.",
    );
  }
  return agentId;
}
