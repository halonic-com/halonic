// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeAccounts } from "../accounts.test-helper.ts";
import { driveClock, item, open, settle, signedOut } from "../sign-in-view.test-helper.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { GoogleSetupView } from "./google-setup-view.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  driveClock((ms) => vi.advanceTimersByTimeAsync(ms));
});
afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const sentence = "Google sends the sign-in back to the computer running Halonic. Finish this step";
const command = "halonic google sign-in x@example.com";

function buttons(container: HTMLElement): string[] {
  return [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");
}

verifies("google-setup.sign-in-elsewhere", () => {
  it("has no sign-in button and ends after 'there.' when the host has no command", async () => {
    const { container } = await open(signedOut(), {
      signInEntry: { kind: "elsewhere", commandExists: false },
    });
    const text = container.textContent ?? "";
    expect(text).toContain(`${sentence} there.`);
    expect(text).not.toContain("halonic google sign-in");
    expect(buttons(container).filter((name) => /Sign in|Open again|Cancel/.test(name))).toEqual([]);
  });

  it("names the command with the connector's address and copies it", async () => {
    const { container } = await open(signedOut(), {
      signInEntry: { kind: "elsewhere", commandExists: true },
    });
    expect(container.textContent).toContain(`${sentence} there, or run${command}`);
    expect(container.textContent).toContain("on it.");
    expect(container.querySelector("code")?.textContent).toBe(command);
    expect(container.querySelector(`button[aria-label="Copy the command"]`)).not.toBeNull();
  });

  it("keeps Sign in with Google where the sign-in is here", async () => {
    const { container } = await open(signedOut());
    expect(container.textContent).not.toContain(sentence);
    expect(buttons(container).some((name) => name.startsWith("Sign in with Google"))).toBe(true);
  });

  it("shows the command as text on a phone, with no button", async () => {
    const fake = fakeAccounts([signedOut()], {
      signInEntry: { kind: "elsewhere", commandExists: true },
    });
    const container = render(
      <PresentationProvider presentation="phone">
        <GoogleSetupView item={item} answering close={vi.fn()} accounts={fake.source} />
      </PresentationProvider>,
    );
    await settle();
    expect(container.textContent).toContain(`${sentence} there, or run${command}on it.`);
    expect(container.textContent).not.toContain("Continue on a computer.");
    expect(container.querySelectorAll("button, input, a")).toHaveLength(0);
  });
});
