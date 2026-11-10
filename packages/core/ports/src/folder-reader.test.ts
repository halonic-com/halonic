import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { FolderEntry, FolderReader } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

verifies("ports.folder-reader", () => {
  typeTest("only reads: entries, bytes and real locations", () => {
    expectTypeOf<keyof FolderReader>().toEqualTypeOf<
      "location" | "entries" | "read" | "locationOf"
    >();
    expectTypeOf<FolderReader["read"]>().parameters.toEqualTypeOf<[path: string]>();
    expectTypeOf<FolderReader["read"]>().returns.toEqualTypeOf<Promise<Uint8Array | null>>();
    expectTypeOf<FolderReader["locationOf"]>().returns.toEqualTypeOf<Promise<string | null>>();
    expectTypeOf<FolderReader["entries"]>().returns.toEqualTypeOf<Promise<FolderEntry[]>>();
  });

  it("gives a size to a file and to nothing else", () => {
    const file: FolderEntry = { path: "acme/plugin.yaml", kind: "file", size: 12 };
    // @ts-expect-error: a file's size is what the plugin service checks against its limit
    const unsized: FolderEntry = { path: "acme/plugin.yaml", kind: "file" };
    // @ts-expect-error: only a file has a size
    const sizedFolder: FolderEntry = { path: "acme", kind: "folder", size: 0 };
    const link: FolderEntry = { path: "acme/latest", kind: "link" };
    expect([file, unsized, sizedFolder, link]).toHaveLength(4);
  });
});
