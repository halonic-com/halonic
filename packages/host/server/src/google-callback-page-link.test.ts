import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { fakeGoogle } from "./google-fakes.test-helper.ts";
import { TestClock, testServer } from "./test-server.ts";

// Invented values. None is real.
const callbackUrl = "http://localhost:4321/api/google/callback?state=fake-state&code=fake-code";

function serverWith(callbackPageLink?: { href: string; label: string }): Server {
  const clock = new TestClock();
  const google = {
    ...fakeGoogle(clock),
    ...(callbackPageLink === undefined ? {} : { callbackPageLink }),
  };
  return testServer({ passwordHash: null, clock, google });
}

async function callbackPage(server: Server): Promise<string> {
  const response = await server.handle(
    new Request(callbackUrl, { headers: { host: "localhost:4321" } }),
  );
  return response.text();
}

describe("google sign-in callback page link", () => {
  verifies("server.google-callback-page-link", () => {
    it("has no link when the host names none", async () => {
      expect(await callbackPage(serverWith())).not.toContain("<a ");
    });

    it("ends with the host's link, escaped", async () => {
      const page = await callbackPage(serverWith({ href: "/home?a=1&b=2", label: "Back <home>" }));
      expect(page).toContain('<a href="/home?a=1&amp;b=2">Back &lt;home&gt;</a>');
    });
  });
});
