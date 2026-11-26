import type { PaperclipPluginManifestV1, PluginCapability } from "@paperclipai/plugin-sdk";
import { frontBotConfigProperties } from "../front-bot/settings.ts";
import { workerAgentsRouteKey } from "../worker-agents/keys.ts";
import { workerReadTables } from "../worker-agents/tables.ts";
import { chiefLine } from "./chief-line-settings.ts";
import { chatNotesRouteKey } from "./front-bot-notes.ts";
import { mergeControlJob } from "./merge-control-declaration.ts";
import { mergerWakeConfigProperties, mergerWakeJob } from "./merger-wake-declaration.ts";
import {
  ciFailuresDeclaration,
  prStatusDeclaration,
  rebasePrDeclaration,
  writePrDeclaration,
} from "./pr-tool-declarations.ts";
import { prWriteConfigProperties } from "./pr-write-settings.ts";
import { fastTrackConfigProperties, mergeControlConfigProperties } from "./queue-settings.ts";
import { precheckWakeJob, readyForReviewDeclaration } from "./ready-for-review-declaration.ts";
import { stackRebaseConfigProperties } from "./stack-rebase-settings.ts";
import { statePacketConfigProperties } from "./state-packet-declaration.ts";
import { taskToolDeclarations } from "./task-tool-declarations.ts";
import {
  trialResultsConfigProperties,
  trialResultsDeclaration,
} from "./trial-results-declaration.ts";
import { pluginVersion } from "./version.ts";

/**
 * The capability of our local server patch (HAL-16413). Paperclip's shared
 * capability list (2026.1117.0) doesn't name it, so the type doesn't either;
 * the patched host accepts it in a manifest.
 */
const monitorPostpone = "issues.monitors.postpone" as PluginCapability;

/**
 * The capability of the local server patch for `set_next_step` and `finish_run`
 * (HAL-16989, halonic-com/server#31). Not in the shared list either, for the same reason.
 */
const dispositionWrite = "issues.disposition.write" as PluginCapability;

/**
 * The Agent tools plugin (HAL-15920, phase 1). Its first job is the PR
 * watcher (trigger A1); its tools are `pr_status` (B1) and `queue_state`
 * from the watcher's snapshot (HAL-16003). `my_prs` and `task_get` moved to
 * the workspace plugin (HAL-17968). The board check
 * (phase 1b, HAL-16194) adds the `board-check` job and the wake on a board
 * ask. The board's read-only "Worker agents" page (HAL-16249) adds the UI
 * page and a named-column read of Paperclip's task and run tables.
 * Capabilities are the fewest those need: no webhooks, files or processes.
 */
