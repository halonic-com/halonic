import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { requestFilesReveal, takeFilesRevealRequests, workspacePath } from "./reveal-request.ts";

// A request no test took would reach the next test's listener.
afterEach(() => takeFilesRevealRequests(() => "shown")());

verifies("files.tree.reveal-request", () => {
  it("reads a path from the workspace folder, dropping . and empty segments", () => {
    expect(workspacePath("hubs/reports/docs")).toBe("hubs/reports/docs");
    expect(workspacePath("./hubs//reports/docs/")).toBe("hubs/reports/docs");
    expect(workspacePath("hubs\\reports")).toBe("hubs/reports");
    expect(workspacePath("")).toBe("");
  });

  it("names nothing for a path that could point outside the workspace folder", () => {
    for (const outside of ["/etc", "\\work", "C:work", "c:/work", "..", "hubs/../../x", "a/.."])
      expect(workspacePath(outside), outside).toBeUndefined();
    expect(workspacePath("hubs/..notes")).toBe("hubs/..notes");
  });

  it("asks for nothing with a path outside the workspace folder", () => {
    requestFilesReveal("/etc");
    requestFilesReveal("hubs/../../x");
    const onRequest = vi.fn();
    takeFilesRevealRequests(onRequest)();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("keeps the latest request made before the tree is listed until the tree takes it, once", () => {
    requestFilesReveal("hubs/reports");
    requestFilesReveal("./hubs/sales");
    const onRequest = vi.fn();
    const stop = takeFilesRevealRequests(onRequest);
    expect(onRequest).toHaveBeenCalledExactlyOnceWith("hubs/sales");
    stop();
    const later = vi.fn();
    takeFilesRevealRequests(later)();
    expect(later).not.toHaveBeenCalled();
  });

  it("answers with what the tree did, and drops a request outside the folder or replaced", async () => {
    const outside = requestFilesReveal("/etc");
    const replaced = requestFilesReveal("hubs/reports");
    const latest = requestFilesReveal("docs");
    takeFilesRevealRequests(() => "nearest")();
    expect(await outside).toBe("dropped");
    expect(await replaced).toBe("dropped");
    expect(await latest).toBe("nearest");
  });

  it("hands a later request to the tree that is listed", () => {
    const onRequest = vi.fn();
    const stop = takeFilesRevealRequests(onRequest);
    requestFilesReveal("hubs/sales/docs");
    expect(onRequest).toHaveBeenCalledExactlyOnceWith("hubs/sales/docs");
    stop();
  });
});
