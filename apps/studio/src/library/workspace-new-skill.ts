import { newLibraryFile } from "@halonicjs/app";
import type {
  NewSkillDraft,
  NewSkillHost,
  NewSkillHub,
  SkillRef,
} from "@halonicjs/studio-feature-library/api";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { unsavedSource } from "./workspace-library-items.ts";
import type { WorkspaceSkillsParts } from "./workspace-skills.ts";

/** The words of each reason core gives for making no file; a sentence, as the dialog shows it. */
const refusals = {
  name_missing: "Give it a name.",
  description_missing: "Say when an agent should use this skill.",
  connection_missing: "Give it a connection.",
  secret_invalid: "Use a secret's name, not its value.",
} as const;

/**
 * Makes skills for the New skill dialog (`studio.workspace-new-skill`). Core's `newLibraryFile`
 * makes the id, path and text; the file is written as one change that shows in Changes and can be
 * undone. The dialog asks for the hubs and the folder while it is open, so they are read from a
 * snapshot of the workspace that is loaded again after every change of its files.
 *
 * @example
 * services.provide(NewSkillHostService, new WorkspaceNewSkill({ files, onChange }));
 */
export class WorkspaceNewSkill implements NewSkillHost {
  readonly #parts: WorkspaceSkillsParts;
  #snapshot: LoadedWorkspace | undefined;

  constructor(parts: WorkspaceSkillsParts) {
    this.#parts = parts;
    // Once the dialog has read the workspace, later changes keep the snapshot current.
    parts.onChange(() => {
      if (this.#snapshot !== undefined) void this.prepare().catch(() => undefined);
    });
  }

  async prepare(): Promise<void> {
    await this.#load();
  }

  hubs(): readonly NewSkillHub[] {
    if (this.#snapshot === undefined) return [];
    return filesOf(this.#snapshot, "hub").map((hub) => ({
      id: hub.value.id,
      name: hub.value.name,
    }));
  }

  folder({ name, hub }: NewSkillDraft): string {
    const made =
      this.#snapshot === undefined
        ? undefined
        : newLibraryFile(this.#snapshot, { kind: "skill", name, description: "-", hub });
    if (made?.ok) return made.value.path.replace(/SKILL\.md$/, "");
    return `${hub === null ? "" : `hubs/${hub}/`}library/skills/`;
  }

  async create(draft: NewSkillDraft): Promise<SkillRef> {
    const made = newLibraryFile(await this.#load(), { kind: "skill", ...draft });
    if (!made.ok) throw new Error(refusals[made.error]);
    const { id, path, text } = made.value;
    this.#parts.files.change(`Added skill ${id}`, { [path]: text });
    return { hub: draft.hub, id };
  }

  async #load(): Promise<LoadedWorkspace> {
    this.#snapshot = await loadWorkspace(unsavedSource(this.#parts.files));
    return this.#snapshot;
  }
}
