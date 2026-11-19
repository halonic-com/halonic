// @vitest-environment jsdom

import { pendingSignInLifetimeMs, type ServiceCheckOutcome } from "@halonicjs/google-setup";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { account, atlas, ledger, record } from "../accounts.test-helper.ts";
import {
  address,
  button,
  driveClock,
  open,
  press,
  ready,
  settle,
  signedOut,
  upToSignIn,
} from "../sign-in-view.test-helper.tsx";
import { unmountAll } from "../test-support/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  driveClock((ms) => vi.advanceTimersByTimeAsync(ms));
});
afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

verifies("google-setup.sign-in", () => {
  it("starts one sign-in and opens the address the host gave", async () => {
    const { fake, container, opened } = await open(signedOut(), {
      startSignIn: async () => address,
    });
    await press(button(container, "Sign in with Google"));
    expect(fake.signIns).toEqual(["gaccount_1"]);
    expect(opened).toEqual([address]);
    expect(container.textContent).not.toContain("state=abc");
  });

  it("waits with Open again and Cancel, saying so once", async () => {
    const { container } = await open(signedOut(), { startSignIn: async () => address });
    await press(button(container, "Sign in with Google"));
    expect(container.textContent).toContain("Waiting for Google… Finish in your browser.");
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(button(container, "Open again")).toBeDefined();
    expect(button(container, "Cancel")).toBeDefined();
    expect(container.textContent).not.toContain("Sign in with Google ↗");
  });

  it("opens the same sign-in again without starting another", async () => {
    const { fake, container, opened } = await open(signedOut(), {
      startSignIn: async () => address,
    });
    await press(button(container, "Sign in with Google"));
    await press(button(container, "Open again"));
    expect(opened).toEqual([address, address]);
    expect(fake.signIns).toHaveLength(1);
  });

  it("drops the pending sign-in on Cancel and gives focus to the button that comes back", async () => {
    const { fake, container } = await open(signedOut());
    await press(button(container, "Sign in with Google"));
    await press(button(container, "Cancel"));
    expect(fake.cancelled).toEqual(["gaccount_1"]);
    expect(container.textContent).not.toContain("Waiting for Google");
    expect(document.activeElement).toBe(button(container, "Sign in with Google"));
  });

  it("says Cancel failed and keeps waiting", async () => {
    const { container } = await open(signedOut(), {
      cancelSignIn: async () => {
        throw new KindedError("unavailable", "The engine isn't answering");
      },
    });
    await press(button(container, "Sign in with Google"));
    await press(button(container, "Cancel"));
    expect(container.textContent).toContain(
      "Couldn't cancel the sign-in: the engine isn't answering.",
    );
    expect(container.textContent).toContain("Waiting for Google");
    expect(button(container, "Open again")).toBeDefined();
    expect(button(container, "Cancel")).toBeDefined();
    expect(() => button(container, "Sign in with Google")).toThrow();
  });

  it("says the sign-in didn't come back after 10 minutes, and offers step 6 and the button", async () => {
    const { container } = await open(signedOut());
    await press(button(container, "Sign in with Google"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(pendingSignInLifetimeMs);
    });
    expect(container.textContent).toContain(
      "The sign-in didn't come back, or Google showed an error page instead. If it did, check the client ID in step 6. Then sign in again.",
    );
    expect(container.textContent).not.toContain("Waiting for Google");
    expect(button(container, "Sign in with Google")).toBeDefined();
    await press(button(container, "Open step 6"));
    expect(document.activeElement?.textContent).toContain("Client ID and secret");
  });

  it("says why the sign-in couldn't start, with Try again, and keeps focus on the button", async () => {
    let fail = true;
    const { container } = await open(signedOut(), {
      startSignIn: async () => {
        if (fail) throw new KindedError("unavailable", "The engine isn't answering");
        return address;
      },
    });
    const signIn = button(container, "Sign in with Google");
    signIn.focus();
    await press(signIn);
    expect(container.textContent).toContain(
      "Couldn't start the sign-in: the engine isn't answering.",
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't start");
    expect(document.activeElement).toBe(button(container, "Sign in with Google"));
    fail = false;
    await press(button(container, "Try again"));
    expect(container.textContent).toContain("Waiting for Google");
  });

  it("says the last sign-in didn't finish when the record says one started", async () => {
    const { container } = await open(
      account(record(upToSignIn, { ...ready, signInStartedAt: "2026-11-12T02:00:00.000Z" })),
    );
    expect(container.textContent).toContain("The last sign-in didn't finish. Sign in again.");
    expect(button(container, "Sign in with Google")).toBeDefined();
  });

  it("stops waiting when the record says the sign-in finished", async () => {
    const { fake, container } = await open(signedOut());
    await press(button(container, "Sign in with Google"));
    await act(async () => {
      fake.change([
        account(record(upToSignIn, { ...ready, signInStartedAt: "2026-11-12T03:00:00.000Z" })),
      ]);
    });
    await settle();
    expect(container.textContent).toContain("Waiting for Google");
    await act(async () => {
      fake.change([
        account(record(upToSignIn, { ...ready, lastSignInAt: "2026-11-12T03:01:00.000Z" })),
      ]);
    });
    await settle();
    expect(container.textContent).not.toContain("Waiting for Google");
  });

  it("says the last sign-in didn't finish when the host drops the one that was waiting", async () => {
    const { fake, container } = await open(signedOut());
    await press(button(container, "Sign in with Google"));
    await act(async () => {
      fake.change([
        account(record(upToSignIn, { ...ready, signInStartedAt: "2026-11-12T03:00:00.000Z" })),
      ]);
    });
    await settle();
    await act(async () => {
      fake.change([account(record(upToSignIn, ready))]);
    });
    await settle();
    expect(container.textContent).toContain("The last sign-in didn't finish. Sign in again.");
    expect(container.textContent).not.toContain("Waiting for Google");
  });

  it("holds the button with its reason while the engine isn't answering", async () => {
    const { fake, container } = await open(signedOut(), {}, false);
    const signIn = button(container, "Sign in with Google");
    expect(signIn.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(signIn.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toContain("isn't answering");
    await press(signIn);
    expect(fake.signIns).toEqual([]);
  });
});

const checkedAt = "2026-11-12T02:20:00.000Z";
const signedInRecord = (result: ServiceCheckOutcome) =>
  account(
    record(upToSignIn, {
      ...ready,
      lastSignInAt: checkedAt,
      services: { ledger: { result, checkedAt } },
    }),
  );

verifies("google-setup.sign-in-results", () => {
  it("says Google is set up when every service passed", async () => {
    const { container } = await open(signedInRecord({ kind: "works" }));
    expect(container.textContent).toContain("Google is set up for x@example.com. Ledger works.");
  });

  it("lists a service whose API is off with the page to switch it on", async () => {
    const { container } = await open(
      signedInRecord({
        kind: "apiOff",
        api: "ledger.googleapis.com",
        apiName: "Ledger API",
        project: "halonic-x1",
        enableUrl: "https://console.example.com/enable",
      }),
    );
    expect(container.textContent).toContain("Ledger: the Ledger API is off in project halonic-x1.");
    const link = [...container.querySelectorAll("a")].find((a) =>
      a.textContent?.startsWith("Switch it on"),
    );
    expect(link?.getAttribute("href")).toBe("https://console.example.com/enable");
    expect(container.textContent).not.toContain("Google is set up for");
  });

  it("doesn't say Google is set up while a ticked service was never checked", async () => {
    const setup = record(upToSignIn, {
      ...ready,
      lastSignInAt: checkedAt,
      services: { ledger: { result: { kind: "works" }, checkedAt } },
    });
    const { container } = await open(account(setup, { services: [ledger, atlas] }));
    expect(container.textContent).not.toContain("Google is set up for");
  });

  it("doesn't count a result from an earlier sign-in", async () => {
    const setup = record(upToSignIn, {
      ...ready,
      lastSignInAt: "2026-11-12T03:00:00.000Z",
      services: { ledger: { result: { kind: "works" }, checkedAt } },
    });
    const { container } = await open(account(setup));
    expect(container.textContent).not.toContain("Google is set up for");
    expect(container.textContent).not.toContain("Ledger works");
  });

  it("shows no results before a service was checked", async () => {
    const { container } = await open(signedOut());
    expect(container.textContent).not.toContain("Google is set up for");
    expect(container.textContent).not.toContain("works");
  });
});

const apiOff: ServiceCheckOutcome = {
  kind: "apiOff",
  api: "ledger.googleapis.com",
  apiName: "Ledger API",
  project: "halonic-x1",
  enableUrl: "https://console.example.com/enable",
};

verifies("google-setup.check-again", () => {
  it("checks again for the account, busy meanwhile, and shows the new result", async () => {
    let finish: (answer: { kind: "checked" }) => void = () => {};
    const { fake, container } = await open(signedInRecord(apiOff), {
      checkAgain: () => new Promise((resolve) => (finish = resolve)),
    });
    const check = button(container, "Check again");
    check.focus();
    await press(check);
    expect(fake.checks).toEqual(["gaccount_1"]);
    expect(button(container, "Check again").getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(button(container, "Check again"));
    await act(async () => {
      fake.change([signedInRecord({ kind: "works" })]);
      finish({ kind: "checked" });
    });
    await settle();
    expect(container.textContent).toContain("Google is set up for x@example.com. Ledger works.");
    expect(container.textContent).not.toContain("Check again");
    expect(document.activeElement?.textContent).toContain("Google is set up");
  });

  it("offers no Check again when only a box was left empty", async () => {
    const { container } = await open(
      signedInRecord({ kind: "scopeNotGranted", missingScopes: ["https://example.com/ledger"] }),
    );
    expect(() => button(container, "Check again")).toThrow();
  });

  it("says Google couldn't be reached, in words, and keeps the button", async () => {
    const { container } = await open(signedInRecord(apiOff), {
      checkAgain: async () => ({ kind: "no-network" }),
    });
    await press(button(container, "Check again"));
    expect(container.textContent).toContain("Halonic couldn't reach Google to check.");
    expect(button(container, "Check again")).toBeDefined();
  });

  it("sends a refused client or sign-in to the step that fixes it", async () => {
    const { container } = await open(signedInRecord(apiOff), {
      checkAgain: async () => ({ kind: "client-refused" }),
    });
    await press(button(container, "Check again"));
    expect(container.textContent).toContain("Check them in step 6");
  });

  it("says why the check couldn't run when the engine fails", async () => {
    const { container } = await open(signedInRecord(apiOff), {
      checkAgain: async () => {
        throw new KindedError("unavailable", "The engine isn't answering");
      },
    });
    await press(button(container, "Check again"));
    expect(container.textContent).toContain("Couldn't check again: the engine isn't answering.");
  });

  it("holds Check again with its reason while the engine isn't answering", async () => {
    const { fake, container } = await open(signedInRecord(apiOff), {}, false);
    const check = button(container, "Check again");
    expect(check.getAttribute("aria-disabled")).toBe("true");
    await press(check);
    expect(fake.checks).toEqual([]);
  });
});

const wrongAt = "2026-11-12T02:30:00.000Z";
const wrongRecord = () => account(record(upToSignIn, { ...ready, wrongAccountAt: wrongAt }));

verifies("google-setup.wrong-account", () => {
  it("names both addresses and offers Sign in again", async () => {
    const { container } = await open(wrongRecord(), {
      wrongAccount: async () => "other@example.com",
    });
    expect(container.textContent).toContain(
      "You signed in as other@example.com, but this connector is for x@example.com. Sign in again and choose x@example.com.",
    );
    expect(button(container, "Sign in again")).toBeDefined();
    expect(() => button(container, "Sign in with Google")).toThrow();
  });

  it("says the account didn't match, without the address, once the host forgot it", async () => {
    const { container } = await open(wrongRecord(), { wrongAccount: async () => null });
    expect(container.textContent).toContain(
      "The sign-in didn't match this connector, so nothing was saved. Sign in again and choose x@example.com.",
    );
    expect(container.textContent).not.toContain("instead");
  });

  it("changes the connector to the other address from the link", async () => {
    const { fake, container } = await open(wrongRecord(), {
      wrongAccount: async () => "other@example.com",
    });
    await press(button(container, "Use other@example.com for this connector instead"));
    expect(fake.addressChanges).toEqual([
      { accountRef: "gaccount_1", address: "other@example.com" },
    ]);
  });

  it("says why the address couldn't be changed", async () => {
    const { container } = await open(wrongRecord(), {
      wrongAccount: async () => "other@example.com",
      changeAddress: async () => {
        throw new KindedError("unavailable", "The engine isn't answering");
      },
    });
    await press(button(container, "Use other@example.com for this connector instead"));
    expect(container.textContent).toContain(
      "Couldn't change the connector's address: the engine isn't answering.",
    );
  });

  it("shows no note when the last sign-in matched", async () => {
    const { container } = await open(signedOut(), {
      wrongAccount: async () => "other@example.com",
    });
    expect(container.textContent).not.toContain("You signed in as");
  });

  it("shows the note, not 'didn't finish', when a waiting sign-in came back for another account", async () => {
    const { fake, container } = await open(signedOut(), {
      startSignIn: async () => address,
      wrongAccount: async () => "other@example.com",
    });
    await press(button(container, "Sign in with Google"));
    await act(async () => {
      fake.change([
        account(record(upToSignIn, { ...ready, signInStartedAt: "2026-11-12T03:00:00.000Z" })),
      ]);
    });
    await settle();
    await act(async () => {
      fake.change([account(record(upToSignIn, { ...ready, wrongAccountAt: wrongAt }))]);
    });
    await settle();
    expect(container.textContent).toContain("You signed in as other@example.com");
    expect(container.textContent).not.toContain("didn't finish");
    expect(container.textContent).not.toContain("Waiting for Google");
  });
});
