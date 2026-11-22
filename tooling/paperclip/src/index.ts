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
export { type BaseGreenSince, baseGreenSince, pullFacts } from "./pr-watcher/facts.ts";
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
export type { AgentRow, CommentRow, Paperclip, TaskRow } from "./pr-watcher/paperclip.ts";
export {
  doneMessage,
  isSelf,
  marker,
  readMemory,
  type TickOptions,
  type TickSummary,
  tick,
  wakeMessage,
} from "./pr-watcher/watch.ts";
export {
  isLiamPath,
  julianLineLimit,
  liamFiles,
  liamFolders,
  liamWords,
  type RoutedPull,
  reviewerFor,
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
