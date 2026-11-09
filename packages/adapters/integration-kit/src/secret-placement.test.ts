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
import { createLimitedHttpClient } from "./limited-http.ts";
import type { DeclaredPlacement } from "./policy.ts";
import { IntegrationRefusedError } from "./refused.ts";
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
        `weather: the secret "client-secret" goes in the form field "client_secret" in its permission sheet, not in the form field "a\\"\\n${"b".repeat(50)}…"`,
      );
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