export const manifest: PaperclipPluginManifestV1 = {
  id: "halonic.agent-tools",
  apiVersion: 1,
  version: pluginVersion,
  displayName: "Agent tools",
  description:
    "Halonic's tools beside Paperclip. The PR watcher marks a task done once its pull requests merged with a green ci-ok, and wakes the author for a red ci-ok, a conflict or a new review finding.",
  author: "Halonic",
  categories: ["automation"],
  capabilities: [
    "jobs.schedule",
    "companies.read",
    "agents.read",
    "issues.read",
    // Only `done`, `todo` with the reviewer as assignee, and `todo` on a blocked task whose
    // blockers all finished (HAL-17692): src/plugin/host.ts is the one place that writes a
    // status, through doneOnly, handoffOnly and todoOnly.
    // A task's effort goes through Paperclip's own API instead (src/plugin/task-effort.ts),
    // because the SDK's update leaves that field out. The difficulty tagger sends only a task's
    // labelIds, through setTaskLabels in the same file, changing only its D1–D4 and opus-only labels.
    "issues.update",
    // The PR watcher, the board check, the precheck-wake job (HAL-18980) and the Merger wake (HAL-19234).
    "issues.wakeup",
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
    // api.anthropic.com/v1/messages per board message on a chat task, with its own key, and
    // nothing else (src/plugin/front-bot-calls.ts, HAL-19136). Its lookups, off by default, read a
    // pull request with pr_status's GET requests (src/plugin/front-bot-lookup.ts, HAL-19222).
    // The PR watcher GETs Liam's and Julian's newest runs from Paperclip's API at the address in
    // the settings, to move a limited reviewer's review (src/plugin/reviewer-runs.ts, HAL-19203).
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
  ],
  entrypoints: { worker: "dist/worker.js", ui: "dist/ui" },
  database: {
    namespaceSlug: "agent_tools",
    migrationsDir: "src/plugin/migrations",
    // heartbeat_runs and issues: who works on what, each agent's newest run, failed runs.
    // Never agents: its rows hold adapter settings that can carry keys.
    coreReadTables: [...workerReadTables],
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      // The host stores a `{ type: "secret_ref", secretId }` binding here, but checks the
      // field against this schema with the binding swapped for its secret id, so it is a string.
      githubToken: {
        type: "string",
        title: "GitHub token",
        description:
          "The secret with a read-only GitHub token (PR_WATCHER_GITHUB_TOKEN). The watcher only sends GET requests and GraphQL queries to api.github.com with it.",
        format: "secret-ref",
      },
      ...mergeControlConfigProperties,
      ...mergerWakeConfigProperties,
      ...stackRebaseConfigProperties,
      ...prWriteConfigProperties,
      repos: {
        type: "array",
        title: "Repositories",
        description: "The repositories whose pull requests it watches, as owner/name.",
        items: { type: "string", pattern: "^[\\w.-]+/[\\w.-]+$" },
        default: ["halonic-com/halonic", "halonic-com/cloud"],
      },
      dryRun: {
        type: "boolean",
        title: "Dry run",
        description: "Only log what it would do. Turn off once the first runs look right.",
        default: true,
      },
      ...fastTrackConfigProperties,
      mergeWatchersDryRun: {
        type: "boolean",
        title: "Reviewer wake and UNHANDLED: dry run",
        description:
          "Only log the reviewer wakes and UNHANDLED reports (HAL-17938). Turn off once the logged ones look right.",
        default: true,
      },
      liamWakeTask: {
        type: "string",
        title: "Liam's wake task",
        description:
          "The id of the task where a green pull request that waits only for Liam's review wakes him (Chat with Liam). Empty: it only logs.",
      },
      julianWakeTask: {
        type: "string",
        title: "Julian's wake task",
        description:
          "The id of the task where a pull request Liam wrote that waits only for its review wakes Julian (Chat with Julian). Empty: it only logs.",
      },
      unhandledTask: {
        type: "string",
        title: "UNHANDLED task",
        description:
          "The id of the task where problems open 6 hours on the same head are reported once as UNHANDLED, waking its holder (Chat with Chief). Empty: it only logs.",
      },
      handQueueBranches: {
        type: "array",
        title: "Branches merge control can't queue",
        description:
          "Branch prefixes, such as a workspace company's or the board session's, whose approved, green pull requests merge control can't queue. Their task is told once per head to merge by hand (HAL-17929). Empty: none.",
        items: { type: "string" },
        default: [],
      },
      precheckUrl: {
        type: "string",
        title: "Precheck service",
        description:
          "The address of the precheck service that ready_for_review calls, on Paperclip's Docker network. Empty: http://halonic-precheck:8787.",
      },
      boardCheckerTask: {
        type: "string",
        title: "Board Checker's task",
        description:
          "The id of the Board Checker's task. The board check keeps its two documents there and wakes the Board Checker there for a new board ask. Empty: the board check doesn't run.",
      },
      boardAskWakeTask: {
        type: "string",
        title: "Board ask wake task",
        description:
          "The id of the task where a new board ask wakes its holder instead of the Board Checker, such as Chief's chat task. The holder's own comments then don't count as asks. Empty: asks wake the Board Checker.",
      },
      chiefTask: {
        type: "string",
        title: "Chief's task",
        description:
          "The id of the task where Chief reads the team load. The board check comments there once when the list of agents with nothing to start, or with more than 10 tasks in progress, changes. Empty: it doesn't.",
      },
      seatSupervisorTask: {
        type: "string",
        title: "Seat Supervisor's setup task",
        description:
          "The id of the Seat Supervisor's setup task. The board check adds one line there for new spend-limit failures. Empty: it doesn't.",
      },
      redirectGhStatusCalls: {
        type: "boolean",
        title: "Redirect gh status calls",
        description:
          "On: an agent's gh pr view, checks, list or status and gh run view or list on the watched repository is answered with the pr_status or my_prs call instead. Off: gh runs as it is and the plugin only counts the calls.",
        default: false,
      },
      ghGuardExemptAgents: {
        type: "array",
        title: "Agents the gh guard lets through",
        description:
          "Url keys of agents whose gh status calls always run, such as one that needs gh's own answer for the merge queue.",
        items: { type: "string" },
        default: [],
      },
      boardCheckWritesForVersion: {
        type: "string",
        title: "Board check writes for version",
        description:
          "Empty: the board check only logs what it would write. Enter the plugin's version (shown on the plugin page) to let it write; after an upgrade it stops writing until you enter the new version.",
      },
      taskEffortWritesForVersion: {
        type: "string",
        title: "Task effort writes for version",
        description:
          "Empty: the task effort handler only logs the effort it would set on a task from its tags (D1–D3 low; opus-only, D4 and harder, and a send-back high). Enter the plugin's version to let it set them; after an upgrade it stops until you enter the new version. It reports effort changes it didn't make either way.",
      },
      paperclipApiUrl: {
        type: "string",
        title: "Paperclip API",
        description:
          "The address of Paperclip's API as the plugin reaches it, scheme, host and port only, for example http://127.0.0.1:3100. The task effort handler sends its task changes there, and the PR watcher reads Liam's and Julian's newest runs there (GET only) to move a review off a reviewer who is parked or at a limit.",
      },
      paperclipApiKey: {
        type: "string",
        title: "Paperclip API key",
        description:
          "The secret with the API key the task effort handler sends its task changes with. It sends only a task's assigneeAdapterOverrides, with the effort changed. The PR watcher reads Liam's and Julian's runs with it too (GET only).",
        format: "secret-ref",
      },
      difficultyTaggerForVersion: {
        type: "string",
        title: "Difficulty tagger for version",
        description:
          "Empty: the difficulty tagger is off and calls nothing. Enter the plugin's version to turn it on: a new task, or one whose title or description changes, gets D1–D4 and opus-only labels from Haiku (code tasks only), unless a person or Chief set its difficulty labels. It also needs the Tagger Anthropic key and the Paperclip API and key. After an upgrade it stops until you enter the new version. It stops for the month once spend passes $5.",
      },
      ...frontBotConfigProperties,
      taggerAnthropicKey: {
        type: "string",
        title: "Tagger Anthropic key",
        description:
          "The secret with the difficulty tagger's Anthropic API key (TAGGER_ANTHROPIC_API_KEY). Used only for the tagger's call to claude-haiku-5-5; never logged.",
        format: "secret-ref",
      },
      thinSpecCheckForVersion: {
        type: "string",
        title: "Thin-spec check for version",
        description:
          'Empty: the thin-spec check is off and calls nothing. Enter the plugin\'s version to turn it on: when an agent gets a new code task (labelled D1–D4), Haiku reads its text once; if the score says the expected result may be missing, the task gets a "Clarify acceptance criteria" task for its requester and waits for it. It never rewrites or reassigns the task. It shares the Tagger Anthropic key and the Paperclip API and key, and stops for the month once its spend passes $5.',
      },
      thinSpecClarifier: {
        type: "string",
        title: "Thin-spec clarifier",
        description:
          "The url key of the agent that writes acceptance criteria for a flagged task a person created (a PM agent). A task an agent created goes back to that agent. Empty: a flagged task a person created is logged but gets no clarify task.",
      },
      effortReviewers: {
        type: "array",
        title: "Reviewers for the send-back rule",
        description:
          "Url keys of the reviewers whose hand-back without a signed approval sets the task's effort to high.",
        items: { type: "string" },
        default: ["liam", "julian"],
      },
      ...trialResultsConfigProperties,
      ...statePacketConfigProperties,
      ...chiefLine.properties,
    },
  },
  jobs: [
    {
      jobKey: "pr-watch",
      displayName: "PR watcher",
      description:
        "Every 10 minutes: marks tasks done whose pull requests merged green, and wakes authors for a red ci-ok, a conflict or a new review finding.",
      schedule: "*/10 * * * *",
    },
    {
      jobKey: "board-check",
      displayName: "Board check",
      description:
        "Every 10 minutes: finds agents' comments that ask the board and wakes the Board Checker (or the board ask wake task) once for them, and lists new pending approvals. Hourly: lists what waits on the board and the team load. Writes only comments, its two documents and wake-ups, and nothing while its switch is off.",
      schedule: "*/10 * * * *",
    },
    mergeControlJob,
    mergerWakeJob,
    precheckWakeJob,
  ],
  apiRoutes: [
    {
      // The gh wrapper on the runner asks here with the run's own key (src/gh-guard/).
      routeKey: "gh-guard",
      method: "POST",
      path: "/gh-guard",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      // The Worker agents page's data, for a signed-in board user only (src/plugin/worker-agents-route.ts).
      routeKey: workerAgentsRouteKey,
      method: "GET",
      path: "/worker-agents",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      // Pull requests and the merge queue for Halonic's TeamStatus provider, board only, from the stored snapshot (src/plugin/github-routes.ts).
      routeKey: "github-summary",
      method: "GET",
      path: "/github/summary",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "github-pull",
      method: "GET",
      path: "/github/pr/:number",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      // The front bot's own comment ids on one chat task, board only, read by Messenger (src/plugin/front-bot-notes.ts).
      routeKey: chatNotesRouteKey,
      method: "GET",
      path: "/chat-notes/:taskId",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    ...chiefLine.routes,
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: "worker-agents",
        displayName: "Worker agents",
        exportName: "WorkerAgentsPage",
        routePath: "worker-agents",
      },
    ],
  },
  tools: [
    prStatusDeclaration,
    ciFailuresDeclaration,
    rebasePrDeclaration,
    writePrDeclaration,
    {
      name: "queue_state",
      displayName: "Merge queue",
      description:
        "The merge queue from the PR watcher's last snapshot (at most about 10 minutes old, and it says when it's older): each entry's position, state, group ci-ok, time in the queue and who queued it; merge-group jobs waiting for a runner and the longest wait; open pull requests labelled fast-track with who added the label (unknown never counts as allowed). Sends no GitHub request.",
      parametersSchema: { type: "object", properties: {} },
    },
    readyForReviewDeclaration,
    {
      name: "board_asks",
      displayName: "Board asks",
      description:
        "Agents' comments that asked the board, as the board check found them: task, comment id, author, time, link and whether the board or the Board Checker has commented since. No comment text: open the link to read an ask.",
      parametersSchema: {
        type: "object",
        properties: {
          since: { type: "string", description: "An ISO time; 24 hours back by default." },
        },
      },
    },
    {
      name: "board_waiting",
      displayName: "Waiting on the board",
      description:
        "Open tasks blocked with the board as owner or in review with a pending board card, ranked by how many tasks each holds up (directly and through the chain), longest waiting first on a tie, as of the board check's last hourly pass. Identifiers, holders, counts and times only, no titles.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: "failed_runs",
      displayName: "Failed runs",
      description:
        "Runs that failed or timed out, per agent, with their tasks and cause codes (no_identity, spend_limit, timeout, adapter_error, other), never the error text. Counts only what the plugin saw while it ran.",
      parametersSchema: {
        type: "object",
        properties: {
          since: { type: "string", description: "An ISO time; 24 hours back by default." },
        },
      },
    },
    {
      name: "merge_speed",
      displayName: "Merge speed",
      description:
        "Merges per hour, the share of pull requests dropped from the merge queue without merging, and the time in the queue of the merged ones, from the PR watcher's last GitHub snapshot. Queue exits count only from the board check's first pass. Pull request numbers and times only.",
      parametersSchema: {
        type: "object",
        properties: {
          hours: {
            type: "integer",
            minimum: 1,
            maximum: 168,
            description: "How many hours back; 6 by default.",
          },
        },
      },
    },
    ...taskToolDeclarations,
    trialResultsDeclaration,
  ],
};

// biome-ignore lint/style/noDefaultExport: the plugin host reads the manifest from the default export.
export default manifest;
