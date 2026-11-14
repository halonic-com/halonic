// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { account, fakeAccounts, record } from "../accounts.test-helper.ts";
import type { GoogleSetupAccount, SecretEntry } from "../api.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { GoogleSetupView } from "./google-setup-view.tsx";

afterEach(unmountAll);

const item = {
  kind: "setup",
  key: "setup:google:gaccount_1",
  provider: "google",
  account: "gaccount_1",
  title: "Set up Google for x@example.com",
  progress: "Step 5 of 7 · Client",
  changedAt: "2026-11-12T02:10:00.000Z",
} as const;

const clientId = "1234-abc.apps.googleusercontent.com";
// Invented values, shaped like a secret. Nothing here is real.
const fakeSecret = "GOCSPX-fake-0000";
const at = "2026-11-12T02:10:00.000Z";
const upToClient = ["project", "apis", "consent", "scopes"];

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function open(setup: GoogleSetupAccount, options: Parameters<typeof fakeAccounts>[1] = {}) {
  const fake = fakeAccounts([setup], options);
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

async function type(field: HTMLInputElement, text: string): Promise<void> {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
  await settled();
}

function inputs(container: HTMLElement) {
  const all = [...container.querySelectorAll("input")];
  return {
    id: all.find((field) => field.type === "text") as HTMLInputElement,
    secret: all.find((field) => field.type === "password") as HTMLInputElement,
  };
}

function edits(fake: Awaited<ReturnType<typeof open>>["fake"]) {
  return fake.edits.map((entry) => entry.edit);
}

verifies("google-setup.client-id-field", () => {
  it("shows both fields in step 5, whose client ID finishes it", async () => {
    const { fake, container } = await open(account(record(upToClient)));
    const { id } = inputs(container);
    expect(inputs(container).secret).toBeDefined();
    await type(id, clientId);
    await press(button(container, "Save client ID"));
    expect(edits(fake)).toEqual([
      { kind: "client-id", clientId },
      { kind: "step-done", step: "client" },
    ]);
  });

  it("marks step 6 done too when the secret was saved first", async () => {
    const saved = record(upToClient, { clientSecret: { clientRef: "gclient_1", savedAt: at } });
    const { fake, container } = await open(account(saved));
    await type(inputs(container).id, clientId);
    await press(button(container, "Save client ID"));
    expect(edits(fake)).toEqual([
      { kind: "client-id", clientId },
      { kind: "step-done", step: "client" },
      { kind: "step-done", step: "credentials" },
    ]);
  });

  it("keeps step 5 open, with the typed secret, while the client ID is saved", async () => {
    const setup = account(record(upToClient));
    const { fake, container } = await open(setup);
    await type(inputs(container).secret, fakeSecret);
    await type(inputs(container).id, clientId);
    await press(button(container, "Save client ID"));
    // The host now has the client ID and step 5 done, so step 6 would be the current step.
    fake.change([account(record([...upToClient, "client"], { clientId }))]);
    await settled();
    expect(inputs(container).secret.value).toBe(fakeSecret);
    await press(button(container, "Save secret"));
    expect(fake.secrets).toEqual([{ accountRef: "gaccount_1", value: fakeSecret }]);
    expect(edits(fake)).toContainEqual({ kind: "step-done", step: "credentials" });
  });

  it("says the progress wasn't saved, not the client ID, when only the step tick fails", async () => {
    const { container } = await open(account(record(upToClient)), {
      edit: async (edit) => {
        if (edit.kind === "step-done") throw new Error("The engine isn't answering.");
      },
    });
    await type(inputs(container).id, clientId);
    await press(button(container, "Save client ID"));
    expect(container.textContent).toContain(
      "Couldn't save your progress: the engine isn't answering.",
    );
    expect(container.textContent).not.toContain("Couldn't save the client ID");
    expect(inputs(container).id.value).toBe("");
  });

  it("moves focus to the secret field when a secret is pasted into the client ID", async () => {
    const { container } = await open(account(record(upToClient)));
    await type(inputs(container).id, fakeSecret);
    expect(inputs(container).id.value).toBe("");
    expect(document.activeElement).toBe(inputs(container).secret);
    expect(container.innerHTML).not.toContain(fakeSecret);
  });

  it("shows step 6 with the saved client ID and its fields once step 5 is done", async () => {
    const { container } = await open(account(record([...upToClient, "client"], { clientId })));
    expect(container.textContent).toContain("Closed Google's window before copying the secret?");
    expect(container.textContent).toContain(clientId);
    expect(inputs(container).secret).toBeDefined();
  });
});

verifies("google-setup.secret-field", () => {
  const withId = record([...upToClient, "client"], { clientId });

  it("sends the secret through the host's secret save and never through an edit", async () => {
    const { fake, container } = await open(account(withId));
    await type(inputs(container).secret, ` ${fakeSecret} `);
    await press(button(container, "Save secret"));
    expect(fake.secrets).toEqual([{ accountRef: "gaccount_1", value: fakeSecret }]);
    expect(JSON.stringify(fake.edits)).not.toContain(fakeSecret);
  });

  it("marks step 6 done once the secret is saved and the client ID is", async () => {
    const { fake, container } = await open(account(withId));
    await type(inputs(container).secret, fakeSecret);
    await press(button(container, "Save secret"));
    expect(edits(fake)).toEqual([{ kind: "step-done", step: "credentials" }]);
    expect(inputs(container).secret.value).toBe("");
  });

  it("does not mark step 6 done while the client ID is missing", async () => {
    const { fake, container } = await open(account(record(upToClient)));
    await type(inputs(container).secret, fakeSecret);
    await press(button(container, "Save secret"));
    expect(fake.secrets).toHaveLength(1);
    expect(edits(fake)).toEqual([]);
  });

  it("writes no log line and no edit that holds the secret when saving fails", async () => {
    const lines = ["log", "info", "warn", "error", "debug"].map((method) =>
      vi.spyOn(console, method as "log").mockImplementation(() => {}),
    );
    const { fake, container } = await open(account(withId), {
      saveSecret: async () => {
        throw new Error("The store is locked.");
      },
    });
    await type(inputs(container).secret, fakeSecret);
    await press(button(container, "Save secret"));
    expect(container.textContent).toContain("Couldn't save the secret. Nothing was saved.");
    expect(JSON.stringify(lines.map((spy) => spy.mock.calls))).not.toContain(fakeSecret);
    expect(JSON.stringify(fake.edits)).not.toContain(fakeSecret);
    expect(container.innerHTML).not.toContain(fakeSecret);
    for (const spy of lines) spy.mockRestore();
  });

  it("says the progress wasn't saved, not the secret, when only the step tick fails", async () => {
    const { fake, container } = await open(account(withId), {
      edit: async () => {
        throw new Error("The engine isn't answering.");
      },
    });
    await type(inputs(container).secret, fakeSecret);
    await press(button(container, "Save secret"));
    expect(fake.secrets).toHaveLength(1);
    expect(container.textContent).toContain(
      "Couldn't save your progress: the engine isn't answering.",
    );
    expect(container.textContent).not.toContain("Nothing was saved");
    expect(inputs(container).secret.value).toBe("");
  });

  it("shows the browser demo's sentence and no secret field", async () => {
    const entry: SecretEntry = { kind: "unavailable", reason: "demo", commandExists: false };
    const { container } = await open(account(withId), { entry });
    expect(container.textContent).toContain(
      "Connecting Google needs the desktop app or halonic serve.",
    );
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("without a password, says where to save it, and shows the command only when it exists", async () => {
    const without: SecretEntry = {
      kind: "unavailable",
      reason: "no-password",
      commandExists: false,
    };
    const first = await open(account(withId), { entry: without });
    expect(first.container.textContent).toContain(
      "Save the client secret on the computer that runs Halonic.",
    );
    expect(first.container.textContent).not.toContain("halonic google secret");
    unmountAll();
    const second = await open(account(withId), { entry: { ...without, commandExists: true } });
    expect(second.container.textContent).toContain("halonic google secret gaccount_1");
  });
});
