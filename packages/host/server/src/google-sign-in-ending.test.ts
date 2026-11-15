import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import {
  callback,
  codeQuery,
  everythingSaid,
  readySetup,
  type Setup,
  setup,
  startSignIn,
} from "./google-sign-in-routes.test-helper.ts";
import { wrongAccountNoteLifetimeMs } from "./wrong-account-notes.ts";

/** `GET /api/google/setups/<ref>/sign-in/wrong-account`, as the open item reads it. */
function readWrongAccount(server: Server, accountRef: string): Promise<Response> {
  return server.handle(
    new Request(`http://localhost:4321/api/google/setups/${accountRef}/sign-in/wrong-account`, {
      headers: { host: "localhost:4321" },
    }),
  );
}

describe("google sign-in that ends without an account", () => {
  const endings = [
    { outcome: "cancelled", ending: "cancelled" },
    { outcome: "wrongClientSecret", ending: "secretRefused" },
    { outcome: "adminBlocked", ending: "adminBlocked" },
  ] as const;

  verifies("server.google-sign-in", () => {
    it.each(endings)(
      "keeps $ending on the record for a callback that ends as $outcome",
      async ({ outcome, ending }) => {
        const state = setup();
        const accountRef = await readySetup(state);
        await startSignIn(state.server, accountRef);
        state.google.actions.signInOutcome = { kind: outcome, accountRef };

        await callback(state.server, codeQuery);

        const record = await state.google.setups.read(accountRef);
        expect(record?.lastSignInEnded).toEqual({
          kind: ending,
          at: state.clock.now().toISOString(),
        });
        expect(record?.signInStartedAt).toBeNull();
      },
    );

    it("clears it when the next sign-in starts, and keeps nothing for other failures", async () => {
      const state = setup();
      const accountRef = await readySetup(state);
      state.google.actions.signInOutcome = { kind: "cancelled", accountRef };
      await callback(state.server, codeQuery);

      await startSignIn(state.server, accountRef);
      expect((await state.google.setups.read(accountRef))?.lastSignInEnded).toBeNull();

      state.google.actions.signInOutcome = { kind: "googleError", accountRef };
      await callback(state.server, codeQuery);
      expect((await state.google.setups.read(accountRef))?.lastSignInEnded).toBeNull();
    });
  });
});

describe("google sign-in as another account", () => {
  const otherAddress = "someone-else@example.com";

  /** A setup whose sign-in came back for `otherAddress`. */
  async function wrongSignIn(state: Setup): Promise<string> {
    const accountRef = await readySetup(state);
    state.google.actions.signInOutcome = {
      kind: "wrongAccount",
      accountRef,
      signedInAs: otherAddress,
    };
    await callback(state.server, codeQuery);
    return accountRef;
  }

  verifies("server.google-sign-in", () => {
    it("notes the wrong account on the record without the address, and gives the address on the read route", async () => {
      const state = setup();
      const accountRef = await wrongSignIn(state);

      const record = await state.google.setups.read(accountRef);
      expect(record?.wrongAccountAt).toBe(state.clock.now().toISOString());
      expect(record?.signInStartedAt).toBeNull();
      expect(JSON.stringify(record)).not.toContain(otherAddress);
      const response = await readWrongAccount(state.server, accountRef);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ signedInAs: otherAddress });
    });

    it("answers 404 when the account has no note, and when the setup doesn't exist", async () => {
      const state = setup();
      const accountRef = await readySetup(state);

      const noNote = await readWrongAccount(state.server, accountRef);
      const noSetup = await readWrongAccount(state.server, "unknown-ref");

      expect(noNote.status).toBe(404);
      expect(await noNote.json()).toMatchObject({ code: "google_wrong_account_not_found" });
      expect(noSetup.status).toBe(404);
      expect(await noSetup.json()).toMatchObject({ code: "google_setup_not_found" });
    });

    it("forgets the address after ten minutes but keeps the record's note", async () => {
      const state = setup();
      const accountRef = await wrongSignIn(state);

      state.clock.advance(wrongAccountNoteLifetimeMs);

      expect((await readWrongAccount(state.server, accountRef)).status).toBe(404);
      expect((await state.google.setups.read(accountRef))?.wrongAccountAt).not.toBeNull();
    });

    it("forgets the note and clears the record's mark when a new sign-in starts", async () => {
      const state = setup();
      const accountRef = await wrongSignIn(state);

      await startSignIn(state.server, accountRef);

      expect((await readWrongAccount(state.server, accountRef)).status).toBe(404);
      expect((await state.google.setups.read(accountRef))?.wrongAccountAt).toBeNull();
    });

    it("forgets the note and clears the record's mark when the connector's address changes", async () => {
      const state = setup();
      const accountRef = await wrongSignIn(state);

      const response = await state.server.handle(
        new Request(`http://localhost:4321/api/google/setups/${accountRef}`, {
          method: "PATCH",
          headers: {
            host: "localhost:4321",
            "content-type": "application/json",
            "sec-fetch-site": "same-origin",
          },
          body: JSON.stringify({ kind: "address-changed" }),
        }),
      );

      expect(await response.json()).toEqual({ updated: true });
      expect((await readWrongAccount(state.server, accountRef)).status).toBe(404);
      expect((await state.google.setups.read(accountRef))?.wrongAccountAt).toBeNull();
    });

    it("forgets the note when a sign-in succeeds", async () => {
      const state = setup();
      const accountRef = await wrongSignIn(state);
      state.google.actions.signInOutcome = { kind: "signedIn", accountRef, services: [] };
      await callback(state.server, codeQuery);

      expect((await readWrongAccount(state.server, accountRef)).status).toBe(404);
      expect((await state.google.setups.read(accountRef))?.wrongAccountAt).toBeNull();
    });

    it("keeps the address out of the page, the request log and the errors", async () => {
      const state = setup();
      const accountRef = await readySetup(state);
      state.google.actions.signInOutcome = {
        kind: "wrongAccount",
        accountRef,
        signedInAs: otherAddress,
      };

      const page = await (await callback(state.server, codeQuery)).text();

      expect(everythingSaid([page], state.requestLog, state.errors)).not.toContain(otherAddress);
    });
  });
});
