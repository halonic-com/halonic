import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestFolders } from "../test-folders.ts";
import { fakeOldRepo } from "./fake-old-repo.ts";

// The test starts git processes, which can take longer than 5 s on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

const folders = new TestFolders();
afterEach(() => folders.cleanUp());

describe("fakeOldRepo", () => {
  it("builds its template without git's background maintenance, which changes .git/objects while a test copies it", () => {
    const trace = join(folders.make(), "git-trace.log");
    vi.stubEnv("GIT_TRACE", trace);
    // A variant no other test asks for, so this call builds a new template.
    fakeOldRepo(folders, ["WorkflowTest", "Routine"]);
    const log = readFileSync(trace, "utf8");
    expect(log).toContain("commit");
    expect(log).not.toMatch(/run_command: git (maintenance run|gc) --auto/);
  });
});
