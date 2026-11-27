import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type {
  ActionAccount,
  ServiceSignIn,
  SignInConnectionRef,
  SignInEnd,
  SignInRevoke,
  SignInStart,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

verifies("ports.service-sign-in", () => {
  typeTest(
    "reads the connection, starts, follows, cancels, says who and revokes a test, and nothing else",
    () => {
      expectTypeOf<keyof ServiceSignIn>().toEqualTypeOf<
        "connection" | "start" | "follow" | "cancel" | "whoAmI" | "revokeTest"
      >();
      expectTypeOf<ServiceSignIn["start"]>().parameters.toEqualTypeOf<
        [ref: SignInConnectionRef, options: { test: boolean }]
      >();
      expectTypeOf<ServiceSignIn["start"]>().returns.toEqualTypeOf<Promise<SignInStart>>();
      expectTypeOf<ServiceSignIn["follow"]>().parameters.toEqualTypeOf<
        [signInId: string, signal: AbortSignal]
      >();
      expectTypeOf<ServiceSignIn["follow"]>().returns.toEqualTypeOf<Promise<SignInEnd>>();
      expectTypeOf<ServiceSignIn["whoAmI"]>().returns.toEqualTypeOf<
        Promise<ActionAccount | undefined>
      >();
      expectTypeOf<ServiceSignIn["revokeTest"]>().returns.toEqualTypeOf<Promise<SignInRevoke>>();
    },
  );

  it("signs in to Paperclip only", () => {
    const ref: SignInConnectionRef = {
      service: "paperclip",
      connection: "acme",
      host: "paperclip.acme.example",
    };
    // @ts-expect-error: another service is a reviewed change to the port
    const github: SignInConnectionRef = { ...ref, service: "github" };
    expect([ref, github]).toHaveLength(2);
  });

  it("never gives a key", () => {
    const started: SignInStart = {
      outcome: "started",
      signInId: "sign-in-1",
      code: "amber-otter",
      approvalUrl: "https://paperclip.acme.example/cli-auth/challenge-1",
      expiresAt: "2026-11-26T12:10:00.000Z",
    };
    // @ts-expect-error: the key goes from the sign-in straight to the keychain
    const withKey: SignInStart = { ...started, key: "x" };
    const ended: SignInEnd = {
      outcome: "signed-in",
      account: { service: "paperclip", name: "Acme Board" },
    };
    // @ts-expect-error: an account is its name only
    const account: ActionAccount = { service: "paperclip", name: "Acme Board", key: "x" };
    expect([started, withKey, ended, account]).toHaveLength(4);
  });
});
