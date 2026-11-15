import { refreshTokenName } from "@halonicjs/google-setup";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { fakeGoogle } from "./google-fakes.test-helper.ts";
import { TestClock, testServer } from "./test-server.ts";

/** An invented workspace key and connector for the setups these tests start. */
const connector = { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" };

function setup() {
  const clock = new TestClock();
  const google = fakeGoogle(clock);
  const server: Server = testServer({
    passwordHash: null,
    clock,
    google,
    config: { allowedHosts: ["localhost"] },
  });
  return { server, google };
}

type Setup = ReturnType<typeof setup>;

function send(
  { server }: Setup,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return server.handle(
    new Request(`http://localhost/api/google/setups${path}`, {
      method,
      headers: {
        host: "localhost",
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

async function started(state: Setup): Promise<string> {
  const response = await send(state, "POST", "", { accountType: "personal", connector });
  return ((await response.json()) as { accountRef: string }).accountRef;
}

describe("google setup write routes", () => {
  verifies("server.google-setup-write", () => {
    it("starts a record that the connector's link finds", async () => {
      const state = setup();

      const response = await send(state, "POST", "", { accountType: "workspace", connector });

      expect(response.status).toBe(201);
      const { accountRef } = (await response.json()) as { accountRef: string };
      const record = await state.google.setups.forConnector(connector.workspace, connector.id);
      expect(record).toMatchObject({ accountRef, accountType: "workspace", connector });
    });

    it("refuses a body or a link that is wrong, and writes nothing", async () => {
      const state = setup();
      const bodies = [
        { accountType: "personal", connector: { ...connector, id: ".." } },
        { accountType: "personal", connector: { ...connector, workspace: "nope" } },
        { accountType: "company", connector },
        { connector },
        { accountType: "personal" },
      ];
      for (const body of bodies) {
        const response = await send(state, "POST", "", body);
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: "bad_request" });
      }
      expect(await state.google.setups.list()).toEqual([]);
    });

    it("refuses a start from another site", async () => {
      const state = setup();

      const response = await send(
        state,
        "POST",
        "",
        { accountType: "personal", connector },
        { "sec-fetch-site": "cross-site" },
      );

      expect(response.status).toBe(403);
      expect(await state.google.setups.list()).toEqual([]);
    });

    it("applies the edits a person makes", async () => {
      const state = setup();
      const accountRef = await started(state);
      const edits = [
        { kind: "account-type", accountType: "workspace" },
        { kind: "project-id", projectId: "acme-project-1" },
        { kind: "step-done", step: "project" },
        { kind: "in-production", ticked: true },
        { kind: "client-id", clientId: "1234-abc123.apps.googleusercontent.com" },
      ];
      for (const edit of edits) {
        const response = await send(state, "PATCH", `/${accountRef}`, edit);
        expect(await response.json()).toEqual({ updated: true });
      }
      expect(await state.google.setups.read(accountRef)).toMatchObject({
        accountType: "workspace",
        projectId: "acme-project-1",
        clientId: "1234-abc123.apps.googleusercontent.com",
      });

      await send(state, "PATCH", `/${accountRef}`, { kind: "project-id", projectId: null });
      await send(state, "PATCH", `/${accountRef}`, { kind: "step-reopened", step: "project" });
      expect(await state.google.setups.read(accountRef)).toMatchObject({
        projectId: null,
        stepsDone: {},
      });
    });

    it("refuses the edits the server records itself", async () => {
      const state = setup();
      const accountRef = await started(state);
      const edits = [
        { kind: "signed-in" },
        { kind: "sign-in-started" },
        { kind: "client-secret-saved", clientRef: "any" },
        { kind: "step-done", step: "nope" },
        { kind: "project-id", projectId: "" },
        {},
      ];
      for (const edit of edits) {
        const response = await send(state, "PATCH", `/${accountRef}`, edit);
        expect(response.status).toBe(400);
      }
      expect(await state.google.setups.read(accountRef)).toMatchObject({ lastSignInAt: null });
    });

    it("answers 404 for a ref with no record", async () => {
      const state = setup();

      const edit = await send(state, "PATCH", "/acme_gone", {
        kind: "in-production",
        ticked: true,
      });
      const startOver = await send(state, "POST", "/acme_gone/start-over");

      expect(edit.status).toBe(404);
      expect(startOver.status).toBe(404);
      expect(await startOver.json()).toMatchObject({ code: "google_setup_not_found" });
    });

    it("starts over without asking Google", async () => {
      const state = setup();
      const accountRef = await started(state);
      await state.google.tokens.set(refreshTokenName(accountRef), "fake-refresh-token-0000000001");

      const response = await send(state, "POST", `/${accountRef}/start-over`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ clientSecret: "none-saved" });
      expect(await state.google.setups.read(accountRef)).toBeNull();
      expect(await state.google.tokens.get(refreshTokenName(accountRef))).toBeNull();
    });
  });
});
