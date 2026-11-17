/**
 * The services and types other features, and the app, may use. Features
 * import each other only through this file.
 */

export { fileItem } from "./file-item.ts";
export {
  type CompareChoice,
  type FileCompare,
  type FileIssue,
  FilePathError,
  type FilesHost,
  FilesHostService,
  type FilesListing,
  type OutsideChange,
  type RemovedFile,
} from "./files-host.ts";
export { filesWords } from "./files-words.ts";
export { type FollowFilesParts, followFilesHost } from "./follow-host.ts";
export type { FileMarks, TreeMarks } from "./tree/tree-model.ts";
