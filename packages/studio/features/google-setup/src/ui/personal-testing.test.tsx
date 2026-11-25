// @vitest-environment jsdom
import type { SetupRecord } from "@halonicjs/google-setup";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { account, fakeAccounts, record } from "../accounts.test-helper.ts";
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
  progress: "Step 3 of 6 · Consent screen",
  changedAt: "2026-11-12T02:10:00.000Z",
} as const;

const weekly = "With a personal account, Google ends the sign-in every 7 days";
const ticked = "2026-11-12T02:10:00.000Z";

function personalApp(
  publishing: "testing" | "production",
  extra: Partial<NonNullable<SetupRecord["personalApp"]>> = {},
): Partial<SetupRecord> {
  return { personalApp: { publishing, testUserTickedAt: null, sharedApp: false, ...extra } };
}

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

function checkboxLabel(container: HTMLElement): string {
  return container.querySelector('input[type="checkbox"]')?.closest("label")?.textContent ?? "";
}

verifies("google-setup.personal-testing-step", () => {
  it("says before step 1 that a personal account signs in again every week", async () => {
    const { container } = await open(account(record([])));
    expect(container.querySelector("header")?.textContent).toContain(weekly);
    expect(container.textContent).toContain("Step 1 of 6");
  });

  it("has no weekly line for a Workspace account or a published personal app", async () => {
    const workspace = await open(account(record([], { accountType: "workspace" })));
    expect(workspace.container.textContent).not.toContain(weekly);
    expect(workspace.container.textContent).toContain("Step 1 of 7");
    unmountAll();
    const published = await open(account(record([], personalApp("production"))));
    expect(published.container.textContent).not.toContain(weekly);
  });

  it("asks in step 3 for the address under Test users, and waits for its tick", async () => {
    const { fake, container } = await open(account(record(["project", "apis"])));
    expect(container.textContent).toContain('click "Add users", add your address and click "Save"');
    expect(container.querySelector('button[aria-label="Copy the test user"]')).not.toBeNull();
    expect(checkboxLabel(container)).toBe('x@example.com is listed under "Test users"');
    expect(container.textContent).toContain("Without it, Google blocks your sign-in in step 6.");
    const done = button(container, "Done, next");
    expect(done.getAttribute("aria-disabled")).toBe("true");
    await press(container.querySelector('input[type="checkbox"]') as HTMLElement);
    expect(fake.edits.map((entry) => entry.edit)).toEqual([{ kind: "test-user", ticked: true }]);
  });

  it("goes on from step 3 once the test user is ticked", async () => {
    const { fake, container } = await open(
      account(record(["project", "apis"], personalApp("testing", { testUserTickedAt: ticked }))),
    );
    await press(button(container, "Done, next"));
    expect(fake.edits.map((entry) => entry.edit)).toEqual([{ kind: "step-done", step: "consent" }]);
  });

  it("switches to the In production tick and seven steps with Publish with my own pages, and back", async () => {
    const testing = account(record(["project", "apis"]));
    const { fake, container } = await open(testing);
    expect(container.textContent).toContain("Why not publish?");
    await press(button(container, "Publish with my own pages"));
    expect(fake.edits.at(-1)?.edit).toEqual({ kind: "publishing", publishing: "production" });

    await act(async () =>
      fake.change([account(record(["project", "apis"], personalApp("production")))]),
    );
    await settled();
    expect(checkboxLabel(container)).toBe('The status says "In production"');
    expect(container.textContent).toContain("Step 3 of 7");
    expect(container.textContent).toContain('On "Branding", fill in, then click "Save".');
    expect(container.textContent).not.toContain(weekly);

    await press(button(container, "Stay in Testing instead"));
    expect(fake.edits.at(-1)?.edit).toEqual({ kind: "publishing", publishing: "testing" });
    await act(async () => fake.change([testing]));
    await settled();
    expect(checkboxLabel(container)).toBe('x@example.com is listed under "Test users"');
    expect(container.textContent).toContain("Step 3 of 6");
  });

  it("moves focus to the first new part after each publishing choice", async () => {
    const testing = account(record(["project", "apis"]));
    const published = account(record(["project", "apis"], personalApp("production")));
    const { fake, container } = await open(testing);
    const publish = button(
      container.querySelector("details") as HTMLElement,
      "Publish with my own pages",
    );
    publish.focus();
    await press(publish);
    await act(async () => fake.change([published]));
    await settled();
    expect(document.activeElement?.tagName).toBe("LI");
    expect(document.activeElement?.textContent).toMatch(/^On "Branding", fill in/);

    const stay = button(container, "Stay in Testing instead");
    stay.focus();
    await press(stay);
    await act(async () => fake.change([testing]));
    await settled();
    expect(document.activeElement?.textContent).toMatch(/^On "Audience", under "Test users"/);
  });

  it("leaves focus to the failure, not a part, when the publishing choice isn't saved", async () => {
    const fake = fakeAccounts([account(record(["project", "apis"]))], {
      edit: async () => {
        throw new Error("disk full");
      },
    });
    const container = render(
      <GoogleSetupView item={item} answering close={vi.fn()} accounts={fake.source} />,
    );
    await settled();
    const publish = button(
      container.querySelector("details") as HTMLElement,
      "Publish with my own pages",
    );
    publish.focus();
    await press(publish);
    expect(publish.isConnected).toBe(true);
    expect(document.activeElement?.textContent).toContain("Couldn't save your progress");
  });

  it("moves focus to step 3's Branding part after the header's Publish, or to the title", async () => {
    const atConsent = await open(account(record(["project", "apis"])));
    const header = atConsent.container.querySelector("header") as HTMLElement;
    const publish = button(header, "Publish with my own pages");
    publish.focus();
    await press(publish);
    await act(async () =>
      atConsent.fake.change([account(record(["project", "apis"], personalApp("production")))]),
    );
    await settled();
    expect(document.activeElement?.textContent).toMatch(/^On "Branding", fill in/);
    unmountAll();

    const atStart = await open(account(record([])));
    const early = button(atStart.container.querySelector("header") as HTMLElement, "Publish");
    early.focus();
    await press(early);
    await act(async () => atStart.fake.change([account(record([], personalApp("production")))]));
    await settled();
    expect(document.activeElement?.textContent).toBe("Google for x@example.com");
  });

  it("opens the same panel from the header's Why?", async () => {
    const { fake, container } = await open(account(record([])));
    const header = container.querySelector("header") as HTMLElement;
    expect(header.textContent).toContain("Why does Google end the sign-in every week?");
    await press(button(header, "Publish with my own pages"));
    expect(fake.edits.map((entry) => entry.edit)).toEqual([
      { kind: "publishing", publishing: "production" },
    ]);
  });

  it("asks a second account on a shared app in Testing only to add itself under Test users", async () => {
    const shared = record(
      ["project", "apis", "client", "credentials"],
      personalApp("testing", { sharedApp: true }),
    );
    const { container } = await open(account(shared));
    expect(container.textContent).toContain("Add x@example.com under Test users.");
    const actions = container.querySelector("ol.list-\\[lower-alpha\\]");
    expect(actions?.getAttribute("start")).toBe("3");
    expect(actions?.children).toHaveLength(1);
    expect(checkboxLabel(container)).toBe('x@example.com is listed under "Test users"');
    expect(container.textContent).not.toContain("Why not publish?");
  });
});
