import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { discardedToast, feedbackToast } from "./feedback-toast.ts";

verifies("feedback.send-toasts", () => {
  it("says Feedback sent with the task and Open task, which opens its page", () => {
    const openTask = vi.fn();
    const toast = feedbackToast(
      {
        kind: "sent",
        taskId: "ACME-12",
        taskUrl: "https://paperclip.acme.test/ACME/issues/ACME-12",
      },
      "Run list jumps",
      openTask,
    );
    expect(toast).toMatchObject({
      tone: "success",
      title: "Feedback sent",
      text: "ACME-12 · Run list jumps",
      action: { label: "Open task" },
    });
    toast?.action?.onClick();
    expect(openTask).toHaveBeenCalledWith("https://paperclip.acme.test/ACME/issues/ACME-12");
  });

  it("says Feedback saved, and when it sends by itself", () => {
    const offline = feedbackToast({ kind: "saved", until: "online" }, "Run list jumps", vi.fn());
    expect(offline).toEqual({
      tone: "info",
      title: "Feedback saved",
      text: "It sends by itself once Studio is back online.",
    });
    const notConnected = feedbackToast({ kind: "saved", until: "connected" }, "x", vi.fn());
    expect(notConnected?.text).toBe("It sends by itself once Studio is connected to Paperclip.");
  });

  it("has no toast for a refusal, which the caller logs", () => {
    expect(feedbackToast({ kind: "refused", reason: "no project" }, "x", vi.fn())).toBeUndefined();
    expect(feedbackToast({ kind: "full" }, "x", vi.fn())).toBeUndefined();
  });

  it("says Feedback discarded with Undo", () => {
    const undo = vi.fn();
    const toast = discardedToast(undo);
    expect(toast).toMatchObject({ tone: "info", title: "Feedback discarded" });
    toast.action?.onClick();
    expect(undo).toHaveBeenCalledOnce();
  });
});
