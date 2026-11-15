import type { ItemUsage } from "@halonicjs/app";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** Which skill: its id, and the hub it sits in, or `null` when the workspace shares it. */
export interface SkillRef {
  readonly hub: string | null;
  readonly id: string;
}

/** Another file in a skill's folder, which opens in the files feature. */
export interface SkillFile {
  /** What the page shows, relative to the skill's folder: `scripts/fetch.py`. */
  readonly label: string;
  /** The file's id for `openItem({ kind: "file", … })`. */
  readonly id: string;
}

/** A skill as the host reads it: the text of its `SKILL.md` and what else is in its folder. */
export interface SkillSource {
  readonly text: string;
  readonly files: readonly SkillFile[];
}

/** The skills of the open workspace, one at a time. The app provides it for each open workspace. */
export interface SkillHost {
  /** The skill, or `undefined` when the workspace has none with this id. Rejects when it can't be read. */
  read(skill: SkillRef): Promise<SkillSource | undefined>;
  /** Saves the new text of `SKILL.md` as one change that shows in Changes. Rejects when it can't be written. */
  write(skill: SkillRef, text: string): Promise<void>;
  /** Who uses the skill (`whoUses` of core). */
  usage(skill: SkillRef): Promise<ItemUsage>;
  /** Calls `listener` whenever a skill may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

export const SkillHostService: ServiceKey<SkillHost> = serviceKey<SkillHost>("library.skill");
