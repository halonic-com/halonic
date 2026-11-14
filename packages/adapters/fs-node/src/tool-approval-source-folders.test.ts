import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { hash } from "./tool-approval-files.test-helper.ts";

/**
 * Each source's folder as `FileToolApprovalStore` names it. The Studio
 * shell's Rust code (`halonic-profile`, `tests/golden.rs`) is checked against
 * the same cases, so both name one folder.
 */
const cases = [
  {
    location: "/workspaces/acme",
    source: "notes",
    folder: "598bee61ee995ab2430bab8a986cf4088f0f2bfd7ceb0801f9d4e1606bd1853b",
  },
  {
    location: "/workspaces/acme",
    source: "docs",
    folder: "d2e0367df032e0b4b1b3627c040398c5e499c4922b89fac925de869f7b466daa",
  },
  {
    location: '/workspaces/acme corp/"quoted"',
    source: "back\\slash",
    folder: "0e24a9db7069b33259e8c8e3c563c99b9fec6c444c58708c66239073c2f153d1",
  },
  {
    location: "/workspaces/ünï/日本語/😀",
    source: "tab\tnew\nline",
    folder: "43f61f52c3cad41428f4ce30f92ef888084ca8ca413d40de1a417e851d60d368",
  },
  {
    location: "/workspaces/acme",
    source: "ctrl\u0001\u001f\u007f\u2028 end",
    folder: "e1a7c2af4be3f819adab2663ce45202d8366c06e5deeca57954b6f0b5abd2028",
  },
  {
    location: "<drive>\\workspaces\\acme",
    source: "notes",
    folder: "1beb4f517c161304795c68b7f2d49c5929b328a33136722d04d07020ce4b35b5",
  },
];

verifies("fs-node.tool-approval-files", () => {
  it("names a source's folder as the Studio shell does, for every case", () => {
    for (const { location, source, folder } of cases) {
      expect(hash(JSON.stringify([location, source]))).toBe(folder);
    }
  });
});
