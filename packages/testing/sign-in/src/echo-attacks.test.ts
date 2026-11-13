import { secretRemoved } from "@halonicjs/adapter-integration-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  bearer,
  currentToken,
  redirectTo,
  refreshWhileFirstTokenLives,
  refusedWith,
  second,
  signedInRig,
} from "./attack-helpers.test-helper.ts";
import { createSignInRig, type SignInRig } from "./sign-in-rig.ts";

verifies("sign-in.echo-attacks", () => {
  describe("attack case T4: a token echoed back", () => {
    /** A provider whose tokens have characters that need escaping in a URL and in JSON. */
    async function rigWithAwkwardTokens(): Promise<SignInRig> {
      const rig = createSignInRig();
      rig.server.behavior.makeToken = (kind, number) => `fake+${kind}/token="q"\\b&c=%41-${number}`;
      expect((await rig.signIn()).outcome).toMatchObject({ kind: "signedIn" });
      expect((await rig.api()).status).toBe(200);
      return rig;
    }

    /** Makes the resource server answer a request to `/echo` with what `answer` builds from the current token. */
    function echoing(
      rig: SignInRig,
      answer: (token: string) => Response,
      host = "api.example.com",
    ) {
      rig.server.handle(host, (request) =>
        request.url.pathname === "/echo" ? answer(currentToken(rig)) : undefined,
      );
    }

    const echoes: [string, (token: string) => Response][] = [
      ["a header", (token) => new Response("ok", { headers: { "x-echo": token } })],
      [
        "the placed header form",
        (token) => new Response("ok", { headers: { "x-echo": `Bearer ${token}` } }),
      ],
      ["a text body", (token) => new Response(`you sent ${token}!`)],
      ["a JSON body", (token) => Response.json({ echoed: token, wrapped: [{ deep: token }] })],
      [
        "a URL-encoded body",
        (token) => new Response(`next=/v1?access_token=${encodeURIComponent(token)}`),
      ],
      [
        "a header with the URL-encoded form",
        (token) =>
          new Response("ok", { headers: { location: `/v1?t=${encodeURIComponent(token)}` } }),
      ],
      ["a JSON-escaped copy in text", (token) => new Response(`{"raw":${JSON.stringify(token)}}`)],
    ];

    it.each(echoes)("removes a token echoed in %s", async (_name, answer) => {
      const rig = await rigWithAwkwardTokens();
      echoing(rig, answer);
      const response = await rig.api("https://api.example.com/echo");
      const text = await response.text();
      const everything = text + JSON.stringify([...response.headers]);
      expect(everything).toContain(secretRemoved);
      expect(everything).not.toContain(currentToken(rig));
      expect(everything).not.toContain(encodeURIComponent(currentToken(rig)));
      expect(everything).not.toContain(JSON.stringify(currentToken(rig)).slice(1, -1));
    });

    it("removes a token split across the pieces of a streamed body", async () => {
      const rig = await rigWithAwkwardTokens();
      echoing(rig, (token) => {
        const middle = Math.floor(token.length / 2);
        const pieces = [
          `start ${token.slice(0, middle)}`,
          token.slice(middle, middle + 3),
          `${token.slice(middle + 3)} end`,
        ];
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream({
            start(controller) {
              for (const piece of pieces) controller.enqueue(encoder.encode(piece));
              controller.close();
            },
          }),
        );
      });
      const text = await (await rig.api("https://api.example.com/echo")).text();
      expect(text).toBe(`start ${secretRemoved} end`);
    });

    it("removes a token echoed after a redirect, by the host it was redirected to", async () => {
      const rig = await rigWithAwkwardTokens();
      echoing(rig, () => redirectTo("https://cdn.example.com/echo"));
      echoing(rig, (token) => new Response(`cdn saw ${token}`), "cdn.example.com");
      const text = await (await rig.api("https://api.example.com/echo")).text();
      expect(text).toBe(`cdn saw ${secretRemoved}`);
    });

    it("removes an older token that still works, the refresh token and the client secret, which no request placed", async () => {
      const rig = await rigWithAwkwardTokens();
      const older = await refreshWhileFirstTokenLives(rig);
      const refreshToken = rig.server.ledger.grants[0]?.currentRefreshToken ?? "";
      echoing(
        rig,
        () =>
          new Response(
            [older, refreshToken, rig.server.clientSecret, currentToken(rig)].join(" | "),
          ),
      );
      const text = await (await rig.api("https://api.example.com/echo")).text();
      expect(text).toBe(Array(4).fill(secretRemoved).join(" | "));
    });

    it("removes a token a refresh issued after the request started, from a later hop's answer", async () => {
      const rig = await rigWithAwkwardTokens();
      rig.advance(3600 * second);
      echoing(rig, (token) => new Response(`saw ${token}`));
      const text = await (await rig.api("https://api.example.com/echo")).text();
      expect(text).toBe(`saw ${secretRemoved}`);
    });
  });

  describe("attack case T5: a token carried in the integration's own request", () => {
    /** The values the filter holds after two refreshes: a current and an older token, a refresh token and the client secret. */
    async function rigWithValues() {
      const rig = await signedInRig();
      const older = await refreshWhileFirstTokenLives(rig);
      return {
        rig,
        values: {
          current: currentToken(rig),
          older,
          refresh: rig.server.ledger.grants[0]?.currentRefreshToken ?? "",
          clientSecret: rig.server.clientSecret ?? "",
        },
      };
    }

    const ways: [string, (value: string) => RequestInit & { url: string }][] = [
      ["a query", (value) => ({ url: `https://cdn.example.com/v1?key=${value}` })],
      [
        "an encoded query",
        (value) => ({ url: `https://cdn.example.com/v1?key=${encodeURIComponent(value)}` }),
      ],
      ["a header", (value) => ({ url: "https://cdn.example.com/v1", headers: { "x-key": value } })],
      [
        "a text body",
        (value) => ({ url: "https://cdn.example.com/v1", method: "POST", body: `data=${value}` }),
      ],
      [
        "a JSON body",
        (value) => ({
          url: "https://cdn.example.com/v1",
          method: "POST",
          body: JSON.stringify({ key: value }),
        }),
      ],
    ];

    it.each(ways)("refuses every value the filter holds, in %s", async (_name, build) => {
      const { rig, values } = await rigWithValues();
      const sent = rig.server.requests.length;
      for (const value of Object.values(values)) {
        const { url, ...init } = build(value);
        const code = await refusedWith(rig.loaded.host.http.fetch(url, init));
        expect(code, `${value.slice(0, 18)}…`).toBe("secret-in-request");
      }
      expect(rig.server.requests).toHaveLength(sent);
    });

    it("refuses an integration that writes the token itself where the kit would place it", async () => {
      const { rig, values } = await rigWithValues();
      const code = await refusedWith(
        rig.loaded.host.http.fetch("https://api.example.com/v1/me", {
          headers: { authorization: `Bearer ${values.current}` },
        }),
      );
      expect(code).toBe("secret-in-request");
    });

    it("still lets the kit place the token itself on the same request", async () => {
      const { rig } = await rigWithValues();
      const response = await rig.loaded.host.http.fetch("https://api.example.com/v1/me", {
        auth: bearer,
      });
      expect(response.status).toBe(200);
    });
  });
});
