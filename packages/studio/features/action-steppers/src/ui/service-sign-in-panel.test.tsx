// @vitest-environment jsdom
import { ClipboardProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordingActions } from "../test-support/acme-requests.test-helper.ts";
import { signInView } from "../test-support/acme-sign-in.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ActionStepper } from "./action-stepper.tsx";
import { ServiceSignInPanel } from "./service-sign-in-panel.tsx";

const startedAt = Date.parse("2026-11-26T12:00:00.000Z");

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
  vi.useRealTimers();
});

verifies("action-steppers.paperclip-sign-in-run", () => {
  describe("the Paperclip sign-in panel", () => {
    it("shows the code and counts the 10 minutes down until the time is up", () => {
      vi.useFakeTimers({ now: startedAt });
      const expiresAt = new Date(startedAt + 10 * 60 * 1000);
      const panel = render(
        <ServiceSignInPanel
          signIn={{ code: "acme code", expiresAt, kept: false, account: null }}
        />,
      );
      expect(panel.textContent).toContain("Code: acme code");
      expect(panel.textContent).toContain(
        "On the approval page, check the code matches this one, then click Approve.",
      );
      expect(panel.textContent).toContain("10:00 left to approve");
      act(() => vi.advanceTimersByTime(61_000));
      expect(panel.textContent).toContain("8:59 left to approve");
      act(() => vi.advanceTimersByTime(9 * 60 * 1000));
      expect(panel.textContent).toContain("The time to approve is up.");
    });

    it("stops the countdown and says who is signed in once the key is kept", () => {
      const panel = render(
        <ServiceSignInPanel
          signIn={{ code: "acme code", expiresAt: new Date(), kept: true, account: "Acme Board" }}
        />,
      );
      expect(panel.textContent).toContain("Signed in as Acme Board.");
      expect(panel.textContent).not.toContain("left to approve");
    });

    it("shows the panel in the stepper and runs each part from the run bar", () => {
      const expiresAt = new Date(startedAt + 10 * 60 * 1000);
      const signIn = { code: "acme-code-1", expiresAt, kept: false, account: null };
      const actions = recordingActions();
      const stepper = render(
        <ClipboardProvider writeClipboard={async () => true}>
          <ActionStepper view={signInView(signIn, new Date(startedAt))} actions={actions} />
        </ClipboardProvider>,
      );
      expect(stepper.textContent).toContain("Code: acme-code-1");
      const button = [...stepper.querySelectorAll("button")].find(
        // Its busy words are in the button too, hidden until it runs.
        (each) => each.textContent?.startsWith("Run step 2 of 4"),
      );
      act(() => button?.click());
      expect(actions.calls).toEqual(["run 2"]);
    });
  });
});
