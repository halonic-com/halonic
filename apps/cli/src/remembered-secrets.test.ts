import { SecretScrubber } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { noSecrets, rememberedSecrets } from "./remembered-secrets.ts";

describe("rememberedSecrets", () => {
  it("hands out the value and tells the scrubber about it", async () => {
    const scrubber = new SecretScrubber();
    const secrets = rememberedSecrets({ get: async () => "made-up-42" }, scrubber);
    expect(await secrets.get("provider-key")).toBe("made-up-42");
    expect(scrubber.scrub("key made-up-42")).toBe("key [secret removed]");
  });

  it("passes on a secret that isn't configured", async () => {
    const scrubber = new SecretScrubber();
    expect(await rememberedSecrets(noSecrets, scrubber).get("provider-key")).toBeNull();
    expect(scrubber.scrub("null")).toBe("null");
  });
});
