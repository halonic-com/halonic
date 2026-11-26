import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  type ClickTestRun,
  type ClickTestRunReader,
  type EvidenceTarget,
  postClickTestEvidence,
} from "./post.ts";

const table = [
  "### Click test on the installed Studio (abc1234)",
  "",
  "All 2 steps passed.",
  "",
  "| # | Step | Verdict | Code | Note | Screenshot |",
  "| --- | --- | --- | --- | --- | --- |",
  "| 1 | The engine answers | ✅ passed |  |  | 01-engine-answers.png |",
  "| 2 | Messenger shows its empty state | ✅ passed |  |  | 02-messenger-empty.png |",
  "",
].join("\n");

const png = new Uint8Array([137, 80, 78, 71]);

function fakeGitHub(run: Partial<ClickTestRun> = {}): ClickTestRunReader & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    read: async (runId) => {
      reads.push(runId);
      return {
        url: `https://github.com/acme/studio/actions/runs/${runId}`,
        repository: "acme/studio",
        path: ".github/workflows/studio-preview.yml",
        headRepository: "acme/studio",
        event: "workflow_dispatch",
        table,
        screenshots: [
          { name: "01-engine-answers.png", png },
          { name: "02-messenger-empty.png", png },
        ],
        ...run,
      };
    },
  };
}

function fakePaperclip(): EvidenceTarget & { attached: string[]; comments: string[] } {
  const attached: string[] = [];
  const comments: string[] = [];
  return {
    attached,
    comments,
    attach: async (task, screenshot) => {
      attached.push(`${task}/${screenshot.name}`);
      return `/api/attachments/${attached.length}/content`;
    },
    comment: async (task, body) => {
      comments.push(`${task}: ${body}`);
    },
  };
}

verifies("paperclip.click-test-evidence", () => {
  describe("postClickTestEvidence", () => {
    test("attaches each screenshot, links it from its row and posts one comment", async () => {
      const paperclip = fakePaperclip();
      const body = await postClickTestEvidence("45686461002", "ACME-7", fakeGitHub(), paperclip);
      expect(paperclip.attached).toEqual([
        "ACME-7/01-engine-answers.png",
        "ACME-7/02-messenger-empty.png",
      ]);
      expect(body).toContain("| [01-engine-answers.png](/api/attachments/1/content) |");
      expect(body).toContain("| [02-messenger-empty.png](/api/attachments/2/content) |");
      expect(body).toContain(
        "From [run 45686461002](https://github.com/acme/studio/actions/runs/45686461002).",
      );
      expect(paperclip.comments).toEqual([`ACME-7: ${body}`]);
    });

    test("attaches only the step screenshots", async () => {
      const paperclip = fakePaperclip();
      const github = fakeGitHub({
        screenshots: [
          { name: "notes.txt", png },
          { name: "01-engine-answers.png", png },
        ],
      });
      await postClickTestEvidence("1", "ACME-7", github, paperclip);
      expect(paperclip.attached).toEqual(["ACME-7/01-engine-answers.png"]);
    });

    test("refuses a run id that isn't a number and posts nothing", async () => {
      const github = fakeGitHub();
      const paperclip = fakePaperclip();
      await expect(
        postClickTestEvidence("45686461002; rm -rf", "ACME-7", github, paperclip),
      ).rejects.toThrow("isn't a GitHub run id");
      expect(github.reads).toEqual([]);
      expect(paperclip.comments).toEqual([]);
    });

    test.each([
      ["another workflow's", { path: ".github/workflows/ci.yml" }, "ran .github/workflows/ci.yml"],
      ["a fork's", { headRepository: "mallory/studio" }, "ran code from mallory/studio"],
      ["a pull request's", { event: "pull_request" }, "was started by pull_request"],
    ] as const)("refuses %s run and posts nothing", async (_, run, reason) => {
      const paperclip = fakePaperclip();
      await expect(
        postClickTestEvidence("1", "ACME-7", fakeGitHub(run), paperclip),
      ).rejects.toThrow(reason);
      expect(paperclip.attached).toEqual([]);
      expect(paperclip.comments).toEqual([]);
    });

    test("refuses a run with no table and posts nothing", async () => {
      const paperclip = fakePaperclip();
      await expect(
        postClickTestEvidence("1", "ACME-7", fakeGitHub({ table: "  \n" }), paperclip),
      ).rejects.toThrow("has no results table");
      expect(paperclip.attached).toEqual([]);
      expect(paperclip.comments).toEqual([]);
    });
  });
});
