import { whoUses } from "@halonicjs/app";
import type {
  SkillFile,
  SkillHost,
  SkillRef,
  SkillSource,
} from "@halonicjs/studio-feature-library/api";
import { loadWorkspace } from "@halonicjs/workspace";
import { unsavedSource, type WorkspaceLibraryItemsParts } from "./workspace-library-items.ts";

/** What {@link WorkspaceSkills} needs of the workspace's files. */
export interface WorkspaceSkillsParts extends WorkspaceLibraryItemsParts {
  readonly files: WorkspaceLibraryItemsParts["files"] & {
    /** The kernel's `WorkspaceFiles.change`: new text as one undo step that shows in Changes. */
    change(label: string, changes: Record<string, string | null>): void;
  };
}

/** The folder of a skill: in its hub, or at the workspace root when the workspace shares it. */
function folderOf({ hub, id }: SkillRef): string {
  return `${hub === null ? "" : `hubs/${hub}/`}library/skills/${id}`;
}

/**
 * The skills of the open workspace for the skill page (`studio.workspace-skills`): reads and
 * writes `SKILL.md` through the workspace's files, so a save is an unsaved change that shows in
 * Changes and can be undone, and lists the other files in the skill's folder. A file's id for
 * the files feature is its path in the workspace.
 *
 * @example
 * services.provide(SkillHostService, new WorkspaceSkills({ files, onChange }));
 */
export class WorkspaceSkills implements SkillHost {
  readonly #parts: WorkspaceSkillsParts;

  constructor(parts: WorkspaceSkillsParts) {
    this.#parts = parts;
  }

  async read(skill: SkillRef): Promise<SkillSource | undefined> {
    const folder = folderOf(skill);
    const text = await this.#parts.files.read(`${folder}/SKILL.md`);
    if (text === null) return undefined;
    const paths = await this.#parts.files.list(folder);
    const files: SkillFile[] = paths
      .filter((path) => path !== `${folder}/SKILL.md`)
      .map((path) => ({ label: path.slice(folder.length + 1), id: path }));
    return { text, files };
  }

  async write(skill: SkillRef, text: string): Promise<void> {
    const path = `${folderOf(skill)}/SKILL.md`;
    this.#parts.files.change(`Edited skill ${skill.id}`, { [path]: text });
  }

  async usage(skill: SkillRef) {
    const workspace = await loadWorkspace(unsavedSource(this.#parts.files));
    return whoUses(workspace, { kind: "skill", id: skill.id, hub: skill.hub });
  }

  subscribe(listener: () => void): () => void {
    return this.#parts.onChange(listener);
  }
}
