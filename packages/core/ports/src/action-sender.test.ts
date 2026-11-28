import type { ActionRecordEvent } from "@halonicjs/events";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type ActionAccount,
  type ActionOpenResult,
  type ActionOperationRoute,
  type ActionRecords,
  type ActionRoute,
  type ActionSender,
  type ActionSendRequest,
  type ActionSendResult,
  type ActionSignInResult,
  type ActionStepRef,
  actionOperations,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

verifies("ports.action-sender", () => {
  typeTest("has sign-in, sign-out, who am I, send and open a guided page, and nothing else", () => {
    expectTypeOf<keyof ActionSender>().toEqualTypeOf<
      "account" | "signIn" | "signOut" | "send" | "openGuided"
    >();
    expectTypeOf<ActionSender["send"]>().parameters.toEqualTypeOf<[request: ActionSendRequest]>();
    expectTypeOf<ActionSender["send"]>().returns.toEqualTypeOf<Promise<ActionSendResult>>();
    expectTypeOf<ActionSender["openGuided"]>().parameters.toEqualTypeOf<[request: ActionStepRef]>();
    expectTypeOf<ActionSender["openGuided"]>().returns.toEqualTypeOf<Promise<ActionOpenResult>>();
    expectTypeOf<ActionSender["signIn"]>().returns.toEqualTypeOf<Promise<ActionSignInResult>>();
    expectTypeOf<ActionSender["account"]>().returns.toEqualTypeOf<
      Promise<ActionAccount | undefined>
    >();
  });

  typeTest("names a reviewed step, never an address, a method or a header", () => {
    expectTypeOf<keyof ActionSendRequest>().toEqualTypeOf<
      "definition" | "version" | "step" | "placeholders" | "body"
    >();
  });

  it("doesn't take an address or headers", () => {
    const request: ActionSendRequest = {
      definition: "github.approve-run",
      version: 1,
      step: 2,
      placeholders: { owner: "acme", repo: "app" },
    };
    // @ts-expect-error: the sender takes the path from its route list, never from the caller
    const withPath: ActionSendRequest = { ...request, path: "/repos/acme/app" };
    // @ts-expect-error: the sender adds the only header it sends, and keeps the token
    const withHeaders: ActionSendRequest = { ...request, headers: { authorization: "x" } };
    // @ts-expect-error: a body field is a plain value or a list of numbers, never an object
    const nestedBody: ActionSendRequest = { ...request, body: { rules: { a: 1 } } };
    expect(request.step).toBe(2);
    expect([withPath, withHeaders, nestedBody]).toHaveLength(3);
  });

  it("hands back plain kept values, says when the user cancelled, and never gives a token", () => {
    const answered: ActionSendResult = { outcome: "answered", status: 201, kept: { id: 7 } };
    const cancelled: ActionSendResult = { outcome: "cancelled" };
    // @ts-expect-error: a kept field is a plain value, never an object such as the answer's headers
    const nested: ActionSendResult = { ...answered, kept: { headers: { a: "b" } } };
    // @ts-expect-error: an account is a name, never a token
    const withToken: ActionAccount = { service: "github", name: "acme-dev", token: "x" };
    expect([answered.outcome, cancelled.outcome]).toEqual(["answered", "cancelled"]);
    expect([nested, withToken]).toHaveLength(2);
  });
});

verifies("ports.action-records", () => {
  typeTest("appends and reads a request's record, and can't change or delete it", () => {
    expectTypeOf<keyof ActionRecords>().toEqualTypeOf<"append" | "read">();
    expectTypeOf<ActionRecords["append"]>().parameters.toEqualTypeOf<[event: ActionRecordEvent]>();
    expectTypeOf<ActionRecords["read"]>().returns.toEqualTypeOf<
      Promise<readonly ActionRecordEvent[]>
    >();
  });

  it("doesn't hold the request itself, which is a run event", () => {
    const started: ActionRecordEvent = {
      type: "action.step.started",
      request: "req-1",
      at: "2026-11-24T13:00:00.000Z",
      step: 1,
    };
    // @ts-expect-error: `action.requested` goes to the run log, not into the record
    const requested: ActionRecordEvent = { ...started, type: "action.requested" };
    expect([started, requested]).toHaveLength(2);
  });
});

verifies("ports.action-operation-route", () => {
  it("runs an operation route by its name and service, never by a method or a path", () => {
    expect(actionOperations).toEqual({ "paperclip.set-secret": "paperclip" });
    const route: ActionOperationRoute = {
      kind: "operation",
      definition: "paperclip.set-secret",
      version: 1,
      step: 1,
      service: "paperclip",
      risk: "admin",
      placeholders: { name: "^[A-Z][A-Z0-9_]{0,63}$" },
      operation: "paperclip.set-secret",
      body: [{ name: "value", kind: "secret-input" }],
      keep: ["setOn"],
    };
    // @ts-expect-error: an operation is one the sender's own code runs, never a name the catalog makes up
    const unknown: ActionOperationRoute = { ...route, operation: "paperclip.read-secret" };
    // @ts-expect-error: an operation route has no path for the sender to call
    const withPath: ActionOperationRoute = { ...route, path: "/api/secrets" };
    // @ts-expect-error: an operation belongs to one service, so it can't be sent to another
    const otherService: ActionOperationRoute = { ...route, service: "github" };
    const routes: ActionRoute[] = [route];
    expect([unknown, withPath, otherService, routes]).toHaveLength(4);
  });
});
