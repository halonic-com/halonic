import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { frontBotConfigProperties } from "../front-bot/settings.ts";
import { workerAgentsRouteKey } from "../worker-agents/keys.ts";
import { workerReadTables } from "../worker-agents/tables.ts";
import { chiefLine } from "./chief-line-settings.ts";
import { chatNotesRouteKey } from "./front-bot-notes.ts";
import { capabilities } from "./manifest-capabilities.ts";
import { mergeControlJob } from "./merge-control-declaration.ts";
import { mergerWakeConfigProperties, mergerWakeJob } from "./merger-wake-declaration.ts";
import {
  ciFailuresDeclaration,
  mergeSpeedDeclaration,
  prStatusDeclaration,
  queueStateDeclaration,
  rebasePrDeclaration,
  writePrDeclaration,
} from "./pr-tool-declarations.ts";
import { prWatcherPassRoute } from "./pr-watcher-pass-declaration.ts";
import { prWriteConfigProperties } from "./pr-write-settings.ts";
import { fastTrackConfigProperties, mergeControlConfigProperties } from "./queue-settings.ts";
import { reactDeclaration, reactionRoutes } from "./reaction-declarations.ts";
import { precheckWakeJob, readyForReviewDeclaration } from "./ready-for-review-declaration.ts";
import {
  reviewVerdictConfigProperties,
  reviewVerdictDeclaration,
} from "./review-verdict-declaration.ts";
import { seatMoveJob, seatMoverConfigProperties, seatResetRoute } from "./seat-move-declaration.ts";
import { stackRebaseConfigProperties } from "./stack-rebase-settings.ts";
import { statePacketConfigProperties } from "./state-packet-declaration.ts";
import { taskToolDeclarations } from "./task-tool-declarations.ts";
import {
  trialResultsConfigProperties,
  trialResultsDeclaration,
} from "./trial-results-declaration.ts";
import { pluginVersion } from "./version.ts";
import { wakeHoldConfigProperties } from "./wake-hold-declaration.ts";

/** The setting for the task a reviewer's wake goes to (`watchers/run.ts`, HAL-19653). */
function reviewerWakeTask(name: string) {
  return {
    type: "string",
    title: `${name}'s wake task`,
    description: `The id of the task where a green pull request that waits only for ${name}'s review wakes them (Chat with ${name}). Empty: it only logs.`,
  } as const;
}

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
  capabilities,
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
      ...reviewVerdictConfigProperties,
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
      liamWakeTask: reviewerWakeTask("Liam"),
      julianWakeTask: reviewerWakeTask("Julian"),
      noraWakeTask: reviewerWakeTask("Nora"),
      unhandledTask: {
        type: "string",
        title: "UNHANDLED task",
        description:
          "The id of the task where problems open 6 hours on the same head are reported once as UNHANDLED, waking its holder (Chat with Chief). Empty: it only logs.",
      },
      boardLineTask: {
        type: "string",
        title: "Board line task",
        description:
          "The id of the board's line to Chief, where an agent with a role that had no work in its first hour live is reported beside the UNHANDLED task (HAL-19641). Empty: only the UNHANDLED task.",
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
          "The address of Paperclip's API as the plugin reaches it, scheme, host and port only, for example http://127.0.0.1:3100. The task effort handler, the difficulty tagger, the thin-spec check, the front bot's progress notes, the PR watcher and the seat mover call it; the API key below says what each sends.",
      },
      paperclipApiKey: {
        type: "string",
        title: "Paperclip API key",
        description:
          "The secret with the plugin's Paperclip API key. Six parts use it: the task effort handler sends only a task's assigneeAdapterOverrides, with the effort changed; the difficulty tagger reads the company's labels (GET only); the thin-spec check posts its comment on a flagged task, reads that task, creates the clarify task under it and sets it blocked by the clarify task; the front bot's progress notes read a chat run's status and the next piece of its log (GET only); the PR watcher reads Liam's and Julian's newest runs (GET only); the seat mover, unless off, reads the AI connections, the seat readings (a POST to the readings plugin's data), one agent and a run's recovery hold, and in act mode changes an agent's runtimeConfig (only aiConnection), cancels a parked run that never started and resolves the hold that cancel leaves.",
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
      ...wakeHoldConfigProperties,
      ...chiefLine.properties,
      ...seatMoverConfigProperties,
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
    seatMoveJob,
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
    seatResetRoute,
    ...reactionRoutes,
    prWatcherPassRoute,
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
    queueStateDeclaration,
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
    mergeSpeedDeclaration,
    ...taskToolDeclarations,
    trialResultsDeclaration,
    reviewVerdictDeclaration,
    reactDeclaration,
  ],
};

// biome-ignore lint/style/noDefaultExport: the plugin host reads the manifest from the default export.
export default manifest;
