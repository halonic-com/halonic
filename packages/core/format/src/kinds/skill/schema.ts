import { type Infer, s } from "@halonicjs/schema-kit";

/**
 * `library/skills/<id>/SKILL.md`, in the open Agent Skills format: YAML front
 * matter with a name and a description, then Markdown instructions.
 *
 * The schema describes the front matter plus `body`, the Markdown after it,
 * and `id`, the skill's folder. Other front matter keys are allowed by the
 * format and dropped here, as the old loader did.
 */
export const Skill = s.object({
  /** The skill's folder name. Not checked against the id pattern, as before. */
  id: s.string(),
  name: s.string().min(1),
  description: s.string().min(1),
  /** The Markdown after the front matter, trimmed. */
  body: s.string(),
});

/** A skill: its id, name, description and Markdown body. */
export type Skill = Infer<typeof Skill>;
