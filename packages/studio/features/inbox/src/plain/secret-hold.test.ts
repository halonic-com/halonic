import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { secretHold } from "./secret-hold.ts";

// Invented, shaped like the real thing: a prefix and random-looking characters.
const googleSecret = `GOCSPX-${"aB3".repeat(8)}`;
const providerKey = `sk-proj-${"Xy7".repeat(8)}`;

verifies("inbox.secret-hold", () => {
  // Until the Google setup's step 6 has a body (HAL-713), the line points at no field.
  it("names a Google client secret without pointing at a field that isn't there yet", () => {
    const hold = secretHold(`here it is: ${googleSecret}`);
    expect(hold?.shape).toBe("google-client-secret");
    expect(hold?.line).toBe(
      "This looks like a Google client secret. Messages are kept in the run log.",
    );
  });

  it("sends a phone to its computer for Providers", () => {
    expect(secretHold(providerKey, { phone: true })?.line).toBe(
      "This looks like a secret key. Messages are kept in the run log. Put it in Providers on your computer instead.",
    );
  });

  it("points any other key to Providers", () => {
    expect(secretHold(providerKey)?.line).toBe(
      "This looks like a secret key. Messages are kept in the run log. Put it in Providers instead.",
    );
  });

  it("never repeats the text it found", () => {
    expect(secretHold(googleSecret)?.line).not.toContain("aB3");
    expect(secretHold(providerKey)?.line).not.toContain("Xy7");
  });

  it("lets an ordinary note through", () => {
    expect(secretHold("Use the shorter title")).toBeUndefined();
    expect(secretHold("We use sk-learn for this")).toBeUndefined();
  });
});
