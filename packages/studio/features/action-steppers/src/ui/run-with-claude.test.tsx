// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

/** Presses the button as a keyboard does: focus on it first, so it can lose focus with the answer. */
async function pressFocused(root: HTMLElement, name: string) {
  button(root, name).focus();
  await press(root, name);
}

verifies("action-steppers.run-with-claude", () => {
  describe("RunWithClaude", () => {
    it("reads Set up your server in Settings first with no host set, and opens Settings", async () => {
      const { root, opened } = show({ kind: "not-set-up" }, fakeShell({ kind: "cancelled" }).shell);
      expect(root.textContent).not.toContain("Run with Claude");
      await press(root, "Set up your server in Settings first");
      expect(opened).toEqual(["settings"]);
    });

    it("says why a refused server can't be used, and offers to fix it in Settings", async () => {
      const { root, opened } = show(
        { kind: "refused", reason: "the user must be a lower-case user name, such as ops" },
        undefined,
      );
      expect(root.textContent).toContain(
        "Your server in Settings can't be used: the user must be a lower-case user name, such as ops.",
      );
      await press(root, "Fix your server in Settings");
      expect(opened).toEqual(["settings"]);
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
      const briefBox = root.querySelector("figure pre");
      expect(briefBox?.textContent).toBe(offer.brief);
      // A keyboard reaches the scrolling box, named by who wrote it.
      expect(briefBox?.getAttribute("tabindex")).toBe("0");
      expect(briefBox?.getAttribute("role")).toBe("region");
      const captionId = root.querySelector("figcaption")?.id;
      expect(briefBox?.getAttribute("aria-labelledby")).toBe(captionId);
      expect(root.textContent).toContain("Show the commands that will run");
      expect(root.querySelector("b")).toBeNull();
      await press(root, "Run with Claude");
      // Exactly the task, the brief and the hash: never who asked.
      expect(requests).toEqual([
        { task: offer.task, brief: offer.brief, requestHash: offer.requestHash },
      ]);
      expect(opened).toEqual(["started"]);
      expect(root.textContent).toContain(
        "Claude Code is starting in a terminal. It reports back on HAL-1234.",
      );
    });

    it("has Run with Claude as the confirm screen's one primary button, as the stepper's Run step", async () => {
      const { root } = show(acmeServer, fakeShell({ kind: "cancelled" }).shell);
      await press(root, "Run with Claude");
      const primary = [...root.querySelectorAll("button")].filter((each) =>
        each.classList.contains("bg-primary"),
      );
      expect(primary.map((each) => each.textContent)).toEqual(["Run with Claude"]);
    });

    it("goes back to the button on Cancel, and says nothing started when the shell's window was cancelled", async () => {
      const { shell } = fakeShell({ kind: "cancelled" });
      const { root } = show(acmeServer, shell);
      await press(root, "Run with Claude");
      await press(root, "Run with Claude");
      expect(root.textContent).toContain("Nothing was started.");
      await press(root, "Cancel");
      expect(root.querySelector("h3")).toBeNull();
      expect(document.activeElement).toBe(button(root, "Run with Claude"));
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
      expect([...root.querySelectorAll("ol li")].map((step) => step.textContent)).toEqual([
        expect.stringContaining("Open a terminal and run this command:"),
        "On the server, run claude.",
        expect.stringContaining("Paste the brief as your first message."),
      ]);
      expect(root.querySelector("ol li:nth-child(2) code")?.textContent).toBe("claude");
      // By hand the launcher never runs, so the screen doesn't offer to show it.
      expect(root.textContent).not.toContain("Show the commands that will run");
      await press(root, "Cancel");
      expect(root.querySelector("h3")).toBeNull();
    });

    it("shows the manual guide when the shell found no terminal", async () => {
      const { root } = show(acmeServer, fakeShell({ kind: "no-terminal" }).shell);
      await press(root, "Run with Claude");
      await press(root, "Run with Claude");
      expect(root.textContent).toContain("Halonic found no terminal on this computer.");
      expect(root.querySelector('button[aria-label="Copy command"]')).not.toBeNull();
      expect(root.textContent).not.toContain("Show the commands that will run");
    });

    it("offers Settings and Cancel when the shell finds no server set", async () => {
      const { root, opened } = show(acmeServer, fakeShell({ kind: "not-configured" }).shell);
      await press(root, "Run with Claude");
      await press(root, "Run with Claude");
      await press(root, "Set up your server in Settings first");
      expect(opened).toEqual(["settings"]);
      await press(root, "Cancel");
      expect(root.querySelector("h3")).toBeNull();
    });

    it("says the desktop app couldn't open the session when the shell throws, and reports why", async () => {
      const thrown = new Error("bridge down");
      const shell: ServerSessionShell = {
        open: async () => {
          throw thrown;
        },
      };
      const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { root, opened } = show(acmeServer, shell);
      await press(root, "Run with Claude");
      await press(root, "Run with Claude");
      expect(root.textContent).toContain(
        "Halonic didn't start it: the desktop app couldn't open the session.",
      );
      expect(reported).toHaveBeenCalledWith(
        "The desktop app couldn't open the server session",
        thrown,
      );
      expect(opened).toEqual([]);
      reported.mockRestore();
    });

    it("moves focus to the started line, which says it once, when the terminal opened", async () => {
      const { root } = show(acmeServer, fakeShell({ kind: "terminal-opened" }).shell);
      await press(root, "Run with Claude");
      await pressFocused(root, "Run with Claude");
      const started = "Claude Code is starting in a terminal. It reports back on HAL-1234.";
      expect(document.activeElement?.getAttribute("role")).toBe("group");
      expect(document.activeElement?.textContent).toBe(started);
      // The focused line reads the words, so the status region stays empty.
      expect(root.querySelector('[role="status"]')?.textContent).toBe("");
      expect(root.querySelector('[role="alert"]')?.textContent).toBe("");
    });

    it("moves focus to the guide's title and says why when the shell found no terminal", async () => {
      const { root } = show(acmeServer, fakeShell({ kind: "no-terminal" }).shell);
      await press(root, "Run with Claude");
      await pressFocused(root, "Run with Claude");
      expect(document.activeElement?.textContent).toBe("Start it yourself");
      expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
      expect(root.querySelector('[role="status"]')?.textContent).toBe(
        "Halonic found no terminal on this computer.",
      );
    });

    it("moves focus to the heading when the shell finds no server set", async () => {
      const { root } = show(acmeServer, fakeShell({ kind: "not-configured" }).shell);
      await press(root, "Run with Claude");
      await pressFocused(root, "Run with Claude");
      expect(document.activeElement).toBe(root.querySelector("h3"));
    });

    it("keeps focus on Run with Claude and says Nothing was started when the shell's window was cancelled", async () => {
      const { root } = show(acmeServer, fakeShell({ kind: "cancelled" }).shell);
      await press(root, "Run with Claude");
      await pressFocused(root, "Run with Claude");
      expect(document.activeElement).toBe(button(root, "Run with Claude"));
      expect(root.querySelector('[role="status"]')?.textContent).toBe("Nothing was started.");
    });

    it("keeps focus on Run with Claude and says a refusal as an alert", async () => {
      const { root } = show(
        acmeServer,
        fakeShell({ kind: "refused", reason: "the brief is over 8 KB" }).shell,
      );
      await press(root, "Run with Claude");
      await pressFocused(root, "Run with Claude");
      expect(document.activeElement).toBe(button(root, "Run with Claude"));
      expect(root.querySelector('[role="alert"]')?.textContent).toBe(
        "Halonic didn't start it: the brief is over 8 KB.",
      );
      expect(root.querySelector('[role="status"]')?.textContent).toBe("");
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
