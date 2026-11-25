// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ServerSessionOffer } from "../server-session/server-session-offer.ts";
import type {
  ServerChoice,
  ServerSessionAnswer,
  ServerSessionRequest,
  ServerSessionShell,
} from "../server-session/server-session-shell.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunWithClaude } from "./run-with-claude.tsx";

afterEach(unmountAll);

const offer: ServerSessionOffer = {
  task: "HAL-1234",
  requester: "Chief",
  requestHash: "rev-2",
  brief:
    "Task: https://paperclip.acme.example/HAL/issues/HAL-1234\nSteps:\n1. <b>Restart</b> `acme-web`\n",
};

const acmeServer: ServerChoice = {
  kind: "set",
  target: { host: "build.acme.example", user: "ops" },
};

/** A shell that records what it was given and answers `answer`. */
function fakeShell(answer: ServerSessionAnswer) {
  const requests: ServerSessionRequest[] = [];
  const shell: ServerSessionShell = {
    open: async (request) => {
      requests.push(request);
      return answer;
    },
  };
  return { shell, requests };
}

function show(server: ServerChoice, shell: ServerSessionShell | undefined) {
  const opened: string[] = [];
  const root = render(
    <RunWithClaude
      offer={offer}
      server={server}
      shell={shell}
      openSettings={() => opened.push("settings")}
      onStarted={() => opened.push("started")}
    />,
  );
  return { root, opened };
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((each) => each.textContent === name);
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function press(root: HTMLElement, name: string) {
  await act(async () => button(root, name).click());
}

verifies("action-steppers.run-with-claude", () => {
  describe("RunWithClaude", () => {
    it("reads Set up your server in Settings first with no host set, and opens Settings", async () => {
      const { root, opened } = show({ kind: "not-set-up" }, fakeShell({ kind: "cancelled" }).shell);
      expect(root.textContent).not.toContain("Run with Claude");
      await press(root, "Set up your server in Settings first");
      expect(opened).toEqual(["settings"]);
    });

    it("says why a refused server can't be used", () => {
      const { root } = show(
        { kind: "refused", reason: "the user must be a lower-case user name, such as ops" },
        undefined,
      );
      expect(root.textContent).toContain(
        "Your server in Settings can't be used: the user must be a lower-case user name, such as ops.",
      );
    });

    it("shows the whole brief as plain text under who wrote it, then starts through the shell", async () => {
      const { shell, requests } = fakeShell({ kind: "terminal-opened" });
      const { root, opened } = show(acmeServer, shell);
      await press(root, "Run with Claude");
      expect(root.querySelector("h3")?.textContent).toBe("Run with Claude on build.acme.example");
      expect(root.textContent).toContain("Claude Code will start on ops@build.acme.example");
      expect(root.querySelector("figcaption")?.textContent).toBe(
        "Written by Chief, not checked by Halonic",
      );
      expect(root.querySelector("figure pre")?.textContent).toBe(offer.brief);
      expect(root.querySelector("b")).toBeNull();
      await press(root, "Run with Claude");
      expect(requests).toEqual([offer]);
      expect(opened).toEqual(["started"]);
      expect(root.textContent).toContain(
        "Claude Code is starting in a terminal. It reports back on HAL-1234.",
      );
    });

    it("goes back to the button on Cancel, and says nothing started when the shell's window was cancelled", async () => {
      const { shell } = fakeShell({ kind: "cancelled" });
      const { root } = show(acmeServer, shell);
      await press(root, "Run with Claude");
      await press(root, "Run with Claude");
      expect(root.textContent).toContain("Nothing was started.");
      await press(root, "Cancel");
      expect(root.querySelector("h3")).toBeNull();
    });

    it("shows the manual guide with Copy command where the shell can't open a terminal", async () => {
      const { root } = show(
        { kind: "set", target: { ...acmeServer.target, port: 2222 } },
        undefined,
      );
      await press(root, "Run with Claude");
      expect(root.textContent).toContain("Start it yourself");
      expect(root.textContent).toContain("ssh -p 2222 -- ops@build.acme.example");
      expect(root.querySelector('button[aria-label="Copy command"]')).not.toBeNull();
      expect(root.querySelector('button[aria-label="Copy the brief"]')).not.toBeNull();
    });

    it("shows the manual guide when the shell found no terminal", async () => {
      const { root } = show(acmeServer, fakeShell({ kind: "no-terminal" }).shell);
      await press(root, "Run with Claude");
      await press(root, "Run with Claude");
      expect(root.textContent).toContain("Halonic found no terminal on this computer.");
      expect(root.querySelector('button[aria-label="Copy command"]')).not.toBeNull();
    });

    it("says why the shell refused", async () => {
      const { root } = show(
        acmeServer,
        fakeShell({ kind: "refused", reason: "the brief is over 8 KB" }).shell,
      );
      await press(root, "Run with Claude");
      await press(root, "Run with Claude");
      expect(root.textContent).toContain("Halonic didn't start it: the brief is over 8 KB.");
    });
  });
});
