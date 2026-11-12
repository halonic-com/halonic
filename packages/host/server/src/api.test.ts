import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { Server, ServerErrorBody, ServerPorts } from "./index.ts";

verifies("server.api", () => {
  typeTest("gives the server one method that maps a Web Request to a Web Response", () => {
    expectTypeOf<keyof Server>().toEqualTypeOf<"handle">();
    expectTypeOf<Server["handle"]>().toEqualTypeOf<(request: Request) => Promise<Response>>();
  });

  typeTest("gives an error a code and a short message only", () => {
    expectTypeOf<keyof ServerErrorBody>().toEqualTypeOf<"code" | "message">();
  });

  typeTest("takes every outside dependency as a port", () => {
    expectTypeOf<keyof ServerPorts>().toEqualTypeOf<
      "runs" | "secrets" | "passwordHasher" | "coordination" | "requestCounts" | "clock" | "ids"
    >();
  });
});
