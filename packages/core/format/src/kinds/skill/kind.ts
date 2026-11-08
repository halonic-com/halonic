import type { FileKind } from "../../kind.ts";
import { Skill } from "./schema.ts";

/** `library/skills/<id>/SKILL.md`, shared at the root or a hub's own; the folder is the id. */
export const skillKind: FileKind<Skill> = {
  name: "skill",
  about: "Instructions agents can follow, in the open Agent Skills format.",
  syntax: "front-matter",
  schema: Skill,
  places: [{ scope: "workspace-and-hub", folder: "library/skills", name: "<id>/SKILL.md" }],
  idFromPlace: "always",
};
