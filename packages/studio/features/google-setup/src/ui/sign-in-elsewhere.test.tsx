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
const command = "halonic google sign-in gaccount_1";

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

  it("names the command with the record's ref, never the address, and copies it", async () => {
    const { container } = await open(signedOut(), {
      signInEntry: { kind: "elsewhere", commandExists: true },
    });
    expect(container.textContent).toContain(`${sentence} there, or run ${command}`);
    expect(container.textContent).toContain("on it.");
    expect(container.querySelector("code")?.textContent).toBe(command);
    expect(container.querySelector("code")?.closest("p")?.textContent).not.toContain("example.com");
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
    expect(container.textContent).toContain(`${sentence} there, or run ${command} on it.`);
    expect(container.textContent).not.toContain("Continue on a computer.");
    expect(container.querySelectorAll("button, input, a")).toHaveLength(0);
  });

  it("shows a served window the read-only layout in its own words, with Copy", async () => {
    const fake = fakeAccounts([signedOut()], {
      signInEntry: { kind: "elsewhere", commandExists: true },
    });
    const container = render(
      <GoogleSetupView
        item={item}
        answering
        close={vi.fn()}
        accounts={{ ...fake.source, readOnly: true }}
      />,
    );
    await settle();
    const text = container.textContent ?? "";
    expect(text).toContain(
      "This window only shows the setup. Finish it on the computer running Halonic.",
    );
    expect(text).not.toContain("hard to use on a phone");
    expect(text).toContain(`${sentence} there, or run ${command} on it.`);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector(`button[aria-label="Copy the command"]`)).not.toBeNull();
  });

  it("moves focus to the title as it opens, served or on a phone", async () => {
    const fake = fakeAccounts([signedOut()], {
      signInEntry: { kind: "elsewhere", commandExists: true },
    });
    for (const layout of ["served", "phone"] as const) {
      const view = (
        <GoogleSetupView
          item={item}
          answering
          close={vi.fn()}
          accounts={layout === "served" ? { ...fake.source, readOnly: true } : fake.source}
        />
      );
      const container = render(
        layout === "phone" ? (
          <PresentationProvider presentation="phone">{view}</PresentationProvider>
        ) : (
          view
        ),
      );
      await settle();
      const title = container.querySelector("#google-setup-phone-title");
      expect(title?.textContent).toMatch(/^Google for /);
      expect(document.activeElement).toBe(title);
      expect(title?.getAttribute("tabindex")).toBe("-1");
      expect(title?.className).toContain("focus-ring");
      unmountAll();
    }
  });

  it("lets the title and the command wrap on a narrow window", async () => {
    const fake = fakeAccounts([signedOut()], {
      signInEntry: { kind: "elsewhere", commandExists: true },
    });
    const container = render(
      <GoogleSetupView
        item={item}
        answering
        close={vi.fn()}
        accounts={{ ...fake.source, readOnly: true }}
      />,
    );
    await settle();
    // An address has no spaces, so the title may break inside it; the command breaks at its spaces first.
    expect(container.querySelector("#google-setup-phone-title")?.className).toContain(
      "wrap-anywhere",
    );
    const code = container.querySelector("code");
    expect(code?.className).toContain("wrap-anywhere");
    expect(code?.className).not.toContain("break-all");
  });
});
