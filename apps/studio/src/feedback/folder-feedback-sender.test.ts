import { AgentHostError, type PaperclipConnectionRow } from "@halonicjs/adapter-agent-host-client";
import type { FeedbackTask } from "@halonicjs/studio-feature-feedback";
import { AgentHostNotAnswering, type FeedbackToSend } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FolderFeedbackSender, taskIdOf } from "./folder-feedback-sender.ts";

const task: FeedbackTask = {
  title: "Run list jumps",
  description: "Run list jumps\n\nStudio 0.2.0",
  project: "Acme apps",
  assignee: "Robin",
  screenshot: { fileName: "feedback.png", contentType: "image/png", width: 2, height: 2 },
};

function row(name: string, kind: "online" | "offline" | "signed-out" | "no-key") {
  const state = kind === "online" || kind === "offline" ? { kind, asOf: "" } : { kind };
  return { id: name, name, label: name, address: "", company: "", state } as PaperclipConnectionRow;
}

/** A host serving Acme with `rows`, answering each send with `answer`. */
function host(rows: PaperclipConnectionRow[], answer = { outcome: "sent", taskUrl: "" } as const) {
  const sent: FeedbackToSend[] = [];
  return {
    sent,
    listed: async () => ({ workspace: "/real/acme", connections: rows }),
    send: async (feedback: FeedbackToSend) => {
      sent.push(feedback);
      return answer.outcome === "sent"
        ? { outcome: "sent" as const, taskUrl: "https://paperclip.acme.test/ACME/issues/ACME-12" }
        : answer;
    },
  };
}

verifies("studio.feedback-sender", () => {
  it("sends through the folder's first connection that holds its key, with its real path", async () => {
    const acme = host([row("old", "signed-out"), row("board", "online"), row("other", "online")]);
    const png = new Uint8Array([0x89, 0x50]);

    const outcome = await new FolderFeedbackSender(acme).send("id-1", task, png);

    expect(outcome).toEqual({
      kind: "sent",
      taskId: "ACME-12",
      taskUrl: "https://paperclip.acme.test/ACME/issues/ACME-12",
    });
    expect(acme.sent).toEqual([
      {
        workspace: "/real/acme",
        connection: "board",
        id: "id-1",
        title: "Run list jumps",
        description: "Run list jumps\n\nStudio 0.2.0",
        project: "Acme apps",
        assignee: "Robin",
        screenshot: { fileName: "feedback.png", png },
      },
    ]);
  });

  it("keeps the feedback offline when the host isn't answering", async () => {
    const sender = new FolderFeedbackSender({
      listed: async () => {
        throw new AgentHostNotAnswering(new AgentHostError(0, "host_unavailable", "not running"));
      },
      send: async () => ({ outcome: "offline" }),
    });

    expect(await sender.send("id-1", task, null)).toEqual({ kind: "offline" });
  });

  it("keeps it until connected when no connection holds its key, sending nothing", async () => {
    const acme = host([row("board", "no-key"), row("old", "signed-out")]);

    expect(await new FolderFeedbackSender(acme).send("id-1", task, null)).toEqual({
      kind: "not-connected",
    });
    expect(acme.sent).toEqual([]);
  });

  it("passes on a refusal without words, as the host keeps Paperclip's to itself", async () => {
    const acme = host([row("board", "offline")], { outcome: "refused" } as never);

    expect(await new FolderFeedbackSender(acme).send("id-1", task, null)).toEqual({
      kind: "refused",
      reason: "",
    });
  });

  it("reads the task's ID from the end of its page's path", () => {
    expect(taskIdOf("https://paperclip.acme.test/ACME/issues/ACME-12")).toBe("ACME-12");
    expect(taskIdOf("https://paperclip.acme.test/ACME/issues/ACME-12/")).toBe("ACME-12");
  });
});
