import { AddressRefusedError, createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { parseIntegrationSheet } from "@halonicjs/format/integration";
import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { clientSecretName, exampleSheetRecord, signInName } from "./example-sheet.ts";
import { createSignInRig } from "./sign-in-rig.ts";

/** The problem codes the sheet check gives for the example sheet after `edit`. */
function problemCodes(edit: (sheet: Record<string, unknown>) => void): string[] {
  const sheet = exampleSheetRecord();
  edit(sheet);
  const parsed = parseIntegrationSheet(sheet);
  return parsed.ok ? [] : parsed.error.map((problem) => problem.code);
}

function setField(sheet: Record<string, unknown>, name: string, value: unknown): void {
  sheet[name] = value;
}

function editSignIn(sheet: Record<string, unknown>, fields: Record<string, unknown>): void {
  Object.assign(
    (sheet["signIns"] as Record<string, Record<string, unknown>>)[signInName] ?? {},
    fields,
  );
}

/** A sheet whose sign-in reads its server from the setting `authHost`, a public host. */
function selfHosted(sheet: Record<string, unknown>): void {
  sheet["hosts"] = ["api.example.com", { fromSetting: "authHost", class: "public" }];
  editSignIn(sheet, {
    authorizeUrl: { fromSetting: "authHost", path: "/oauth/authorize" },
    tokenUrl: { fromSetting: "authHost", path: "/oauth/token" },
    revokeUrl: { fromSetting: "authHost", path: "/oauth/revoke" },
  });
}

verifies("sign-in.sheet-attacks", () => {
  describe("attack case T6: a token endpoint that isn't public https", () => {
    it.each(["authorizeUrl", "tokenUrl", "revokeUrl", "issuer"])(
      "refuses a sheet whose %s is plain http",
      (field) => {
        const codes = problemCodes((sheet) =>
          editSignIn(sheet, { [field]: "http://auth.example.com/oauth/x" }),
        );
        expect(codes.length).toBeGreaterThan(0);
      },
    );

    it.each([
      "ftp://auth.example.com/token",
      "//auth.example.com/token",
      "https://user:pw@auth.example.com/token",
      "https://auth.example.com/token#frag",
      "https://auth.example.com/token?x=1",
    ])("refuses a token URL of %s", (url) => {
      expect(problemCodes((sheet) => editSignIn(sheet, { tokenUrl: url })).length).toBeGreaterThan(
        0,
      );
    });

    it.each([
      "https://127.0.0.1",
      "https://169.254.169.254",
      "https://[::1]",
      "https://localhost",
      "https://10.0.0.1",
      "https://192.168.1.1:8080",
      "http://auth.example.com",
      "https://user:pw@evil.example",
      "https://auth.example.com:99999",
    ])("refuses a self-hosted setting of %s, so the sign-in reads no server there", (value) => {
      expect(() =>
        createSignInRig({
          editSheet: selfHosted,
          settings: { clientId: "fake-client", authHost: value },
        }),
      ).toThrow();
    });

    it("reads only the host of a self-hosted setting, so a path, query or fragment in it goes nowhere", async () => {
      const rig = createSignInRig({
        editSheet: selfHosted,
        settings: { clientId: "fake-client", authHost: "https://AUTH.example.com:8443/evil?x=1#y" },
      });
      const found = await rig.signIns.lookUp(signInName);
      expect(found).toMatchObject({
        kind: "approvable",
        signIn: { tokenUrl: "https://auth.example.com:8443/oauth/token" },
      });
    });

    describe("the address check at connect", () => {
      /** The Node client over a resolver that says where each name goes, and the names it was asked about. */
      function checkedClient(answers: Record<string, string[]>) {
        const lookups: string[] = [];
        const http = createNodeHttpClient({
          hostClass: () => "public",
          resolve: async (hostname) => {
            lookups.push(hostname);
            return answers[hostname] ?? [];
          },
        });
        return { http, lookups };
      }

      const hostile: [string, string[]][] = [
        ["a name that resolves to the metadata address", ["169.254.169.254"]],
        ["a name that resolves to a private address", ["10.0.0.5"]],
        ["a name that resolves to loopback", ["127.0.0.1"]],
        ["a name that resolves to a mapped metadata address", ["::ffff:169.254.169.254"]],
      ];

      it.each(hostile)(
        "refuses %s, for a token request, before it connects",
        async (_name, addresses) => {
          const { http, lookups } = checkedClient({ "auth.example.com": addresses });
          await expect(
            http.fetch("https://auth.example.com/oauth/token", {
              method: "POST",
              body: "code=x",
              redirect: "error",
            }),
          ).rejects.toBeInstanceOf(AddressRefusedError);
          expect(lookups).toEqual(["auth.example.com"]);
        },
      );

      it("sends the sign-in's refresh and revoke nowhere when the provider's name is later pointed at a private address", async () => {
        let active: HttpClient | undefined;
        const rig = createSignInRig({
          signInHttp: (server) => ({ fetch: (url, init) => (active ?? server).fetch(url, init) }),
        });
        await rig.signIn();
        const sent = rig.server.requests.length;
        active = checkedClient({ "auth.example.com": ["169.254.169.254"] }).http;

        await expect(rig.signIns.tokens.access(signInName)).rejects.toThrow("could not be reached");
        expect(await rig.signIns.signOut(signInName)).toEqual({
          kind: "signedOut",
          revoke: "notConfirmed",
        });

        expect(rig.server.requests).toHaveLength(sent);
        expect(rig.store.size).toBe(0);
      });

      it("refuses the code exchange the same way and saves nothing", async () => {
        const { http } = checkedClient({ "auth.example.com": ["10.0.0.5"] });
        const rig = createSignInRig({ signInHttp: () => http });
        const { outcome } = await rig.signIn();
        expect(outcome).toMatchObject({ kind: "unreachable" });
        expect(rig.store.size).toBe(0);
      });
    });
  });

  describe("attack case T1: a sheet that asks for tokens or sign-ins it may not have", () => {
    it("reads a sheet with tokens only as a declaration, and gives the integration no way to read the grant", async () => {
      const sheet = exampleSheetRecord();
      sheet["tokens"] = [{ name: "session", purpose: "Keeps you signed in." }];
      expect(parseIntegrationSheet(sheet).ok).toBe(true);
    });

    it("refuses signIns in a sheet that says kit 1", () => {
      expect(problemCodes((sheet) => setField(sheet, "kit", 1))).toContain("sign-ins-need-kit-2");
    });

    it("has no form placement for a token, so the integration can't ask for one", () => {
      expect(
        problemCodes((sheet) =>
          editSignIn(sheet, { access: { hosts: ["api.example.com"], as: "form", field: "token" } }),
        ).length,
      ).toBeGreaterThan(0);
    });

    it("refuses an access host the sheet doesn't declare", () => {
      expect(
        problemCodes((sheet) =>
          editSignIn(sheet, { access: { hosts: ["evil.example"], as: "bearer" } }),
        ),
      ).toContain("sign-in-host-not-declared");
    });
  });

  describe("attack case T16: a client secret with a life of its own", () => {
    it("refuses a client secret that declares hosts or a placement", () => {
      for (const extra of [
        { hosts: ["cdn.example.com"], as: "bearer" },
        { hosts: ["auth.example.com"] },
        { as: "bearer" },
      ]) {
        const codes = problemCodes((sheet) =>
          setField(sheet, "secrets", { [clientSecretName]: { purpose: "x", ...extra } }),
        );
        expect(codes.length, JSON.stringify(extra)).toBeGreaterThan(0);
      }
    });

    it("refuses a client secret two sign-ins share, one no sign-in names and one the sheet doesn't declare", () => {
      expect(
        problemCodes((sheet) => {
          const signIns = sheet["signIns"] as Record<string, unknown>;
          signIns["second-account"] = { ...(signIns[signInName] as object) };
        }),
      ).toContain("client-secret-shared");
      expect(problemCodes((sheet) => editSignIn(sheet, { clientSecret: undefined }))).toContain(
        "client-secret-unused",
      );
      expect(
        problemCodes((sheet) => editSignIn(sheet, { clientSecret: "missing-secret" })),
      ).toContain("client-secret-not-declared");
    });
  });
});
