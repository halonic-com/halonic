/** Public entry point of tooling/paperclip, for tests and other tooling. The plugin worker is src/plugin/worker.ts. */

export { doneOnly, type HostApi, paperclipHost } from "./plugin/host.ts";
export {
  type JobApi,
  readSettings,
  requestTimeoutMs,
  runWatcher,
  type WatcherSettings,
} from "./plugin/job.ts";
export { manifest } from "./plugin/manifest.ts";
export {
  branchesOwner,
  branchOwner,
  type CheckState,
  candidates,
  closedOutcome,
  type Decision,
  decide,
  type Memory,
  marker,
  newReasons,
  type PullFacts,
  type Reason,
  type WatchedTask,
} from "./pr-watcher/decide.ts";
export {
  closedWindowDays,
  discoverPulls,
  type FoundPulls,
  type PullRef,
  taskOfBranch,
} from "./pr-watcher/discover.ts";
export {
  type BaseGreenSince,
  baseGreenSince,
  type PullFactsReader,
  pullKey,
  snapshotFacts,
} from "./pr-watcher/facts.ts";
export {
  ciOk,
  everyPage,
  type Fetch,
  type GitHubGet,
  gitHubApi,
  gitHubReader,
  inMergeQueue,
  latestReview,
  newestCheck,
  newestFinding,
} from "./pr-watcher/github.ts";
export { isSelf, readMemory } from "./pr-watcher/memory.ts";
export { doneMessage, wakeMessage } from "./pr-watcher/messages.ts";
export type { AgentRow, CommentRow, Paperclip, TaskRow } from "./pr-watcher/paperclip.ts";
export { type TickOptions, type TickSummary, tick } from "./pr-watcher/watch.ts";
export {
  coreFolders,
  coreLineLimit,
  isLiamPath,
  isSecurityPath,
  isTestPath,
  julianLineLimit,
  julianRebaseRefusal,
  liamFiles,
  liamFolders,
  liamPackageFields,
  liamPackageScripts,
  liamWords,
  type ManifestChange,
  overLineLimit,
  type ReapprovedPull,
  type RoutedPull,
  reviewerFor,
  reviewerRoleFor,
  touchesPackageFields,
} from "./reviewer-paths.ts";
export {
  agingPoints,
  type PrioPull,
  type PrioTask,
  type PrioWeights,
  prioWeights,
  queuePrio,
  type RankedPull,
  type TaskPriority,
} from "./rules/queue-prio.ts";
export {
  type GitHubQuery,
  gitHubGraphql,
  gitHubQueryReader,
  isReadOnly,
} from "./snapshot/graphql.ts";
export { type CheckFallback, mergeCommitChecks, takeSnapshot } from "./snapshot/read.ts";
export type {
  OpenFacts,
  QueueEntry,
  Snapshot,
  SnapshotLabel,
  SnapshotPull,
  SnapshotRepo,
} from "./snapshot/shape.ts";
export { snapshotVersion } from "./snapshot/shape.ts";
export { loadSnapshot, type StateApi, saveSnapshot } from "./snapshot/store.ts";
