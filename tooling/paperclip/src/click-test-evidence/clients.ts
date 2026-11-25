import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ClickTestRunReader, EvidenceTarget } from "./post.ts";

const run = promisify(execFile);

/** Reads a run's `halonic-click-test` artifact with the agent's own `gh`. */
export function ghClickTestRuns(repo: string): ClickTestRunReader {
  return {
    read: async (runId) => {
      const { stdout } = await run("gh", [
        "run",
        "view",
        runId,
        "-R",
        repo,
        "--json",
        "url,workflowName",
      ]);
      const view = JSON.parse(stdout) as { url: string; workflowName: string };
      const folder = await mkdtemp(join(tmpdir(), "click-test-"));
      try {
        await run("gh", [
          "run",
          "download",
          runId,
          "-R",
          repo,
          "-n",
          "halonic-click-test",
          "-D",
          folder,
        ]);
        const table = await readFile(join(folder, "results.md"), "utf8");
        const names = await readdir(join(folder, "screenshots")).catch(() => []);
        const screenshots = await Promise.all(
          names.sort().map(async (name) => ({
            name,
            png: new Uint8Array(await readFile(join(folder, "screenshots", name))),
          })),
        );
        return { url: view.url, workflowName: view.workflowName, table, screenshots };
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Posts through Paperclip's API with the agent's own run key, which comes from
 * the environment, never the command line.
 */
export function paperclipEvidence(apiUrl: string, apiKey: string, runId?: string): EvidenceTarget {
  const base = apiUrl.replace(/\/$/, "").replace(/\/api$/, "");
  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
  if (runId !== undefined) headers["x-paperclip-run-id"] = runId;
  const call = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const response = await fetch(`${base}/api${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    });
    if (!response.ok) {
      throw new Error(`Paperclip ${init.method ?? "GET"} ${path}: HTTP ${response.status}`);
    }
    return response.json();
  };
  const issueOf = async (task: string) =>
    (await call(`/issues/${encodeURIComponent(task)}`)) as { id: string; companyId: string };
  return {
    attach: async (task, screenshot) => {
      const issue = await issueOf(task);
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(screenshot.png)], { type: "image/png" }), screenshot.name);
      const path = `/companies/${issue.companyId}/issues/${issue.id}/attachments`;
      const attachment = (await call(path, { method: "POST", body: form })) as {
        contentPath?: string;
      };
      if (attachment.contentPath === undefined)
        throw new Error("the attachment has no contentPath");
      return attachment.contentPath;
    },
    comment: async (task, body) => {
      const issue = await issueOf(task);
      await call(`/issues/${issue.id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
    },
  };
}
