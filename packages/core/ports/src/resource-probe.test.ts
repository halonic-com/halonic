import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { FolderSize, ProcessUsage, ResourceProbe } from "./resource-probe.ts";

verifies("ports.resource-probe", () => {
  typeTest("has one method per source", () => {
    expectTypeOf<keyof ResourceProbe>().toEqualTypeOf<
      "engineMemory" | "childProcesses" | "folderSize" | "freeDisk"
    >();
    expectTypeOf<ResourceProbe["engineMemory"]>().toEqualTypeOf<() => Promise<number>>();
    expectTypeOf<ResourceProbe["childProcesses"]>().toEqualTypeOf<
      () => Promise<readonly ProcessUsage[]>
    >();
    expectTypeOf<ResourceProbe["folderSize"]>().toEqualTypeOf<
      (path: string) => Promise<FolderSize>
    >();
    expectTypeOf<ResourceProbe["freeDisk"]>().toEqualTypeOf<(path: string) => Promise<number>>();
  });

  typeTest("names each process with its id and memory", () => {
    expectTypeOf<ProcessUsage>().toEqualTypeOf<{
      readonly pid: number;
      readonly name: string;
      readonly memoryBytes: number;
    }>();
  });

  typeTest("says whether a folder's size is complete", () => {
    // @ts-expect-error: `complete` is required, so a lower bound can't pass for the full size
    const size: FolderSize = { bytes: 42 };
    expectTypeOf(size).toEqualTypeOf<FolderSize>();
  });
});
