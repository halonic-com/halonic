import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type {
  ActionAccount,
  ActionSender,
  ActionSendRequest,
  ActionSendResult,
  ActionSignInResult,
  ActionStepRef,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

verifies("ports.action-sender", () => {
  typeTest("has sign-in, sign-out, who am I and send, and nothing else", () => {
    expectTypeOf<keyof ActionSender>().toEqualTypeOf<"account" | "signIn" | "signOut" | "send">();
    expectTypeOf<ActionSender["send"]>().parameters.toEqualTypeOf<[request: ActionSendRequest]>();
    expectTypeOf<ActionSender["send"]>().returns.toEqualTypeOf<Promise<ActionSendResult>>();
    expectTypeOf<ActionSender["signIn"]>().returns.toEqualTypeOf<Promise<ActionSignInResult>>();
    expectTypeOf<ActionSender["account"]>().returns.toEqualTypeOf<
      Promise<ActionAccount | undefined>
    >();
  });

  typeTest("names a reviewed step, never an address, a method or a header", () => {
    expectTypeOf<keyof ActionSendRequest>().toEqualTypeOf<"step" | "values" | "body">();
    expectTypeOf<keyof ActionStepRef>().toEqualTypeOf<"definition" | "version" | "step">();
  });

  it("doesn't take an address or headers", () => {
    const step: ActionStepRef = { definition: "github.approve-run", version: 1, step: 2 };
    const request: ActionSendRequest = { step, values: { owner: "acme", repo: "app" } };
    // @ts-expect-error: the sender takes the path from its allow-list, never from the caller
    const withPath: ActionSendRequest = { ...request, path: "/repos/acme/app" };
    // @ts-expect-error: the sender adds the only header it sends, and keeps the token
    const withHeaders: ActionSendRequest = { ...request, headers: { authorization: "x" } };
    expect(request.step.step).toBe(2);
    expect([withPath, withHeaders]).toHaveLength(2);
  });

  it("hands back plain kept values and never a token", () => {
    const answered: ActionSendResult = { outcome: "answered", status: 201, kept: { id: 7 } };
    // @ts-expect-error: a kept field is a plain value, never an object such as the answer's headers
    const nested: ActionSendResult = { ...answered, kept: { headers: { a: "b" } } };
    // @ts-expect-error: an account is a name, never a token
    const withToken: ActionAccount = { service: "github", name: "acme-dev", token: "x" };
    expect(answered.outcome).toBe("answered");
    expect([nested, withToken]).toHaveLength(2);
  });
});
