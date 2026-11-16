// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import {
  createToastStore,
  PresentationProvider,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { account, atlas, desktopEntry, ledger, record } from "../accounts.test-helper.ts";
import type { DisconnectAnswer, GoogleSetupAccount, SecretEntry } from "../api.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { GoogleConnectorBlock } from "./connector-block.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const at = "2026-11-12T02:10:00.000Z";
const signedIn = record(["project", "apis"], {
  projectId: "halonic-x",
  clientId: "1234-abc.apps.googleusercontent.com",
  clientSecret: { clientRef: "gclient_1", savedAt: at },
  lastSignInAt: at,
});
const fresh = account(record([]));
// A fake secret the host holds: it must never reach the block's text.
const fakeSecret = "GOCSPX-fake-1111";

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) => b.textContent === name);
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
}

/**
 * A button in the open question, found by its text. The confirm button also holds its busy label,
 * so the text only has to start with the name.
 */
function questionButton(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...(dialog(container)?.querySelectorAll("button") ?? [])].find((b) =>
    b.textContent?.startsWith(name),
  );
  if (found === undefined) throw new Error(`No button "${name}" in the question`);
  return found;
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
  await settled();
}

function dialog(container: HTMLElement): HTMLElement | null {
  return container.querySelector("dialog[open]");
}

/** A page that holds the account as a host would, so a disconnect shows its new state. */
function Page(props: {
  readonly initial: GoogleSetupAccount;
  readonly answer: () => Promise<DisconnectAnswer>;
  readonly answering?: boolean;
  readonly entry?: SecretEntry;
  readonly open: (ref: string) => void;
  readonly children?: ReactNode;
}) {
  const [current, setCurrent] = useState(props.initial);
  return (
    <GoogleConnectorBlock
      account={current}
      secretEntry={props.entry ?? desktopEntry}
      answering={props.answering ?? true}
      onOpenSetup={props.open}
      onDisconnect={async () => {
        const answer = await props.answer();
        setCurrent(fresh);
        return answer;
      }}
    />
  );
}

async function show(
  initial: GoogleSetupAccount,
  options: {
    answer?: () => Promise<DisconnectAnswer>;
    answering?: boolean;
    entry?: SecretEntry;
    phone?: boolean;
  } = {},
) {
  const toasts: ToastStore = createToastStore();
  const open = vi.fn();
  const answer = vi.fn(options.answer ?? (async () => ({ kind: "ended" }) as const));
  const page = (
    <ToastStoreProvider store={toasts}>
      <Page
        initial={initial}
        answer={answer}
        {...(options.answering === undefined ? {} : { answering: options.answering })}
        {...(options.entry === undefined ? {} : { entry: options.entry })}
        open={open}
      />
    </ToastStoreProvider>
  );
  const container = render(
    options.phone ? <PresentationProvider presentation="phone">{page}</PresentationProvider> : page,
  );
  await settled();
  return { container, toasts, open, answer };
}

