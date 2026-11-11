import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeTransport, policy, refusal } from "./fake-transport.test-helper.ts";
import { createLimitedHttpClient } from "./limited-http.ts";
import { RequestLog } from "./request-log.ts";
import { checkSecretLength, minSecretBytes } from "./secret-placement.ts";

/** A client whose `example-key` has the value `value`. */
function clientWithKey(value: string) {
  const { transport, sent } = fakeTransport();
  const http = createLimitedHttpClient({
    policy,
    transport,
    secrets: { get: async () => value },
    log: new RequestLog(),
  });
  return { http, sent };
}

const bearer = { secret: "example-key", as: "bearer" } as const;

verifies("integration-kit.secret-min-length", () => {
  it("refuses to place a secret shorter than 8 bytes, and sends nothing", async () => {
    const { http, sent } = clientWithKey("1234567");
    const code = await refusal(http.fetch("https://api.example.com/", { auth: bearer }));
    expect(code).toBe("secret-too-short");
    expect(sent).toEqual([]);
  });

  it("places a secret of exactly 8 bytes", async () => {
    const { http, sent } = clientWithKey("12345678");
    await http.fetch("https://api.example.com/", { auth: bearer });
    expect(sent).toHaveLength(1);
  });

  it("counts bytes, not characters", () => {
    expect(minSecretBytes).toBe(8);
    // Four characters of two bytes each.
    expect(() => checkSecretLength("weather", "example-key", "éééé")).not.toThrow();
    expect(() => checkSecretLength("weather", "example-key", "ééé")).toThrow(
      'weather: the secret "example-key" is shorter than 8 bytes',
    );
  });
});
