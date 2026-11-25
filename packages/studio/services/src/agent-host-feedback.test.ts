import {
  type AgentHostAnswer,
  AgentHostError,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { AgentHostFeedback, type FeedbackToSend } from "./agent-host-feedback.ts";
import { AgentHostNotAnswering } from "./agent-host-not-answering.ts";

/** A tiny made-up PNG: the signature and a few bytes after it. */
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const feedback: FeedbackToSend = {
  workspace: "/work/acme",
  connection: "halonic",
  id: "feedback-1",
  title: "The Runs list jumps",
  description: "The Runs list jumps when a run ends.",
  project: "Website",
  assignee: "Ada",
  screenshot: { fileName: "feedback-2026-11-25T18-04-05.png", png },
};

/** A host that answers every request with `answer`, or fails with `error`. */
function hostAnswering(answer: AgentHostAnswer | Error) {
  const request = vi.fn(async (_route: string, _body?: unknown) => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const transport: AgentHostTransport = {
    request,
    stream: () => Promise.reject(new Error("No stream route is used here.")),
  };
  return { request, feedback: new AgentHostFeedback(transport) };
}

verifies("services.feedback-send", () => {
  describe("AgentHostFeedback", () => {
    it("posts the feedback with the PNG as base64, and answers sent with the task's page", async () => {
      const taskUrl = "https://paperclip.acme.test/ACME/issues/ACME-42";
      const host = hostAnswering({ status: 200, body: { outcome: "sent", taskUrl } });

      expect(await host.feedback.send(feedback)).toEqual({ outcome: "sent", taskUrl });
      expect(host.request).toHaveBeenCalledWith("POST /v1/paperclip/feedback", {
        workspace: "/work/acme",
        connection: "halonic",
        id: "feedback-1",
        title: "The Runs list jumps",
        description: "The Runs list jumps when a run ends.",
        project: "Website",
        assignee: "Ada",
        screenshot: {
          fileName: "feedback-2026-11-25T18-04-05.png",
          contentType: "image/png",
          base64: "iVBORw0KGgoBAgME",
        },
      });
    });

    it("sends no screenshot field for a feedback without one", async () => {
      const host = hostAnswering({ status: 200, body: { outcome: "refused" } });

      await host.feedback.send({ ...feedback, screenshot: null });

      expect(host.request.mock.calls[0]?.[1]).not.toHaveProperty("screenshot");
    });

    it("answers each of the host's outcomes as it is", async () => {
      for (const outcome of ["offline", "not-connected", "refused"] as const) {
        const host = hostAnswering({ status: 200, body: { outcome } });
        expect(await host.feedback.send(feedback)).toEqual({ outcome });
      }
    });

    it("is offline when the host isn't answering, so the feedback waits", async () => {
      const refusal = new AgentHostError(0, "host_unavailable", "The host isn't running.");
      const host = hostAnswering(new AgentHostNotAnswering(refusal));

      expect(await host.feedback.send(feedback)).toEqual({ outcome: "offline" });
    });

    it("is refused for a body the host refused, and not-connected for a workspace it doesn't serve", async () => {
      const error = (kind: string) => ({ error: { kind, message: "…" } });
      expect(
        await hostAnswering({ status: 413, body: error("body_too_large") }).feedback.send(feedback),
      ).toEqual({ outcome: "refused" });
      expect(
        await hostAnswering({ status: 400, body: error("body_invalid") }).feedback.send(feedback),
      ).toEqual({ outcome: "refused" });
      expect(
        await hostAnswering({ status: 404, body: error("unknown_workspace") }).feedback.send(
          feedback,
        ),
      ).toEqual({ outcome: "not-connected" });
    });

    it("throws for any other answer: no token, a fault, or a shape it doesn't know", async () => {
      for (const answer of [
        { status: 401, body: { error: { kind: "unauthenticated" } } },
        { status: 500, body: {} },
        { status: 200, body: { outcome: "sent" } },
        { status: 200, body: { outcome: "maybe" } },
        { status: 200, body: null },
      ]) {
        await expect(hostAnswering(answer).feedback.send(feedback)).rejects.toThrow(AgentHostError);
      }
    });

    it("lets any other failure of the call through", async () => {
      const host = hostAnswering(new TypeError("broken"));

      await expect(host.feedback.send(feedback)).rejects.toThrow(TypeError);
    });
  });
});
