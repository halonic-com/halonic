import type { FilesRevealAnswer } from "@halonicjs/studio-feature-files/api";
import { vi } from "vitest";

/**
 * Stands in for the Files feature's `requestFilesReveal` in every test file of this package (see
 * `mock-files-api.ts`): a test sets what it answers and checks what it was asked.
 */
export const requestFilesReveal = vi.fn(
  async (_path: string): Promise<FilesRevealAnswer> => "shown",
);
