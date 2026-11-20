import type { ServiceRegistry } from "@halonicjs/app";
import { type ModelsFiles, ModelsFilesService } from "@halonicjs/studio-feature-models/api";
import type { TestModelWatch } from "@halonicjs/studio-feature-workspace";
import { readYaml } from "@halonicjs/yaml";

/** The data of a YAML file as a plain object, or `undefined` when there is none or it doesn't read. */
function objectOf(text: string | null): Record<string, unknown> | undefined {
  if (text === null) return undefined;
  const read = readYaml(text);
  if (!read.ok) return undefined;
  const data: unknown = read.value.data;
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : undefined;
}

/**
 * The provider id the `default` alias of a `models.yaml` names, or `undefined` when it names none.
 *
 * @example
 * defaultProviderOf("aliases:\n  default:\n    provider: mock\n    model: echo\n"); // "mock"
 */
export function defaultProviderOf(modelsText: string | null): string | undefined {
  const aliases = objectOf(modelsText)?.["aliases"];
  if (typeof aliases !== "object" || aliases === null) return undefined;
  const provider = (aliases as { default?: { provider?: unknown } }).default?.provider;
  return typeof provider === "string" ? provider : undefined;
}

/**
 * Whether a provider file is the built-in test model: its `type` is `mock`.
 *
 * @example
 * isTestModelProvider("version: 1\ntype: mock\n"); // true
 */
export function isTestModelProvider(providerText: string | null): boolean {
  return objectOf(providerText)?.["type"] === "mock";
}

/**
 * Whether the open workspace's `default` model is the test model (`studio.try-sample`), read
 * again each time `models.yaml` or a provider file changes, with unsaved changes applied. Until
 * the first read it says no, so the chip never shows for a workspace on a real model.
 *
 * @example
 * const testModel = new DefaultModelWatch(services.get(ModelsFilesService));
 * testModel.subscribe(() => draw(testModel.onTestModel));
 */
export class DefaultModelWatch implements TestModelWatch {
  readonly #files: ModelsFiles;
  readonly #listeners = new Set<() => void>();
  readonly #stop: () => void;
  #onTestModel = false;
  /** Counts the reads, so an older read that ends last doesn't win. */
  #reads = 0;

  constructor(files: ModelsFiles) {
    this.#files = files;
    this.#stop = files.subscribe(() => void this.#read());
    void this.#read();
  }

  get onTestModel(): boolean {
    return this.#onTestModel;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stops reading; called once, when the workspace closes. */
  dispose(): void {
    this.#stop();
    this.#listeners.clear();
  }

  async #read(): Promise<void> {
    const read = ++this.#reads;
    const onTestModel = await this.#readOnTestModel();
    if (read !== this.#reads || onTestModel === this.#onTestModel) return;
    this.#onTestModel = onTestModel;
    for (const listener of [...this.#listeners]) listener();
  }

  async #readOnTestModel(): Promise<boolean> {
    try {
      const provider = defaultProviderOf(await this.#files.readModels());
      if (provider === undefined) return false;
      return isTestModelProvider(await this.#files.readProvider(`providers/${provider}.yaml`));
    } catch {
      // A file that can't be read is not proof of scripted answers, so the chip stays away; the
      // Models pages show why the file can't be read.
      return false;
    }
  }
}

/**
 * The watch of a folder's `default` model, for the demo only: no other workspace has the Sample
 * answers chip, so no other workspace's models are read for it. `undefined` without the folder's
 * Models files (outside the shell).
 */
export function demoModelWatch(
  services: ServiceRegistry,
  isDemo: boolean,
): DefaultModelWatch | undefined {
  return isDemo && services.has(ModelsFilesService)
    ? new DefaultModelWatch(services.get(ModelsFilesService))
    : undefined;
}
