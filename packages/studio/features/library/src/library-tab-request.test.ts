import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { requestLibraryTab, takeLibraryTabRequests } from "./library-tab-request.ts";

verifies("library.library-place", () => {
  it("keeps a request made before the page is drawn until the page takes it", () => {
    requestLibraryTab("connector");
    const onRequest = vi.fn();
    const stop = takeLibraryTabRequests(onRequest);
    expect(onRequest).toHaveBeenCalledExactlyOnceWith("connector");
    stop();
  });

  it("hands a request to the page that is drawn, once", () => {
    const onRequest = vi.fn();
    const stop = takeLibraryTabRequests(onRequest);
    requestLibraryTab("knowledge");
    expect(onRequest).toHaveBeenCalledExactlyOnceWith("knowledge");
    stop();
    requestLibraryTab("skill");
    expect(onRequest).toHaveBeenCalledOnce();
    const later = vi.fn();
    takeLibraryTabRequests(later)();
    expect(later).toHaveBeenCalledExactlyOnceWith("skill");
  });
});
