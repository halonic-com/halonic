// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { account, atlas, fakeAccounts, ledger, record } from "../accounts.test-helper.ts";
import type { GoogleSetupAccount } from "../api.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { GoogleSetupView } from "./google-setup-view.tsx";

afterEach(unmountAll);

const item = {
  kind: "setup",
  key: "setup:google:gaccount_1",
  provider: "google",
  account: "gaccount_1",
  title: "Set up Google for x@example.com",
  progress: "Step 1 of 7 · Project",
  changedAt: "2026-11-12T02:10:00.000Z",
} as const;

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function open(setup: GoogleSetupAccount) {
  const fake = fakeAccounts([setup]);
  const container = render(
    <GoogleSetupView item={item} answering close={vi.fn()} accounts={fake.source} />,
  );
  await settled();
  return { fake, container };
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith(name),
  );
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
  await settled();
}

async function type(input: HTMLInputElement, text: string): Promise<void> {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const ticked = "2026-11-12T02:10:00.000Z";

verifies("google-setup.step-bodies", () => {
  it("shows step 1 with its link, the project name to copy and the Project ID field", async () => {
    const { container } = await open(account(record([])));
    expect(
      container.querySelector('a[href^="https://console.cloud.google.com/projectcreate"]'),
    ).not.toBeNull();
    expect(button(container, "Copy").getAttribute("aria-label")).toBe("Copy the project name");
    expect(container.textContent).toContain("halonic");
    expect(container.textContent).toContain(
      "Optional. With it, the links below open in this project.",
    );
  });

  it("saves a valid project ID before it ticks step 1", async () => {
    const { fake, container } = await open(account(record([])));
    await type(container.querySelector("input") as HTMLInputElement, "halonic-x1");
    await press(button(container, "Done, next"));
    expect(fake.edits.map((entry) => entry.edit)).toEqual([
      { kind: "project-id", projectId: "halonic-x1" },
      { kind: "step-done", step: "project" },
    ]);
  });

  it("refuses an invalid project ID and says what one looks like", async () => {
    const { fake, container } = await open(account(record([])));
    await type(container.querySelector("input") as HTMLInputElement, "Halonic X");
    await press(button(container, "Done, next"));
    expect(fake.edits).toEqual([]);
    expect(container.textContent).toContain("A project ID has 6 to 30");
  });

  it("clears the project ID when the field is emptied", async () => {
    const { fake, container } = await open(account(record([], { projectId: "halonic-x1" })));
    await type(container.querySelector("input") as HTMLInputElement, "");
    await press(button(container, "Done, next"));
    expect(fake.edits[0]?.edit).toEqual({ kind: "project-id", projectId: null });
  });

  it("lists one row per API with its own Enable, and Switch on all above them", async () => {
    const { container } = await open(account(record(["project"]), { services: [ledger, atlas] }));
    expect(container.textContent).toContain("Switch on 2 APIs");
    expect(container.textContent).toContain("ledger.googleapis.com");
    expect(container.textContent).toContain("Needed by Ledger");
    expect(button(container, "Switch on all")).toBeDefined();
    const enables = [...container.querySelectorAll("a")].filter((a) =>
      a.textContent?.startsWith("Enable"),
    );
    expect(enables).toHaveLength(2);
  });

  it("has no Switch on all for one API", async () => {
    const { container } = await open(account(record(["project"])));
    expect(container.textContent).not.toContain("Switch on all");
  });

  it("holds Done, next in step 3 until In production is ticked, with its reason", async () => {
    const { fake, container } = await open(account(record(["project", "apis"])));
    const done = button(container, "Done, next");
    expect(done.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(done.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Tick 'In production' to go on.");
    await press(done);
    expect(fake.edits).toEqual([]);
    await press(container.querySelector('input[type="checkbox"]') as HTMLElement);
    expect(fake.edits.map((entry) => entry.edit)).toEqual([
      { kind: "in-production", ticked: true },
    ]);
  });

  it("works at once when the tick is set", async () => {
    const { fake, container } = await open(
      account(record(["project", "apis"], { inProductionTickedAt: ticked })),
    );
    await press(button(container, "Done, next"));
    expect(fake.edits.map((entry) => entry.edit)).toEqual([{ kind: "step-done", step: "consent" }]);
  });

  it("shows External with the copy values for a personal account", async () => {
    const { container } = await open(account(record(["project", "apis"])));
    expect(container.textContent).toContain('"External"');
    expect(container.textContent).toContain("Halonic (own app)");
    expect(button(container, "Copy").getAttribute("aria-label")).toBe("Copy the app name");
    expect(container.textContent).not.toContain("Internal isn't available?");
  });

  it("shows Internal and its help, with a way to edit step 1, for a Workspace account", async () => {
    const { container } = await open(
      account(record(["project", "apis"], { accountType: "workspace" })),
    );
    expect(container.textContent).toContain('"Internal"');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).toContain("Internal isn't available?");
    await press(button(container, "Edit step 1"));
    expect(document.activeElement?.textContent).toContain("Google Cloud project");
  });

  it("lists each scope with its reason, Restricted as a word where marked, and Copy all scopes", async () => {
    const { container } = await open(
      account(record(["project", "apis", "consent"], { inProductionTickedAt: ticked })),
    );
    expect(container.textContent).toContain("https://www.googleapis.com/auth/ledger");
    expect(container.textContent).toContain("Reads your ledger");
    expect(button(container, "Copy").getAttribute("aria-label")).toBe("Copy all scopes");
  });

  it("tags a restricted scope with the word and explains it once", async () => {
    const vault = {
      ...ledger,
      id: "vault",
      label: "Vault",
      googleScopes: [
        {
          scope: "https://www.googleapis.com/auth/vault",
          reason: "Opens the vault",
          restricted: true,
        },
      ],
    };
    const { container } = await open(
      account(record(["project", "apis", "consent"], { inProductionTickedAt: ticked }), {
        services: [ledger, vault],
      }),
    );
    expect(container.textContent?.match(/Restricted/g)).toHaveLength(1);
    expect(container.textContent).toContain("Google shows a warning when you sign in");
  });

  it("shows the restricted note for a personal account only, but keeps the tag for both", async () => {
    const vault = {
      ...ledger,
      id: "vault",
      label: "Vault",
      googleScopes: [
        {
          scope: "https://www.googleapis.com/auth/vault",
          reason: "Opens the vault",
          restricted: true,
        },
      ],
    };
    const { container } = await open(
      account(
        record(["project", "apis", "consent"], {
          inProductionTickedAt: ticked,
          accountType: "workspace",
        }),
        { services: [ledger, vault] },
      ),
    );
    expect(container.textContent?.match(/Restricted/g)).toHaveLength(1);
    expect(container.textContent).not.toContain("Google shows a warning when you sign in");
  });

  it("puts each value to copy inside its action, lettered", async () => {
    const { container } = await open(account(record([])));
    const list = container.querySelector("ol.list-\\[lower-alpha\\]");
    expect(list).not.toBeNull();
    const named = [...(list?.querySelectorAll("li") ?? [])].find((li) =>
      li.textContent?.startsWith("Name the project"),
    );
    expect(named?.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Copy the project name",
    );
  });

  it("warns before the actions in step 5 that the secret is shown once, and has no Done, next", async () => {
    const { container } = await open(
      account(record(["project", "apis", "consent", "scopes"], { inProductionTickedAt: ticked })),
    );
    const text = container.textContent ?? "";
    expect(text.indexOf("only once")).toBeGreaterThan(-1);
    expect(text.indexOf("only once")).toBeLessThan(text.indexOf("Desktop app"));
    expect(text).not.toContain("Done, next");
    expect(button(container, "Copy").getAttribute("aria-label")).toBe("Copy the client name");
  });
});