verifies("google-setup.connector-block", () => {
  it("offers Set up, and no rows, before the account signed in or saved a secret", async () => {
    const { container, open } = await show(fresh);
    expect(container.textContent).toContain("x@example.com isn't signed in to Google yet.");
    expect(container.querySelector("dl")).toBeNull();
    await press(button(container, "Set up"));
    expect(open).toHaveBeenCalledWith("gaccount_1");
  });

  it("shows the rows, the state chip and the services after setup", async () => {
    const { container } = await show(account(signedIn, { services: [ledger, atlas] }));
    const text = container.textContent ?? "";
    expect(text).toContain("Connected");
    expect(text).toContain("How it connects");
    expect(text).toContain("x@example.com · 12 Nov, 02:10");
    expect(text).toContain("Your own Google app, on this computer");
    expect(text).toContain("Personal Google account");
    expect(text).toContain("halonic-x");
    expect(text).toContain("1234-abc.apps.googleusercontent.com");
    expect(text).toContain("Saved · 12 Nov, 02:10");
    expect(text).toContain("Kept encrypted on this computer. Halonic can't show it.");
    expect(text).toContain("LedgerAtlas");
    expect(container.querySelector("a")?.getAttribute("href")).toContain("project=halonic-x");
    expect(container.querySelector('[aria-label="Copy the client ID"]')).not.toBeNull();
  });

  it("names the computer that runs Halonic when the secret is kept there", async () => {
    const { container } = await show(account(signedIn), {
      entry: { kind: "field", keptOn: "host-computer", plainHttp: false },
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Your own Google app, on the computer that runs Halonic");
    expect(text).toContain("Kept encrypted on the computer that runs Halonic.");
    expect(text).not.toContain("on this computer");
  });

  it("opens the setup item from Sign in again and Replace secret", async () => {
    const { container, open } = await show(account(signedIn));
    await press(button(container, "Sign in again"));
    await press(button(container, "Replace secret"));
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("says which accounts use a shared client", async () => {
    const { container } = await show(account(signedIn, { clientSharedWith: ["y@example.com"] }));
    expect(container.textContent).toContain("Used by x@example.com and y@example.com");
  });

  it("never holds a secret or says it is removed from this computer", async () => {
    const { container } = await show(account(signedIn));
    await press(button(container, "Disconnect Google…"));
    const text = `${container.textContent}${dialog(container)?.textContent}`;
    expect(text).not.toContain(fakeSecret);
    expect(text).not.toContain("removed from this computer");
  });

  it("asks first, naming the ticked services, with Cancel in focus", async () => {
    const { container, answer } = await show(account(signedIn, { services: [ledger, atlas] }));
    await press(button(container, "Disconnect Google…"));
    const text = dialog(container)?.textContent ?? "";
    expect(text).toContain("Disconnect x@example.com?");
    expect(text).toContain(
      "Halonic asks Google to end this sign-in, deletes the saved client secret and sign-in, and stops using them. Ledger and Atlas stop working. Your Google Cloud project stays as it is.",
    );
    expect(document.activeElement?.textContent).toBe("Cancel");
    expect(answer).not.toHaveBeenCalled();
  });

  it("keeps the client secret in the question when another account uses the client", async () => {
    const { container } = await show(account(signedIn, { clientSharedWith: ["y@example.com"] }));
    await press(button(container, "Disconnect Google…"));
    expect(dialog(container)?.textContent).toContain(
      "Halonic asks Google to end this sign-in, deletes it and stops using it. The client secret stays, because y@example.com uses it.",
    );
  });

  it("returns focus to the button when you choose Cancel", async () => {
    const { container, answer } = await show(account(signedIn));
    const trigger = button(container, "Disconnect Google…");
    trigger.focus();
    await press(trigger);
    await press(questionButton(container, "Cancel"));
    expect(dialog(container)).toBeNull();
    expect(answer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("disconnects, toasts, and puts focus on Set up", async () => {
    const { container, toasts, answer } = await show(account(signedIn));
    await press(button(container, "Disconnect Google…"));
    await press(questionButton(container, "Disconnect"));
    expect(answer).toHaveBeenCalledOnce();
    expect(dialog(container)).toBeNull();
    expect(toasts.list().map(({ tone, title }) => ({ tone, title }))).toEqual([
      { tone: "success", title: "Disconnected x@example.com" },
    ]);
    expect(document.activeElement?.textContent).toBe("Set up");
  });

  it("says Google couldn't be reached, and links to the Google account", async () => {
    const { container, toasts } = await show(account(signedIn), {
      answer: async () => ({ kind: "google-unreachable" }),
    });
    await press(button(container, "Disconnect Google…"));
    await press(questionButton(container, "Disconnect"));
    const [toast] = toasts.list();
    expect(toast?.tone).toBe("warning");
    expect(toast?.text).toBe(
      "Google couldn't be reached to end the sign-in. You can remove access in your Google account.",
    );
    expect(toast?.action?.label).toBe("Open Google account");
  });

  it("keeps the question open and says so when the host can't disconnect", async () => {
    const { container, toasts } = await show(account(signedIn), {
      answer: async () => {
        throw new KindedError("unavailable", "The engine isn't answering.");
      },
    });
    await press(button(container, "Disconnect Google…"));
    await press(questionButton(container, "Disconnect"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(dialog(container)?.textContent).toContain(
      "Couldn't disconnect: the engine isn't answering.",
    );
    expect(toasts.list()).toEqual([]);
  });

  it("doesn't bring an old error back when you cancel and ask again", async () => {
    const { container } = await show(account(signedIn), {
      answer: async () => {
        throw new KindedError("unavailable", "The engine isn't answering.");
      },
    });
    await press(button(container, "Disconnect Google…"));
    await press(questionButton(container, "Disconnect"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(dialog(container)?.textContent).toContain("Couldn't disconnect");
    await press(questionButton(container, "Cancel"));
    await press(button(container, "Disconnect Google…"));
    expect(dialog(container)?.textContent).not.toContain("Couldn't disconnect");
  });

  it("makes Disconnect unavailable, with its reason, while the engine isn't answering", async () => {
    const { container, answer } = await show(account(signedIn), { answering: false });
    const trigger = button(container, "Disconnect Google…");
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(container.textContent).toContain("The engine isn't answering.");
    await press(trigger);
    expect(dialog(container)).toBeNull();
    expect(answer).not.toHaveBeenCalled();
  });

  it("is text only on a phone", async () => {
    const { container } = await show(account(signedIn), { phone: true });
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.textContent).toContain(
      "View only on a phone. Change connectors and sending on your computer.",
    );
    expect(container.textContent).not.toContain("Disconnect Google…");
  });
});
