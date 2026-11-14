import type { ModelsFiles, ProviderFile } from "@halonicjs/studio-feature-models/api";

/** What {@link WorkspaceModelsFiles} needs of the workspace's files and events. */
export interface ModelsFilesParts {
  /** The kernel's `WorkspaceFiles`: reads with unsaved changes applied, and changes as one undo step. */
  readonly files: {
    read(path: string): Promise<string | null>;
    list(dir: string): Promise<string[]>;
    change(label: string, changes: Record<string, string | null>): void;
  };
  /** Calls `listener` after every change of the workspace's files; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
}

/** The workspace's `models.yaml`, as the file the Models pages read and change. */
const MODELS_PATH = "models.yaml";

/** The folder of the workspace's provider files. */
const PROVIDERS_DIR = "providers";

/**
 * The Models feature's `models.yaml` (`studio.workspace-models-files`), over the workspace's
 * files, so an edit is unsaved, saved by itself and undone with Ctrl Z.
 *
 * @example
 * services.provide(ModelsFilesService, new WorkspaceModelsFiles({ files, onChange }));
 */
export class WorkspaceModelsFiles implements ModelsFiles {
  readonly #parts: ModelsFilesParts;

  constructor(parts: ModelsFilesParts) {
    this.#parts = parts;
  }

  readModels(): Promise<string | null> {
    return this.#parts.files.read(MODELS_PATH);
  }

  async readProviders(): Promise<ProviderFile[]> {
    const paths = await this.#parts.files.list(PROVIDERS_DIR);
    const files = await Promise.all(
      paths.map(async (path) => ({ path, text: await this.#parts.files.read(path) })),
    );
    return files.flatMap(({ path, text }) => (text === null ? [] : [{ path, text }]));
  }

  changeModels(label: string, text: string): void {
    this.#parts.files.change(label, { [MODELS_PATH]: text });
  }

  subscribe(listener: () => void): () => void {
    return this.#parts.onChange(listener);
  }
}
