import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { listing } from "../test-support/sidebar.ts";
import { filteredListing } from "./tree-filter.ts";

const acme = listing(
  ["src/checkout/refunds.ts", "src/checkout/orders.ts", "models.yaml", "README.md"],
  new Map([
    ["src/checkout/refunds.ts", { errors: 1 }],
    ["models.yaml", { warnings: 2 }],
    ["README.md", { outside: true }],
  ]),
);

verifies("files.code-list-chips", () => {
  it("lists every file for All, as the same listing", () => {
    expect(filteredListing(acme, "all")).toBe(acme);
  });

  it("lists only the files with an error or a warning for Problems, with their marks", () => {
    const problems = filteredListing(acme, "problems");
    expect(problems.paths).toEqual(["src/checkout/refunds.ts", "models.yaml"]);
    expect(problems.marks).toBe(acme.marks);
  });
});
