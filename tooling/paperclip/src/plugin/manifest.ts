import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

/**
 * The Agent tools plugin (HAL-15920, phase 1). Its first job is the PR
 * watcher (trigger A1). Capabilities are the fewest the watcher needs: no
 * webhooks, agent tools, UI, files or processes.
 */
export const manifest: PaperclipPluginManifestV1 = {
  id: "halonic.agent-tools",
  apiVersion: 1,
  version: "0.1.0",
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
    // Only `done`: src/plugin/host.ts is the one place that writes a status, through doneOnly.
    "issues.update",
    "issues.wakeup",
    "issue.comments.read",
    "issue.comments.create",
    // Only GET requests to api.github.com (the reader's origin guard); the manifest can't list hosts.
    "http.outbound",
    "secrets.read-ref",
  ],
  entrypoints: { worker: "dist/worker.js" },
  instanceConfigSchema: {
    type: "object",
    properties: {
      githubToken: {
        type: "object",
        title: "GitHub token",
        description:
          "The secret with a read-only GitHub token (PR_WATCHER_GITHUB_TOKEN). The watcher only sends GET requests to api.github.com with it.",
        format: "secret-ref",
        properties: {
          type: { const: "secret_ref" },
          secretId: { type: "string" },
          version: {},
        },
        required: ["type", "secretId"],
      },
      repos: {
        type: "array",
        title: "Repositories",
        description: "The repositories whose pull requests it watches, as owner/name.",
        items: { type: "string", pattern: "^[\\w.-]+/[\\w.-]+$" },
        default: ["halonic-com/halonic"],
      },
      dryRun: {
        type: "boolean",
        title: "Dry run",
        description: "Only log what it would do. Turn off once the first runs look right.",
        default: true,
      },
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
  ],
};

// biome-ignore lint/style/noDefaultExport: the plugin host reads the manifest from the default export.
export default manifest;
