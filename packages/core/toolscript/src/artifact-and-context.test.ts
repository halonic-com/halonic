import { parse } from "@halonicjs/schema-kit";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import { acmeUserHeader } from "./acme-header.fixture.ts";
import { artifactSchema } from "./artifact.ts";
import type { CapabilityRegistry, SecretHandle, UserContext } from "./context.ts";

const digest = `sha256:${"a".repeat(64)}`;
const artifact = {
  header: acmeUserHeader,
  code: "export async function run(ctx) {}",
  sourceHash: digest,
  codeHash: digest,
  profileVersion: 1,
};

verifies("toolscript.artifact", () => {
  describe("artifactSchema", () => {
    it("takes a built artifact", () => {
      expect(parse(artifactSchema, artifact).ok).toBe(true);
    });

    it("refuses a hash that isn't a SHA-256 digest", () => {
      expect(parse(artifactSchema, { ...artifact, codeHash: "abc" }).ok).toBe(false);
    });

    it("refuses an unknown key and an invalid header", () => {
      expect(parse(artifactSchema, { ...artifact, signature: "x" }).ok).toBe(false);
      expect(
        parse(artifactSchema, { ...artifact, header: { ...acmeUserHeader, audience: "both" } }).ok,
      ).toBe(false);
    });
  });
});

interface AcmeRegistry extends CapabilityRegistry {
  readonly "acme.set-variable@1": {
    readonly namespace: "acme";
    readonly method: "setVariable";
    readonly input: { readonly repo: string; readonly name: string };
    readonly result: { readonly changed: boolean };
  };
  readonly "acme.delete-zone@1": {
    readonly namespace: "acme";
    readonly method: "deleteZone";
    readonly input: { readonly zone: string };
    readonly result: undefined;
  };
}

verifies("toolscript.context", () => {
  describe("UserContext", () => {
    typeTest("has the declared inputs and only the used capabilities", () => {
      type Ctx = UserContext<typeof acmeUserHeader, AcmeRegistry>;
      expectTypeOf<Ctx["input"]["name"]>().toEqualTypeOf<string>();
      expectTypeOf<Ctx["input"]["repos"]>().toEqualTypeOf<readonly string[]>();
      expectTypeOf<Ctx["input"]["token"]>().toEqualTypeOf<SecretHandle>();
      expectTypeOf<Ctx["acme"]["setVariable"]>().toBeFunction();
      expectTypeOf<Ctx["acme"]>().not.toHaveProperty("deleteZone");
      expectTypeOf<Ctx["audience"]>().toEqualTypeOf<"user">();
    });
  });
});
