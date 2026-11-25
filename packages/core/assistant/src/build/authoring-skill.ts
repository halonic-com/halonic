// The Build chat's authoring skill (`assistant.build.authoring-skill-override`):
// the built-in text, and the workspace's own `halonic-authoring` skill that
// takes its place.

import { filesOf, type LoadedFileOf, type LoadedWorkspace } from "@halonicjs/workspace";

/** The id of the skill that replaces the built-in one: its folder under `library/skills/`. */
const authoringSkillId = "halonic-authoring";

/** Where "customize skill" writes the built-in skill: the workspace's shared library. */
export const authoringSkillPath = `library/skills/${authoringSkillId}/SKILL.md`;

/** What the Build chat is told, before any message, when the workspace has no skill of its own. */
export const builtInAuthoringInstructions = `You build and change a Halonic workspace: a folder of YAML and Markdown files that describe agents, workflows and what they use.

Files and where they go (a hub is a folder \`hubs/<id>/\` with a \`hub.yaml\`; "root or hub" means at the workspace root or inside a hub's folder):
- \`workspace.yaml\` at the root: the workspace's id, name and settings.
- \`models.yaml\` at the root: model aliases, each a provider and a model.
- \`providers/<id>.yaml\` at the root: where models come from. Never write an API key in a file; tell the person to add it in Settings › Models.
- \`deployments.yaml\` at the root: named deployments, each with a name, host, stage and shadow.
- \`agents/<id>.agent.yaml\`, root or hub: an agent with its model alias, instructions and tools.
- \`workflows/<id>.workflow.yaml\`, root or hub: a workflow's steps. Its tests are \`workflows/<id>.test.yaml\`, its routines \`workflows/routines/<id>.routine.yaml\`.
- \`library/skills/<id>/SKILL.md\`, root or hub: a skill, with a name and a description in front matter, then Markdown instructions.
- \`library/knowledge/<id>.yaml\`, root or hub: a knowledge source.
- \`library/collections/<id>.collection.yaml\` at the root: a collection of records.
- \`library/connectors/<id>.connector.yaml\`, root or hub: a connector and the tools it allows.
- \`integrations/<folder>/\` at the root: an integration that connects Halonic to an outside service. Before you write or change one, read the integration guide with \`integration_guide\`, starting with its Contents, and follow it.

How to work:
- Read before you change: use \`list_files\` and \`read_file\`, and \`schema\` for a kind's fields.
- Change files with \`propose_file\` and \`propose_delete\`. Each change is marked for the person, who accepts or rejects it; nothing is live until they make a version.
- Run \`validate\` after your changes and fix every error it reports.
- Keep changes small, and say in one or two sentences what you changed and why.
`;

/** The built-in skill as a `SKILL.md`, which "customize skill" writes into the workspace. */
export const builtInAuthoringSkill = `---
name: ${authoringSkillId}
description: How the Build chat writes and changes this workspace's files. Edit it to change how the assistant works here.
---

${builtInAuthoringInstructions}`;

/**
 * The workspace's own `halonic-authoring` skill: the one at the root, else a hub's, the first by
 * path. `undefined` when it has none, or when its file has an error.
 */
export function ownAuthoringSkill(workspace: LoadedWorkspace): LoadedFileOf<"skill"> | undefined {
  const own = filesOf(workspace, "skill").filter((file) => file.value.id === authoringSkillId);
  return own.find((file) => file.hub === null) ?? own[0];
}

/**
 * What the Build chat is told before any message: the body of the workspace's own
 * `halonic-authoring` skill, else the built-in instructions. An own skill with an empty body
 * tells the model nothing, so the built-in instructions stay.
 *
 * @example
 * const messages = [{ role: "system", content: authoringInstructions(loaded) }, ...chat.messages];
 */
export function authoringInstructions(workspace: LoadedWorkspace): string {
  const own = ownAuthoringSkill(workspace)?.value.body ?? "";
  return own === "" ? builtInAuthoringInstructions : own;
}
