import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { SkillRef } from "./skill-host.ts";

/** What a person fills in to make a skill. */
export interface NewSkillDraft {
  readonly name: string;
  readonly description: string;
  /** The hub folder the skill belongs to, or `null` to share it at the workspace root. */
  readonly hub: string | null;
}

/** A hub a new skill can go in. */
export interface NewSkillHub {
  readonly id: string;
  readonly name: string;
}

/** Makes skills in the open workspace. The app provides it for each open workspace. */
export interface NewSkillHost {
  /** Reads the workspace, so `hubs` and `folder` are current. The place waits for it before it opens the dialog. */
  prepare(): Promise<void>;
  /** The hubs of the workspace, for the dialog's Hub field. */
  hubs(): readonly NewSkillHub[];
  /**
   * The folder the skill would be made in, from the workspace folder and with a trailing `/`:
   * `hubs/acme/library/skills/acme-refunds/`. With an empty name it is the folder that holds
   * the skills (`core`'s `newLibraryFile` makes the path).
   */
  folder(draft: NewSkillDraft): string;
  /** Makes the skill as one change that shows in Changes. Rejects with an `Error` of one sentence when it can't. */
  create(draft: NewSkillDraft): Promise<SkillRef>;
}

export const NewSkillHostService: ServiceKey<NewSkillHost> =
  serviceKey<NewSkillHost>("library.new-skill");
