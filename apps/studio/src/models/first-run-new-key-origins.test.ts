import { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { acmeFiles, acmeFolder } from "./first-run-model-choice.testing.ts";

const anthropic = { kind: "key", provider: "anthropic" } as const;
const pasted = "sk-ant-acme-new-1";
const proxy = "https://proxy.acme.test";

/** Tests the choice, with `key` pasted or none, and continues with the passed test. */
async function testAndContinue(folder: ReturnType<typeof acmeFolder>, key?: SecretText) {
  const tested = await folder.service.test(anthropic, key);
  if (tested.kind !== "tested" || tested.outcome !== "ok") throw new Error("the test didn't pass");
  return await folder.service.continue(tested.testId, undefined);
}

verifies("studio.first-run-new-key-origins", () => {
  it("saves a pasted key under the provider file's name with no origins from the earlier key", async () => {
    const folder = acmeFolder({
      files: {
        ...acmeFiles,
        "providers/anthropic.yaml": "id: anthropic\ntype: anthropic\nsecret: team-key\n",
      },
    });
    folder.stored.set("team-key", "sk-ant-acme-earlier-1");
    folder.origins.set("team-key", [proxy]);

    expect(await testAndContinue(folder, new SecretText(pasted))).toMatchObject({ ok: true });

    expect([...folder.stored]).toEqual([["team-key", pasted]]);
    expect(folder.origins.get("team-key")).toBeUndefined();
  });

  it("keeps a saved key's origins when nothing is pasted", async () => {
    const folder = acmeFolder();
    folder.stored.set("anthropic-api-key", "sk-ant-acme-saved-1");
    folder.origins.set("anthropic-api-key", [proxy]);

    expect(await testAndContinue(folder)).toMatchObject({ ok: true });

    expect(folder.stored.get("anthropic-api-key")).toBe("sk-ant-acme-saved-1");
    expect(folder.origins.get("anthropic-api-key")).toEqual([proxy]);
  });
});
