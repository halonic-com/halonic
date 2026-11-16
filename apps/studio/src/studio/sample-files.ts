import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";

/** Where the glob below starts, the repository's `examples/acme`, as the bundler sees it. */
const sampleFolder = "../../../../examples/acme/";

/**
 * Every file of `examples/acme`, read when the app is built, so the CLI's `init --example acme`,
 * the docs and Studio all start from one source and Studio keeps no copy of its own. Vite's glob
 * skips dotfiles; the test beside this file fails when the folder holds one, or any file the
 * bundle lacks.
 */
const bundled = import.meta.glob("../../../../examples/acme/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The sample's files by workspace-relative path, such as `hubs/support/hub.yaml`. */
export function sampleFiles(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(bundled).map(([path, content]) => [path.slice(sampleFolder.length), content]),
  );
}

/** The sample as a store `copyWorkspace` reads from. */
export function sampleSource(): MemoryDefinitionStore {
  return new MemoryDefinitionStore(sampleFiles(), "the Acme sample");
}
