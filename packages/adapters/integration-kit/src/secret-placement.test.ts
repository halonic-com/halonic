import type { SecretPlacement } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  canary,
  client,
  fakeTransport,
  memoryTokens,
  policy,
  policyPlacing,
  redirect,
  refusal,
} from "./fake-transport.test-helper.ts";
import { createIntegrationHost } from "./host.ts";
import { IntegrationRefusedError } from "./integration/index.ts";
import { createLimitedHttpClient } from "./limited-http.ts";
import type { DeclaredPlacement } from "./policy.ts";
import { RequestLog } from "./request-log.ts";

const inHeader = policyPlacing({ as: "header", header: "x-api-key" });
const afterPrefix = policyPlacing({ as: "header", header: "x-api-key", prefix: "Key " });

/** A client whose secret store counts its reads, to show nothing is read before a refusal. */
function countingClient(sheet: DeclaredPlacement) {
  const { transport, sent } = fakeTransport();
  const reads: string[] = [];
  const http = createLimitedHttpClient({
    policy: policyPlacing(sheet),
    transport,
    secrets: {
      get: async (name) => {
        reads.push(name);
        return canary["example-key"];
      },
    },
    log: new RequestLog(),
  });
  return { http, sent, reads };
}

verifies("integration-kit.placement-from-sheet", () => {
  describe("attack case A40: a secret placed another way than the sheet says", () => {
    it.each<[string, DeclaredPlacement, SecretPlacement]>([
      [
        "another header than the sheet's",
        { as: "header", header: "x-api-key" },
        { secret: "example-key", as: "header", header: "x-other-key" },
      ],
      [
        "a bearer token when the sheet says header",
        { as: "header", header: "x-api-key" },
        { secret: "example-key", as: "bearer" },
      ],
      [
        "a form field when the sheet says header",
        { as: "header", header: "x-api-key" },
        { secret: "example-key", as: "form", field: "x-api-key" },
      ],
      [
        "the authorization header with a Bearer prefix when the sheet says bearer",
        { as: "bearer" },
        { secret: "example-key", as: "header", header: "authorization", prefix: "Bearer " },
      ],
      [
        "another prefix",
        { as: "header", header: "x-api-key", prefix: "Key " },
        { secret: "example-key", as: "header", header: "x-api-key", prefix: "Token " },
      ],
      [
        "no prefix when the sheet gives one",
        { as: "header", header: "x-api-key", prefix: "Key " },
        { secret: "example-key", as: "header", header: "x-api-key" },
      ],
      [
        "a prefix when the sheet gives none",
        { as: "header", header: "x-api-key" },
        { secret: "example-key", as: "header", header: "x-api-key", prefix: "Key " },
      ],
      [
        "another form field, such as a field the service stores",
        { as: "form", field: "client_secret" },
        { secret: "example-key", as: "form", field: "note_title" },
      ],
      [
        "the same form field in another case",
        { as: "form", field: "client_secret" },
        { secret: "example-key", as: "form", field: "Client_Secret" },
      ],
      [
        "a header that only Unicode case folding turns into the sheet's",
        { as: "header", header: "x-api-key" },
        { secret: "example-key", as: "header", header: "x-api-Key" },
      ],
    ])("refuses %s, reads no secret and sends nothing", async (_what, sheet, placement) => {
      const { http, sent, reads } = countingClient(sheet);
      const request = http.fetch("https://api.example.com/v1/notes", {
        method: "POST",
        body: new URLSearchParams({ title: "Shopping" }),
        auth: placement,
      });
      expect(await refusal(request)).toBe("placement-not-in-sheet");
      expect(reads).toEqual([]);
      expect(sent).toEqual([]);
    });

    it("places the sheet's header given in another case", async () => {
      const { http, sent } = client(undefined, undefined, inHeader);
      await http.fetch("https://api.example.com/v1", {
        auth: { secret: "example-key", as: "header", header: "X-Api-Key" },
      });
      expect(sent[0]?.headers["x-api-key"]).toBe(canary["example-key"]);
    });

    it("counts an empty prefix and no prefix as the same", async () => {
      const { http, sent } = client(undefined, undefined, inHeader);
      await http.fetch("https://api.example.com/v1", {
        auth: { secret: "example-key", as: "header", header: "x-api-key", prefix: "" },
      });
      expect(sent[0]?.headers["x-api-key"]).toBe(canary["example-key"]);

      const withEmpty = client(
        undefined,
        undefined,
        policyPlacing({ as: "header", header: "x-api-key", prefix: "" }),
      );
      await withEmpty.http.fetch("https://api.example.com/v1", {
        auth: { secret: "example-key", as: "header", header: "x-api-key" },
      });
      expect(withEmpty.sent[0]?.headers["x-api-key"]).toBe(canary["example-key"]);
    });

    it("refuses a placement no type allows, from an integration without types", async () => {
      const { http, sent } = client(undefined, undefined, inHeader);
      const odd = [
        { secret: "example-key", as: "cookie", header: "x-api-key" },
        { secret: "example-key", as: "header", header: 42 },
        { secret: "example-key", as: "header", header: "x-api-key", prefix: 0 },
      ] as unknown as SecretPlacement[];
      for (const auth of odd) {
        expect(await refusal(http.fetch("https://api.example.com/v1", { auth }))).toBe(
          "placement-not-in-sheet",
        );
      }
      expect(sent).toEqual([]);
    });

    it("refuses before the first hop, so a redirect doesn't change the result", async () => {
      const toApi = () => redirect(302, "https://api.example.com/final");
      const refused = client(toApi, undefined, inHeader);
      const request = refused.http.fetch("https://api.example.com/start", {
        auth: { secret: "example-key", as: "header", header: "x-other-key" },
      });
      expect(await refusal(request)).toBe("placement-not-in-sheet");
      expect(refused.sent).toEqual([]);

      const placed = client(
        (url) => (url.pathname === "/start" ? toApi() : new Response("ok")),
        undefined,
        inHeader,
      );
      await placed.http.fetch("https://api.example.com/start", {
        auth: { secret: "example-key", as: "header", header: "X-API-KEY" },
      });
      expect(placed.sent.map((hop) => hop.headers["x-api-key"])).toEqual([
        canary["example-key"],
        canary["example-key"],
      ]);
    });

    it("names the secret and both placements in the message, never the value", async () => {
      const { http } = client(undefined, undefined, afterPrefix);
      const error = await http
        .fetch("https://api.example.com/v1", {
          auth: { secret: "example-key", as: "header", header: "x-note-title" },
        })
        .catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(IntegrationRefusedError);
      expect((error as Error).message).toBe(
        'weather: the secret "example-key" goes in the header "x-api-key" after "Key " in its permission sheet, not in the header "x-note-title"',
      );
      expect(String(error)).not.toContain(canary["example-key"]);
    });

    it("quotes and shortens what the code gave, so it can't break the message", async () => {
      const { http } = client();
      const error = await http
        .fetch("https://oauth.example.com/token", {
          method: "POST",
          body: new URLSearchParams(),
          auth: { secret: "client-secret", as: "form", field: `a"\n${"b".repeat(200)}` },
        })
        .catch((thrown: unknown) => thrown);
      expect((error as Error).message).toBe(
        `weather: the secret "client-secret" goes in the form field "client_secret" in its permission sheet, not in the form field "a\\"\\n${"b".repeat(47)}…"`,
      );
    });

    it("cuts what the code gave by characters, never through a surrogate pair", async () => {
      const { http } = client();
      const error = await http
        .fetch("https://oauth.example.com/token", {
          method: "POST",
          body: new URLSearchParams(),
          auth: {
            secret: "client-secret",
            as: "form",
            field: `${"b".repeat(49)}😀${"c".repeat(20)}`,
          },
        })
        .catch((thrown: unknown) => thrown);
      expect((error as Error).message).toContain(`"${"b".repeat(49)}😀…"`);
    });

    describe("the code changes its placement after the check", () => {
      /** Every header sent, to show the key went only where the sheet says. */
      const sentHeaders = (sent: { headers: Record<string, string> }[]) =>
        sent.map((hop) => hop.headers);

      it("places the key where the sheet says when the code changes the header right after fetch", async () => {
        const { http, sent } = client(undefined, undefined, inHeader);
        const auth = { secret: "example-key", as: "header" as const, header: "x-api-key" };
        const request = http.fetch("https://api.example.com/v1/notes", { auth });
        auth.header = "x-note-title";
        await request;
        expect(sentHeaders(sent)).toEqual([{ "x-api-key": canary["example-key"] }]);
      });

      it("places the key where the sheet says when the code changes `as` right after fetch", async () => {
        const { http, sent } = client(undefined, undefined, inHeader);
        const auth: { secret: string; as: "header" | "bearer"; header: string } = {
          secret: "example-key",
          as: "header",
          header: "x-api-key",
        };
        const request = http.fetch("https://api.example.com/v1/notes", { auth });
        auth.as = "bearer";
        await request;
        expect(sentHeaders(sent)).toEqual([{ "x-api-key": canary["example-key"] }]);
      });

      it("places the key where the sheet says when the code changes the header before a redirect hop", async () => {
        const auth = { secret: "example-key", as: "header" as const, header: "x-api-key" };
        const { http, sent } = client(
          (url) => {
            if (url.pathname !== "/start") return new Response("ok");
            auth.header = "x-note-title";
            return redirect(302, "https://api.example.com/final");
          },
          undefined,
          inHeader,
        );
        await http.fetch("https://api.example.com/start", { auth });
        expect(sentHeaders(sent)).toEqual([
          { "x-api-key": canary["example-key"] },
          { "x-api-key": canary["example-key"] },
        ]);
      });

      it("reads a getter once, so it can't give the check one header and the request another", async () => {
        const { http, sent } = client(undefined, undefined, inHeader);
        let reads = 0;
        const auth = {
          secret: "example-key",
          as: "header" as const,
          get header() {
            reads++;
            return reads === 1 ? "x-api-key" : "x-note-title";
          },
        };
        await http.fetch("https://api.example.com/v1/notes", { auth });
        expect(reads).toBe(1);
        expect(sentHeaders(sent)).toEqual([{ "x-api-key": canary["example-key"] }]);
      });

      it("places the checked secret when the code swaps the secret's name after fetch", async () => {
        const bothForApi = {
          ...inHeader,
          secrets: {
            ...inHeader.secrets,
            "client-secret": {
              hosts: ["api.example.com"],
              placement: { as: "bearer" as const },
            },
          },
        };
        const { http, sent } = client(undefined, undefined, bothForApi);
        const auth = { secret: "example-key", as: "header" as const, header: "x-api-key" };
        const request = http.fetch("https://api.example.com/v1/notes", { auth });
        auth.secret = "client-secret";
        await request;
        expect(sentHeaders(sent)).toEqual([{ "x-api-key": canary["example-key"] }]);
      });

      it("refuses a field that isn't text, since an object could turn into other text on each read", async () => {
        const { http, sent, reads } = countingClient({ as: "header", header: "x-api-key" });
        let calls = 0;
        const shifting = { toString: () => (++calls === 1 ? "x-api-key" : "x-note-title") };
        const odd = [
          { secret: "example-key", as: "header", header: shifting },
          { secret: shifting, as: "header", header: "x-api-key" },
          { secret: "example-key", as: shifting, header: "x-api-key" },
          null,
        ] as unknown as SecretPlacement[];
        for (const auth of odd) {
          expect(await refusal(http.fetch("https://api.example.com/v1", { auth }))).toBe(
            "placement-not-in-sheet",
          );
        }
        expect(calls).toBe(0);
        expect(reads).toEqual([]);
        expect(sent).toEqual([]);
      });
    });

    it("holds for the host an integration gets, as in the fenced runner", async () => {
      const { transport, sent } = fakeTransport();
      const { host } = createIntegrationHost({
        policy,
        transport,
        secrets: { get: async () => canary["example-key"] },
        tokens: memoryTokens(),
      });
      const request = host.http.fetch("https://api.example.com/v1", {
        auth: { secret: "example-key", as: "header", header: "x-api-key" },
      });
      expect(await refusal(request)).toBe("placement-not-in-sheet");
      expect(sent).toEqual([]);
    });
  });
});
