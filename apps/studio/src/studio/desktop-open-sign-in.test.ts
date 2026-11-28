import type { OpenExternal } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { desktopOpenSignIn } from "./desktop-open-sign-in.ts";

const approvalPage = "https://paperclip.acme.test/cli-auth/challenge-1";
const paperclip = "https://paperclip.acme.test";

/** A shell that answers `open_sign_in` with `answer`, and records what it was sent. */
function shell(answer: () => Promise<unknown>) {
  const sent: unknown[] = [];
  const ipc = {
    invoke: vi.fn(async (command: string, args?: Record<string, unknown>) => {
      sent.push({ command, args });
      return answer();
    }),
  };
  return { ipc, sent };
}

verifies("studio.desktop-sign-in-window", () => {
  it("asks the shell to open the sign-in page and opens nothing else when it did", async () => {
    const { ipc, sent } = shell(async () => "opened");
    const openExternal = vi.fn<OpenExternal>(async () => {});
    await desktopOpenSignIn(ipc, openExternal)(Promise.resolve(approvalPage), paperclip);
    expect(sent).toEqual([
      { command: "open_sign_in", args: { url: approvalPage, origin: paperclip } },
    ]);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("opens the page as every other link when the shell answers fallback", async () => {
    const { ipc } = shell(async () => "fallback");
    const openExternal = vi.fn<OpenExternal>(async () => {});
    await desktopOpenSignIn(ipc, openExternal)(approvalPage, paperclip);
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(approvalPage);
  });

  it("reports a refusal and still opens the page as every other link", async () => {
    const refusal = "invalid";
    const { ipc } = shell(async () => {
      throw refusal;
    });
    const openExternal = vi.fn<OpenExternal>(async () => {});
    const report = vi.fn();
    await desktopOpenSignIn(ipc, openExternal, report)(approvalPage, paperclip);
    expect(report).toHaveBeenCalledExactlyOnceWith(refusal);
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(approvalPage);
  });
});
