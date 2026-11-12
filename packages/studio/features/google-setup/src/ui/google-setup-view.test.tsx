// @vitest-environment jsdom
import type { SetupViewProps } from "@halonicjs/studio-feature-inbox/api";
import { loadView } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { account, atlas, fakeAccounts, ledger, record } from "../accounts.test-helper.ts";
import type { GoogleSetupAccount } from "../api.ts";
import { googleSetupSource } from "../google-setup-source.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { GoogleSetupView } from "./google-setup-view.tsx";

afterEach(unmountAll);

const item = {
  kind: "setup",
  key: "setup:google:gaccount_1",
  provider: "google",
  account: "gaccount_1",
  title: "Set up Google for x@example.com",
  progress: "Step 3 of 7 · Consent screen",
  changedAt: "2026-11-12T02:10:00.000Z",
} as const;

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function open(accounts: readonly GoogleSetupAccount[], answering = true) {
  const fake = fakeAccounts(accounts);
  const close = vi.fn();
  const container = render(
    <GoogleSetupView item={item} answering={answering} close={close} accounts={fake.source} />,
  );
  await settled();
  return { fake, close, container };
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) => b.textContent === name);
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
  await settled();
}

const twoDone = record(["project", "apis"], {
  projectId: "halonic-x",
  inProductionTickedAt: "2026-11-12T02:10:00.000Z",
});

/** The checklist's own items, not the lists of actions inside a step. */
function steps(container: HTMLElement): HTMLElement[] {
  return [...(container.querySelector("section > ol") as HTMLElement).children] as HTMLElement[];
}

