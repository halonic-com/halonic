import {
  checkLeaveOut,
  checkWorkspacePath,
  type DefinitionSource,
  isLeftOut,
  type ListOptions,
  type VersionOptions,
} from "@halonicjs/ports";
import { definitionSourceLeftOutContract } from "./definition-source-left-out.ts";
import type { DefinitionFiles } from "./definition-store.ts";

/**
 * The smallest source that follows the port's `leaveOut` rule, so the suite
 * is shown to pass a correct adapter before any real one opts in. Its
 * version is the listed files themselves, which a content hash stands for.
 */
function referenceSource(files: DefinitionFiles): DefinitionSource {
  const list = async (dir?: string, options?: ListOptions): Promise<string[]> => {
    if (dir !== undefined) checkWorkspacePath(dir);
    checkLeaveOut(options?.leaveOut);
    return Object.keys(files)
      .filter((path) => dir === undefined || path.startsWith(`${dir}/`))
      .filter((path) => !isLeftOut(path, options?.leaveOut))
      .sort();
  };
  return {
    location: "memory:reference",
    list,
    read: async (path) => files[path] ?? null,
    version: async (options?: VersionOptions) => {
      const listed = await list(undefined, options);
      return JSON.stringify(listed.map((path) => [path, files[path]]));
    },
  };
}

definitionSourceLeftOutContract("reference source", async (files) => referenceSource(files));
