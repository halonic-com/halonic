// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { dialogOf, fakeDialogPage, fire, nameOf, restoreDialogPage } from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { BlockingDialog } from "./blocking-dialog.tsx";
import { SignInBand, SignInModal, type SignInRowItem } from "./sign-in-prompt.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

function row(name: string, overrides: Partial<SignInRowItem> = {}): SignInRowItem {
  return {
    key: `paperclip/${name}`,
    provider: "Paperclip",
    logo: "paperclip.svg",
    purpose: "your agents",
    name,
    progress: { kind: "idle" },
    ...overrides,
  };
}

function buttons(root: ParentNode): string[] {
  return [...root.querySelectorAll("button")].map(nameOf);
}

verifies("kit.blocking-dialog", () => {
  it("opens as a named modal that Escape, the overlay and a browser close don't close", async () => {
    const { container } = render(
      <BlockingDialog
        title="Sign in to Paperclip"
        description="Inbox needs your Paperclip sign-in."
      >
        <p>Row</p>
      </BlockingDialog>,
    );
    const dialog = dialogOf(container);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const title = document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent).toBe("Sign in to Paperclip");
    expect(document.activeElement).toBe(title);
    expect(buttons(dialog)).toEqual([]);

    const escapeKey = fire(dialog, new Event("cancel", { cancelable: true }));
    expect(escapeKey.defaultPrevented).toBe(true);
    fire(dialog, new MouseEvent("pointerdown", { bubbles: true }));
    fire(dialog, new MouseEvent("click", { bubbles: true }));
    expect(dialog.open).toBe(true);

    await act(async () => {
      dialog.close();
      await Promise.resolve();
    });
    expect(dialog.open).toBe(true);
  });
});

verifies("kit.sign-in-prompt", () => {
  it("names one sign-in in the title and puts focus on its Sign in", () => {
    const { container } = render(
      <SignInModal app="Inbox" signIns={[row("Acme team")]} onSignIn={() => undefined} />,
    );
    const dialog = dialogOf(container);
    expect(dialog.querySelector("h2")?.textContent).toBe("Sign in to Paperclip");
    expect(dialog.textContent).toContain("Inbox needs your Paperclip sign-in to work.");
    expect(dialog.querySelector("img")?.getAttribute("alt")).toBe("Paperclip");
    expect(nameOf(document.activeElement ?? document.body)).toBe("Sign in: Paperclip, Acme team");
  });

  it("lists more than one sign-in, each with its own button", async () => {
    const onSignIn = vi.fn();
    const { container } = render(
      <SignInModal app="Messenger" signIns={[row("Acme team"), row("Zeta")]} onSignIn={onSignIn} />,
    );
    const dialog = dialogOf(container);
    expect(dialog.querySelector("h2")?.textContent).toBe("Sign in to keep working");
    expect(dialog.textContent).toContain("Messenger needs these sign-ins to work.");
    expect(buttons(dialog)).toEqual(["Sign in: Paperclip, Acme team", "Sign in: Paperclip, Zeta"]);
    const zeta = dialog.querySelectorAll("button")[1];
    if (zeta !== undefined) {
      await click(zeta);
    }
    expect(onSignIn).toHaveBeenCalledWith("paperclip/Zeta");
  });

  it("shows the waiting line with the phrase, and a failed sign-in as an alert", () => {
    const { container } = render(
      <SignInModal
        app="Inbox"
        signIns={[
          row("Acme team", { progress: { kind: "waiting", phrase: "blue-otter" } }),
          row("Zeta", { progress: { kind: "failed" } }),
        ]}
        onSignIn={() => undefined}
      />,
    );
    const dialog = dialogOf(container);
    expect(dialog.querySelector('[role="status"]')?.textContent).toBe(
      "Approve the sign-in in your browser. Check that it shows: blue-otter",
    );
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe(
      "That sign-in didn't finish. Try again.",
    );
  });

  it("keeps the waiting line's status region mounted and ties it to the Sign in button", () => {
    const idle = row("Acme team");
    const { container, rerender } = render(
      <SignInModal app="Inbox" signIns={[idle]} onSignIn={() => undefined} />,
    );
    const dialog = dialogOf(container);
    const status = dialog.querySelector('[role="status"]');
    expect(status?.textContent).toBe("");
    const signIn = dialog.querySelector("button");
    expect(signIn?.getAttribute("aria-describedby")).toBe(status?.id);

    rerender(
      <SignInModal
        app="Inbox"
        signIns={[{ ...idle, progress: { kind: "waiting", phrase: "blue-otter" } }]}
        onSignIn={() => undefined}
      />,
    );
    expect(dialog.querySelector('[role="status"]')).toBe(status);
    const waitingText = "Approve the sign-in in your browser. Check that it shows: blue-otter";
    expect(status?.textContent).toBe(waitingText);
    const describedBy = dialog.querySelector("button")?.getAttribute("aria-describedby") ?? "";
    const description = describedBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(description).toBe(waitingText);
  });

  it("draws the band without a dismiss button, and Try again when a state couldn't be read", async () => {
    const onTryAgain = vi.fn();
    const google = row("ada@acme.test", { key: "google/me", provider: "Google", purpose: "Gmail" });
    const { container } = render(
      <SignInBand
        signIns={[google]}
        unreadable
        onSignIn={() => undefined}
        onTryAgain={onTryAgain}
      />,
    );
    expect(container.textContent).toContain("Sign in to Google to use Gmail.");
    expect(container.textContent).toContain("Couldn't check your sign-ins.");
    expect(buttons(container)).toEqual(["Sign in: Google, ada@acme.test", "Try again"]);
    const tryAgain = container.querySelectorAll("button")[1];
    if (tryAgain !== undefined) {
      await click(tryAgain);
    }
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it("shows the provider's first letter when it has no logo file", () => {
    const { container } = render(
      <SignInModal
        app="Inbox"
        signIns={[row("Acme team", { logo: undefined })]}
        onSignIn={() => undefined}
      />,
    );
    const dialog = dialogOf(container);
    expect(dialog.querySelector("img")).toBeNull();
    expect(dialog.querySelector('[aria-hidden="true"]')?.textContent).toBe("P");
  });

  it("draws no band while there is nothing to say", () => {
    const { container } = render(
      <SignInBand
        signIns={[]}
        unreadable={false}
        onSignIn={() => undefined}
        onTryAgain={() => undefined}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
