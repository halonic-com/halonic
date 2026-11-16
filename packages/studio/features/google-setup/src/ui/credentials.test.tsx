// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
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

async function open(
  setup: GoogleSetupAccount,
  options: Parameters<typeof fakeAccounts>[1] = {},
  focus?: "secret",
) {
  const fake = fakeAccounts([setup], options);
  const container = render(
    <GoogleSetupView
      item={item}
      answering
      close={vi.fn()}
      accounts={fake.source}
      {...(focus === undefined ? {} : { focus })}
    />,
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
        if (edit.kind === "step-done")
          throw new KindedError("unavailable", "The engine isn't answering.");
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

  it("keeps the failed-tick line when saving a held secret opens step 6", async () => {
    let failTick = false;
    const { fake, container } = await open(account(record(upToClient)), {
      edit: async (edit) => {
        if (failTick && edit.kind === "step-done")
          throw new KindedError("unavailable", "The engine isn't answering.");
      },
    });
    await type(inputs(container).secret, fakeSecret);
    await type(inputs(container).id, clientId);
    await press(button(container, "Save client ID"));
    fake.change([account(record([...upToClient, "client"], { clientId }))]);
    await settled();
    failTick = true;
    await press(button(container, "Save secret"));
    expect(fake.secrets).toHaveLength(1);
    expect(inputs(container).secret.value).toBe("");
    expect(container.textContent).toContain(
      "Couldn't save your progress: the engine isn't answering.",
    );
  });

  it("retries only the steps that failed, not the one that was ticked", async () => {
    const saved = record(upToClient, { clientSecret: { clientRef: "gclient_1", savedAt: at } });
    let failCredentials = true;
    const { fake, container } = await open(account(saved), {
      edit: async (edit) => {
        if (failCredentials && edit.kind === "step-done" && edit.step === "credentials") {
          throw new KindedError("unavailable", "The engine isn't answering.");
        }
      },
    });
    await type(inputs(container).id, clientId);
    await press(button(container, "Save client ID"));
    failCredentials = false;
    await press(button(container, "Try again"));
    const ticks = edits(fake).filter((edit) => edit.kind === "step-done");
    expect(ticks).toEqual([
      { kind: "step-done", step: "client" },
      { kind: "step-done", step: "credentials" },
    ]);
    expect(container.textContent).not.toContain("Couldn't save your progress");
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
        throw new KindedError("unavailable", "The store is locked.");
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
        throw new KindedError("unavailable", "The engine isn't answering.");
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

const signedIn = [...upToClient, "client", "credentials", "sign-in"];
const refused = {
  clientId,
  refreshRefused: { reason: "client", at } as const,
  clientSecret: { clientRef: "gclient_1", savedAt: at },
  lastSignInAt: at,
};
const newSecret = "GOCSPX-fake-2222";

verifies("google-setup.secret-replace", () => {
  it("opens step 6 at the new-secret field when Google refused the saved secret, and sends it to the host's replace", async () => {
    const { fake, container } = await open(account(record(signedIn, refused)));
    // Google refused the saved secret, so step 6 opens with the new-secret field already open.
    expect(inputs(container).secret).toBeDefined();
    expect(document.activeElement).not.toBe(inputs(container).secret);
    await type(inputs(container).secret, newSecret);
    await press(button(container, "Save new secret"));
    expect(fake.replacements).toEqual([{ accountRef: "gaccount_1", value: newSecret }]);
    expect(fake.secrets).toEqual([]);
    expect(JSON.stringify(edits(fake))).not.toContain(newSecret);
    expect(container.textContent).toContain("Google accepted the new secret.");
    expect(container.innerHTML).not.toContain(newSecret);
  });
});

verifies("google-setup.secret-field", () => {
  it("opens step 6 with the cursor in the empty secret field when asked for the secret", async () => {
    const { container } = await open(account(record(upToClient)), {}, "secret");
    const { secret } = inputs(container);
    expect(container.textContent).toContain("Step 6 of 7");
    expect(document.activeElement).toBe(secret);
    expect(secret.value).toBe("");
  });

  it("puts the cursor in the empty new-secret field of an account Google refused", async () => {
    const { container } = await open(account(record(signedIn, refused)), {}, "secret");
    const { secret } = inputs(container);
    expect(document.activeElement).toBe(secret);
    expect(secret.value).toBe("");
  });

  it("goes on to step 7 once the secret is saved when step 6 was already the current one", async () => {
    const { container } = await open(
      account(record(upToClient.concat("client"), { clientId })),
      {},
      "secret",
    );
    await type(inputs(container).secret, fakeSecret);
    await press(button(container, "Save secret"));
    expect(container.textContent).toContain("Step 7 of 7");
  });

  it("opens at the current step as before when nothing was asked for", async () => {
    await open(account(record(upToClient)));
    expect(document.activeElement?.tagName).toBe("H3");
  });

  it("falls back to the step's title when the secret is saved and its field is hidden", async () => {
    const saved = record(upToClient, { clientSecret: { clientRef: "gclient_1", savedAt: at } });
    const { container } = await open(account(saved), {}, "secret");
    expect(inputs(container).secret).toBeUndefined();
    expect(document.activeElement?.tagName).toBe("H3");
  });
});
