import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RequestContext, Server, ServerErrorBody, ServerPorts } from "./index.ts";

verifies("server.api", () => {
  typeTest("gives the server one method that maps a Web Request to a Web Response", () => {
    expectTypeOf<keyof Server>().toEqualTypeOf<"handle">();
    expectTypeOf<Server["handle"]>().toEqualTypeOf<
      (request: Request, context?: RequestContext) => Promise<Response>
    >();
  });

  typeTest("gives the request context a client address and a scheme only", () => {
    expectTypeOf<keyof RequestContext>().toEqualTypeOf<"clientAddress" | "secure">();
  });

  typeTest("gives an error a code and a short message only", () => {
    expectTypeOf<keyof ServerErrorBody>().toEqualTypeOf<"code" | "message">();
  });

  typeTest("takes every outside dependency as a port", () => {
    expectTypeOf<keyof ServerPorts>().toEqualTypeOf<
      | "runs"
      | "trust"
      | "secrets"
      | "passwordHasher"
      | "coordination"
      | "requestCounts"
      | "errorLog"
      | "clock"
      | "ids"
    >();
  });
});
