// @vitest-environment jsdom
import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StepperView } from "../stepper-view.ts";
import {
  inStage,
  recordingActions,
  routineRequest,
} from "../test-support/acme-requests.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ActionStepper } from "./action-stepper.tsx";

afterEach(unmountAll);

function show(view: StepperView, actions = recordingActions()) {
  const openExternal = vi.fn(async () => {});
  const root = render(
    <OpenExternalProvider openExternal={openExternal}>
      <ActionStepper view={view} actions={actions} />
    </OpenExternalProvider>,
  );
  return { root, actions, openExternal };
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

verifies("action-steppers.review", () => {
  describe("the review", () => {
    it("shows the account, the target, the risk, the expiry and who asked", () => {
      const { root } = show(routineRequest());
      expect(root.querySelector("h2")?.textContent).toBe(
        "Re-run the failed jobs of run 123456 on acme/app",
      );
      expect(fact(root, "Signed in as")).toBe("acme-admin");
      expect(fact(root, "Changes")).toBe("acme/app");
      expect(fact(root, "Risk")).toBe("Routine");
      expect(fact(root, "Expires")).toBe("24 Nov at 14:05");
      expect(fact(root, "Asked by")).toBe("Chief (agent)");
    });

    it("focuses the title when it opens, never a button", () => {
      const { root } = show(routineRequest());
      expect(document.activeElement).toBe(root.querySelector("h2"));
    });

    it("lists each step in plain words with its risk", () => {
      const { root } = show(routineRequest());
      const steps = [...root.querySelectorAll("ol > li")].map((li) => li.textContent);
      expect(steps[1]).toBe("Step 2 of 3RoutineRe-runs the failed jobs of run 123456");
    });

    it("shows the reason as quoted plain text, never as Markdown or a link", () => {
      const reason = "Please [link](https://acme.example) and **hurry**";
      const { root } = show(routineRequest({ reason }));
      const quote = root.querySelector("blockquote");
      expect(quote?.textContent).toBe(reason);
      expect(quote?.querySelector("a, strong")).toBeNull();
      expect(root.querySelector('a[href="https://acme.example"]')).toBeNull();
    });

    it("says a request from a link has an unknown sender", () => {
      const { root } = show(routineRequest({ requester: { kind: "link" } }));
      expect(fact(root, "Asked by")).toBe("From a link, sender unknown");
      expect(root.textContent).not.toContain("Chief");
    });

    it("shows each call's method, address and body under Show the request", () => {
      const { root } = show(routineRequest());
      const fold = root.querySelector("details");
      expect(fold?.querySelector("summary")?.textContent).toContain("Show the request");
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
    it("shows GitHub's device code and opens GitHub's page, with no way to run yet", async () => {
      const view = inStage(
        {
          kind: "sign-in",
          signIn: {
            service: "github",
            code: "WDJBMJHT",
            address: "https://github.com/login/device",
          },
        },
        { account: null },
      );
      const { root, openExternal } = show(view);
      expect(fact(root, "Signed in as")).toBe("Not signed in");
      expect(root.textContent).toContain("Sign in to GitHub");
      expect(root.textContent).toContain("WDJB");
      expect(root.textContent).toContain("Waiting for you to finish on GitHub…");
      const link = [...root.querySelectorAll("a")].find((a) =>
        a.textContent?.startsWith("Open GitHub"),
      );
      await act(async () => link?.click());
      expect(openExternal).toHaveBeenCalledWith("https://github.com/login/device");
      expect(root.textContent).not.toContain("Run step");
      expect(button(root, "Decline")).toBeDefined();
    });

    it("lists Cloudflare's permissions and hands the pasted token over as a secret", async () => {
      const view = inStage(
        {
          kind: "sign-in",
          signIn: {
            service: "cloudflare",
            permissions: ["Zone · DNS · Edit, on zone acme.example only"],
            tokenPage: "https://dash.cloudflare.com/profile/api-tokens",
          },
        },
        { service: "cloudflare", account: null },
      );
      const { root, actions } = show(view);
      expect(root.querySelector("li")?.textContent).toBe(
        "Zone · DNS · Edit, on zone acme.example only",
      );
      const field = root.querySelector<HTMLInputElement>('input[type="password"]');
      if (field === null) throw new Error("no token field");
      await act(async () => button(root, "Save token").click());
      expect(root.textContent).toContain("Paste the token first.");
      expect(actions.calls).toEqual([]);
      await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setValue?.call(field, "acme-token-123");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => button(root, "Save token").click());
      expect(actions.calls).toEqual(["token acme-token-123"]);
      expect(field.value).toBe("");
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
