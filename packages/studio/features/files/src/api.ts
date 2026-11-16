/**
 * The services and types other features, and the app, may use. Features
 * import each other only through this file.
 */
export {
  type CompareChoice,
  type FileCompare,
  type FileIssue,
  type FilesHost,
  FilesHostService,
  type FilesListing,
  type OutsideChange,
  type RemovedFile,
} from "./files-host.ts";
export type { FileMarks, TreeMarks } from "./tree/tree-model.ts";