verifies("google-setup.account-header", () => {
  it("heads the item with the address, the step and the two lines", async () => {
    const { container } = await open([account(twoDone, { services: [ledger, atlas] })]);
    const text = container.textContent ?? "";
    expect(container.querySelector("h2")?.textContent).toBe("Google for x@example.com");
    expect(text).toContain("Step 3 of 7");
    expect(text).toContain("For Ledger and Atlas");
    expect(text).toContain("Personal Google account");
    expect(text).toContain("Uses your own Google app, on this computer.");
  });

  it("asks what kind of account it is, with no step listed, for an address it can't tell", async () => {
    const { container } = await open([account(record([]), { askAccountType: true })]);
    const group = container.querySelector('[role="radiogroup"]');
    expect(container.textContent).toContain("What kind of Google account is x@example.com?");
    expect(group?.querySelectorAll("input:checked")).toHaveLength(0);
    expect(container.querySelector("ol")).toBeNull();
  });

  it("saves the picked answer at once", async () => {
    const { fake, container } = await open([account(record([]), { askAccountType: true })]);
    const work = [...container.querySelectorAll("input")].find((input) =>
      input.parentElement?.textContent?.includes("Work or school account"),
    );
    await press(work as HTMLElement);
    expect(fake.edits).toEqual([
      { accountRef: "gaccount_1", edit: { kind: "account-type", accountType: "workspace" } },
    ]);
  });

  it("opens the question with the current answer picked when you choose Change", async () => {
    const { container } = await open([account(twoDone)]);
    await press(button(container, "Change"));
    const picked = container.querySelector<HTMLInputElement>('[role="radiogroup"] input:checked');
    expect(picked?.parentElement?.textContent).toContain("Personal Google account");
  });

  it("closes the question with Cancel, saves nothing and returns focus to Change", async () => {
    const { fake, container } = await open([account(twoDone)]);
    await press(button(container, "Change"));
    await press(button(container, "Cancel"));
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(fake.edits).toEqual([]);
    expect(document.activeElement).toBe(button(container, "Change"));
  });

  it("closes the question and returns focus to Change once an answer is saved", async () => {
    const { fake, container } = await open([account(twoDone)]);
    await press(button(container, "Change"));
    const work = [...container.querySelectorAll("input")].find((input) =>
      input.parentElement?.textContent?.includes("Work or school account"),
    );
    await press(work as HTMLElement);
    expect(fake.edits).toHaveLength(1);
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(document.activeElement).toBe(button(container, "Change"));
  });

  it("lists the answers as unavailable, with the reason, while the engine isn't answering", async () => {
    const { fake, container } = await open([account(record([]), { askAccountType: true })], false);
    const inputs = [...container.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input')];
    expect(inputs).toHaveLength(2);
    for (const input of inputs)
      expect(input.getAttribute("aria-disabled") ?? String(input.disabled)).toBe("true");
    expect(container.textContent).toContain("The engine isn't answering.");
    await press(inputs[0] as HTMLElement);
    expect(fake.edits).toEqual([]);
  });

  it("reads the services and the account type as one line, with a comma for a screen reader", async () => {
    const { container } = await open([account(twoDone, { services: [ledger, atlas] })]);
    const line = [...container.querySelectorAll("p")].find((p) =>
      p.textContent?.startsWith("For "),
    );
    expect(line?.querySelector('[aria-hidden="true"]')?.textContent).toBe(" · ");
    expect(line?.querySelector(".sr-only")?.textContent).toBe(", ");
  });

  it("opens a panel with no button when you choose Other ways (later)", async () => {
    const { container } = await open([account(twoDone)]);
    const toggle = button(container, "Other ways (later)");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await press(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Halonic Cloud.");
    expect(container.textContent).not.toMatch(/Gmail|Drive/);
    const panel = toggle.nextElementSibling as HTMLElement;
    expect(panel.querySelector("button")).toBeNull();
  });
});

verifies("google-setup.checklist", () => {
  it("says it couldn't load the setup, with Try again, when the accounts can't be read", async () => {
    const fake = fakeAccounts([account(twoDone)]);
    let reads = 0;
    const accounts = {
      ...fake.source,
      list: async () => {
        reads += 1;
        if (reads === 1) throw new Error("down");
        return [account(twoDone)];
      },
    };
    const container = render(
      <GoogleSetupView item={item} answering close={vi.fn()} accounts={accounts} />,
    );
    await settled();
    expect(container.textContent).toContain("Couldn't load the Google setup");
    expect(container.querySelector('[role="status"]')).toBeNull();
    await press(button(container, "Try again"));
    expect(container.querySelector("ol")).not.toBeNull();
  });

  it("says the account isn't set up here any more when the host doesn't list it", async () => {
    const { container } = await open([]);
    expect(container.textContent).toContain("Couldn't load the Google setup");
    expect(container.textContent).toContain("This Google account isn't set up here any more.");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("folds the finished steps and opens the first one not done, with focus on its title", async () => {
    const { container } = await open([account(twoDone)]);
    const items = steps(container);
    expect(items).toHaveLength(7);
    expect(items[0]?.textContent).toContain("Edit");
    expect(items[1]?.textContent).toContain("Edit");
    expect(items[2]?.textContent).not.toContain("Edit");
    const current = items[2] as HTMLElement;
    expect(current.getAttribute("aria-current")).toBe("step");
    const heading = current.querySelector("h3") as HTMLElement;
    expect(heading.textContent).toContain("Step 3 of 7, current.");
    expect(document.activeElement).toBe(heading);
    expect(items[0]?.textContent).toContain("halonic-x");
    expect(items[3]?.getAttribute("aria-current")).toBeNull();
    expect(items[3]?.querySelector("button")).toBeNull();
  });

  it("saves the step as done when you choose Done, next", async () => {
    const { fake, container } = await open([account(twoDone)]);
    await press(button(container, "Done, next"));
    expect(fake.edits).toEqual([
      { accountRef: "gaccount_1", edit: { kind: "step-done", step: "consent" } },
    ]);
  });

  it("opens the next step and moves focus to its title once the account says step 3 is done", async () => {
    const { fake, container } = await open([account(twoDone)]);
    await act(async () => fake.change([account(record(["project", "apis", "consent"]))]));
    await settled();
    const items = steps(container);
    expect(items[3]?.getAttribute("aria-current")).toBe("step");
    expect(document.activeElement).toBe(items[3]?.querySelector("h3"));
  });

  it("opens a finished step with Edit and moves focus to its title", async () => {
    const { container } = await open([account(twoDone)]);
    const first = steps(container)[0] as HTMLElement;
    await press(first.querySelector("button") as HTMLElement);
    expect(document.activeElement).toBe(first.querySelector("h3"));
    expect(first.textContent).toContain("Done, next");
  });

  it("has no Done, next in a step that finishes by itself", async () => {
    const four = record(["project", "apis", "consent", "scopes"]);
    const { container } = await open([account(four)]);
    expect(button(container, "Not now")).toBeDefined();
    expect(container.textContent).not.toContain("Done, next");
  });

  it("keeps Done, next aria-disabled with its reason while the engine isn't answering", async () => {
    const { fake, container } = await open([account(twoDone)], false);
    const done = button(container, "Done, next");
    expect(done.getAttribute("aria-disabled")).toBe("true");
    const reason = done.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(reason)?.textContent).toBe("The engine isn't answering.");
    await press(done);
    expect(fake.edits).toEqual([]);
  });

  it("shows no reason in a step that has no Done, next, while the engine isn't answering", async () => {
    const four = record(["project", "apis", "consent", "scopes"]);
    const { container } = await open([account(four)], false);
    expect(container.textContent).not.toContain("The engine isn't answering.");
  });

  it("closes the item with Not now", async () => {
    const { close, container } = await open([account(twoDone)]);
    await press(button(container, "Not now"));
    expect(close).toHaveBeenCalledOnce();
  });
});

verifies("google-setup.setup-source", () => {
  it("gives the Inbox a view that reads and saves its own accounts", async () => {
    const fake = fakeAccounts([account(twoDone)]);
    const { view } = googleSetupSource(fake.source);
    const Loaded = await loadView<ComponentType<SetupViewProps>>(view as NonNullable<typeof view>);
    const close = vi.fn();
    const container = render(<Loaded item={item} answering close={close} />);
    await settled();
    await press(button(container, "Done, next"));
    expect(fake.edits).toHaveLength(1);
  });
});
