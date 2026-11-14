import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  definitionWriteMethods,
  presentMethods,
  refusedPortNames,
  secretWriteMethods,
  wiredRefusedPorts,
} from "./target-capabilities.ts";

verifies("contracts.target-capabilities", () => {
  it("names a refused port the target wired", () => {
    expect(wiredRefusedPorts({ blobs: {}, vcs: {}, sandbox: {} })).toEqual(["sandbox", "vcs"]);
  });

  it("finds nothing when no refused port is wired", () => {
    expect(wiredRefusedPorts({ blobs: {}, records: {} })).toEqual([]);
  });

  it("names a write method that definitions have, own or inherited", () => {
    class Base {
      remove(): void {}
    }
    class Definitions extends Base {
      write(): void {}
      list(): void {}
    }
    expect(presentMethods(new Definitions(), definitionWriteMethods)).toEqual(["write", "remove"]);
  });

  it("names a write method that secrets have", () => {
    expect(presentMethods({ get() {}, set() {} }, secretWriteMethods)).toEqual(["set"]);
    expect(presentMethods({ get() {} }, secretWriteMethods)).toEqual([]);
  });

  it("refuses a port for each capability the ADR says Cloudflare lacks", () => {
    expect(refusedPortNames.map(({ capability }) => capability)).toEqual(["startPrograms", "git"]);
  });
});
