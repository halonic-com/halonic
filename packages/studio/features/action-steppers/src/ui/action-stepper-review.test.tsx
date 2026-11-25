// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { StepperView } from "../stepper-view.ts";
import {
  browserRequest,
  inStage,
  projectPage,
  recordingActions,
  releaseRequest,
  routineRequest,
} from "../test-support/acme-requests.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ActionStepper } from "./action-stepper.tsx";

afterEach(unmountAll);

function show(view: StepperView) {
  const actions = recordingActions();
  const root = render(<ActionStepper view={view} actions={actions} />);
  return { root, actions };
}

function fact(root: HTMLElement, label: string): string | undefined {
  const term = [...root.querySelectorAll("dt")].find((dt) => dt.textContent === label);
  return term?.nextElementSibling?.textContent ?? undefined;
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

function section(root: HTMLElement, heading: string): HTMLElement | null {
  const found = [...root.querySelectorAll("h3")].find((h) => h.textContent === heading);
  return found?.closest("section") ?? null;
}

verifies("action-steppers.review", () => {
  describe("the review", () => {
    it("shows the account, the risk, the expiry and who asked", () => {
      const { root } = show(routineRequest());
      expect(root.querySelector("h2")?.textContent).toBe(
        "Re-run the failed jobs of run 123456 on acme/app",
      );
      expect(fact(root, "Signed in as")).toBe("acme-admin");
      expect(fact(root, "Risk")).toBe("Routine");
      expect(fact(root, "Expires")).toBe("24 Nov at 14:05");
      expect(fact(root, "Asked by")).toBe("Chief on Paperclip · Acme");
    });

    it("lists every target and page the stepper touches, first", () => {
      const { root } = show(browserRequest());
      const touches = section(root, "This stepper touches");
      expect([...(touches?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual([
        "Google Cloud: project acme-prod",
        `Opens ${projectPage}`,
      ]);
      expect(touches?.compareDocumentPosition(root.querySelector("dl") as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it("focuses the title when it opens, never a button", () => {
      const { root } = show(routineRequest());
      expect(document.activeElement).toBe(root.querySelector("h2"));
    });

    it("leaves focus where it is when it opens with focusOnOpen off, as a later card in a bundle", () => {
      const before = document.activeElement;
      const root = render(
        <ActionStepper view={routineRequest()} actions={recordingActions()} focusOnOpen={false} />,
      );
      expect(document.activeElement).not.toBe(root.querySelector("h2"));
      expect(document.activeElement).toBe(before);
    });

    it("lists each step in plain words with its risk", () => {
      const { root } = show(routineRequest());
      const step = section(root, "Steps")?.querySelectorAll(":scope > ol > li")[1];
      expect(step?.textContent).toContain(
        "Step 2 of 3RoutineRe-runs the failed jobs of run 123456",
      );
    });

    it("warns under the facts about a step that can't be undone, while it can still run", () => {
      const { root } = show(releaseRequest());
      const warning = [...root.querySelectorAll("p")].find(
        (p) => p.textContent === "Step 2 can't be undone",
      )?.parentElement;
      expect(warning?.textContent).toContain("Approves the deployment of acme/app to release");
      expect(root.querySelector("dl")?.compareDocumentPosition(warning as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(warning?.compareDocumentPosition(section(root, "Steps") as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      const declined = show(releaseRequest({ stage: { kind: "declined" } }));
      expect(declined.root.textContent).not.toContain("can't be undone");
    });

    it("shows the reason as quoted plain text, never as Markdown or a link", () => {
      const reason = "Please [link](https://acme.example) and **hurry**";
      const { root } = show(routineRequest({ reason }));
      const quote = root.querySelector("blockquote");
      expect(quote?.textContent).toBe(reason);
      expect(quote?.querySelector("a, strong")).toBeNull();
      expect(root.querySelector('a[href="https://acme.example"]')).toBeNull();
    });

    it("shows each call's method, address and body under Show the request", () => {
      const { root } = show(routineRequest());
      const fold = [...root.querySelectorAll("details")].find((details) =>
        details.querySelector("summary")?.textContent?.includes("Show the request"),
      );
      const calls = [...(fold?.querySelectorAll("pre") ?? [])].map((pre) => pre.textContent);
      expect(calls[0]).toBe("GET https://api.github.com/repos/acme/app/actions/runs/123456/step-1");
      expect(calls[1]).toBe(
        'POST https://api.github.com/repos/acme/app/actions/runs/123456/step-2\n\n{\n  "state": "approved"\n}',
      );
    });
  });
});

verifies("action-steppers.sign-in", () => {
  describe("sign-in", () => {
    const github = (code: string | null) =>
      inStage({ kind: "sign-in", signIn: { service: "github", code } }, { account: null });

    it("starts GitHub's sign-in only from a click, with no way to run yet", async () => {
      const { root, actions } = show(github(null));
      expect(fact(root, "Signed in as")).toBe("Not signed in");
      expect(actions.calls).toEqual([]);
      await act(async () => button(root, "Sign in to GitHub").click());
      expect(actions.calls).toEqual(["sign in"]);
      expect(root.textContent).not.toContain("Run step");
      expect(button(root, "Decline")).toBeDefined();
    });

    it("then shows GitHub's device code while it waits", () => {
      const { root } = show(github("WDJBMJHT"));
      expect(root.textContent).toContain("Enter this code on the GitHub page that opened.");
      expect(root.textContent).toContain("WDJB");
      expect(root.textContent).toContain("Waiting for you to finish on GitHub…");
    });

    it("lists Cloudflare's permissions and takes the token in the secure field", async () => {
      const permission = "Zone · DNS · Edit, on zone acme.example only";
      const view = inStage(
        { kind: "sign-in", signIn: { service: "cloudflare", permissions: [permission] } },
        { service: "cloudflare", account: null },
      );
      const { root, actions } = show(view);
      expect(section(root, "Add a Cloudflare API token")?.querySelector("li")?.textContent).toBe(
        permission,
      );
      expect(root.querySelector("input")).toBeNull();
      await act(async () => button(root, "Paste the token").click());
      expect(actions.calls).toEqual(["sign in"]);
    });

    it("names the missing permission and offers to sign in again", async () => {
      const view = inStage({ kind: "missing-permission", permission: "Administration (write)" });
      const { root, actions } = show(view);
      expect(root.textContent).toContain(
        "acme-admin doesn't have the permission “Administration (write)”, which this request needs.",
      );
      await act(async () => button(root, "Sign in again").click());
      expect(actions.calls).toEqual(["sign in again"]);
    });
  });
});
