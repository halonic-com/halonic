import { ProposalFolders } from "@halonicjs/app";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { RunProposalFolders } from "./proposal-folders.ts";

describe("RunProposalFolders", () => {
  it("is what the app's ProposalFolders gives the host", () => {
    expectTypeOf<ProposalFolders>().toExtend<RunProposalFolders>();
    expect(typeof ProposalFolders.prototype.open).toBe("function");
  });
});
