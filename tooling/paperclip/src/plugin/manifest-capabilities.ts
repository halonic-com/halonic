import type { PluginCapability } from "@paperclipai/plugin-sdk";

/**
 * The capability of our local server patch (HAL-16413). Paperclip's shared capability list
 * (2026.1117.0) doesn't name it, so the type doesn't either; the patched host accepts it.
 */
const monitorPostpone = "issues.monitors.postpone" as PluginCapability;

/**
 * The capability of the local server patch for `set_next_step` and `finish_run`
 * (HAL-16989, halonic-com/server#31). Not in the shared list either, for the same reason.
 */
const dispositionWrite = "issues.disposition.write" as PluginCapability;

/**
 * The Agent tools plugin's capabilities, each with what uses it. Kept here so
 * `manifest.ts` stays within the file-size limit.
 */
export const capabilities: PluginCapability[] = [
  "jobs.schedule",
  "companies.read",
  "agents.read",
  "issues.read",
  // Only the chief line's findOrCreateThread (src/plugin/chief-line.ts, pinned by host.test.ts): a line
  // with no live thread gets a new "[chief-line] …" or "[line] <caller> → <agent>" task (HAL-19471).
  "issues.create",
  // Only `done`, `todo` with the reviewer as assignee, and `todo` on a blocked task whose
  // blockers all finished (HAL-17692): src/plugin/host.ts is the one place that writes a
  // status, through doneOnly, handoffOnly and todoOnly.
  // A task's effort goes through Paperclip's own API instead (src/plugin/task-effort.ts),
  // because the SDK's update leaves that field out. The difficulty tagger sends only a task's
  // labelIds, through setTaskLabels in the same file, changing only its D1–D4 and opus-only labels.
  "issues.update",
  // The PR watcher, the board check and the precheck-wake job (HAL-18980).
  "issues.wakeup",
  // Only the Merger wake (HAL-19234, src/plugin/merger-wake.ts): it starts a Merger run with no
  // task, as its heartbeat does, with a prompt to run one pass. Nothing else in the plugin calls it.
  "agents.invoke",
  "issue.comments.read",
  "issue.comments.create",
  // The task tool `comment` posts as the calling agent, from the run's context (HAL-16403).
  // Only GET requests to api.github.com and GraphQL queries to its /graphql (both readers'
  // guards); the manifest can't list hosts. ready_for_review also calls the precheck service
  // at the address in the settings (src/plugin/ready-for-review.ts), and the task effort
  // handler sends one task change to Paperclip's API at the address in the settings. The
  // difficulty tagger sends one POST to api.anthropic.com/v1/messages per new task text, and
  // reads the company's labels from Paperclip's API. The thin-spec check sends one POST to
  // api.anthropic.com/v1/messages per new code task, and for a flagged one creates the clarify
  // task and sets the task's blocker through Paperclip's API (src/plugin/thin-spec-calls.ts).
  // trial_results sends GET requests to the trial results service at the address in the
  // settings (src/plugin/trial-results.ts). Merge control's facts reader uses the two GitHub
  // readers, and GETs the CI status file and Prometheus at the addresses in the settings
  // (src/plugin/merge-control-reader.ts). The front bot sends one POST to
  // api.anthropic.com/v1/messages per board message on a chat task, with its own key (HAL-19136).
  // Off by default, its lookups read a pull request with pr_status's GETs (HAL-19222), and its
  // progress notes GET a chat run's status and log from Paperclip's API (HAL-19218).
  // The PR watcher GETs Liam's and Julian's newest runs from Paperclip's API at the address in
  // the settings, to move a limited reviewer's review (src/plugin/reviewer-runs.ts, HAL-19203).
  // The seat mover reads and moves agents' AI connections there too (src/seat-mover/api.ts).
  "http.outbound",
  "secrets.read-ref",
  // pr_status: GitHub reads only, with the same token and origin guard.
  "agent.tools.register",
  // Counts only (wakes, dones, monitors, GitHub requests, tool calls), no task text.
  "metrics.write",
  // Board check (HAL-16194). Its writes are comments, wakes and the two documents below,
  // through the gate in src/board-check/writes.ts.
  // A new comment is looked at for a board ask at once; runs that failed (part a).
  // Task effort (HAL-16876): a created or changed task's tags and effort.
  // Difficulty tagger (HAL-16901): a created task, or one whose title or description changed.
  // Front bot (HAL-19136): a board user's message on a chat task gets a first reply.
  "events.subscribe",
  // Each job emits only its own event (`pr-watch`, `board-check`, `merge-control`, `merger-wake`, `precheck-wake`),
  // once per company, so its pass runs in a call the host scopes to that company (HAL-16941,
  // src/plugin/scheduled.ts).
  "events.emit",
  // Only `board-waiting` and `board-asks` on the Board Checker's task.
  "issue.documents.write",
  // No tool reads documents since task_get moved to the workspace plugin (HAL-17968). Kept
  // until the board check's document upsert is shown to work without it.
  "issue.documents.read",
  // The pass's GitHub snapshot, one entry per company, for queue_state and merge_speed.
  // Ids, states, names and times only, no comment text. The board check also keeps
  // the asks already handled, by comment id, and which tasks were woken for a failed run.
  // ready_for_review keeps the checks agents wait on: ids, branch, task and agent (HAL-18980).
  "plugin.state.read",
  "plugin.state.write",
  // Part (d): lists new pending approvals, never decides them.
  "approvals.read",
  // Part (a): runs piling up in a queue for one agent.
  "issue.subtree.read",
  // Part (b): how many tasks each task waiting on the board blocks. The PR watcher's
  // unblock sweep reads a blocked task's blockers (HAL-17692).
  "issue.relations.read",
  // Only `removeBlockers`, only for a blocker that is the task's own parent or a task above
  // it (`parent_block`, the unblock sweep in src/plugin/host.ts). Nothing adds or sets blockers.
  "issue.relations.write",
  // Part (b): whether a task in review waits on a pending board card.
  "issue.interactions.read",
  // The gh guard's route (HAL-16401): agents' runs only; it counts and answers, nothing else.
  "api.routes.register",
  // The PR watcher moves the fallback monitor of a task it watches later (HAL-16401 part 3).
  // Paperclip lets it only move an existing monitor later, at most 24 hours out (HAL-16413).
  monitorPostpone,
  // set_next_step and finish_run (HAL-16403): only through issues.setDisposition, which sends
  // the change through Paperclip's own update route as the calling agent's run, on the task that
  // run holds (src/plugin/next-step-tools.ts). Nothing else in the plugin calls it.
  dispositionWrite,
  // The "Worker agents" page (HAL-16249): board-only and read-only. Its data comes from the
  // board-only worker-agents route and the page's data key, never from an agent tool.
  "ui.page.register",
  // Paperclip requires both for `coreReadTables`. The migrations folder holds no migration:
  // the plugin keeps nothing in its own schema. src/worker-agents/tables.ts names every column.
  "database.namespace.migrate",
  "database.namespace.read",
  // review_verdict (HAL-19481): only to check that the calling run holds the task it names
  // (src/plugin/review-verdict-tool.ts). The check can also hand a free or stale checkout to
  // the calling run, so the tool asks it only after the run is among the task's running runs.
  "issues.checkout",
];
