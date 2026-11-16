import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { requestNewConnector, takeNewConnectorRequests } from "./new-connector-request.ts";

verifies("library.new-connector", () => {
  it("keeps a request made before the Library is drawn until it takes it", () => {
    requestNewConnector({ name: "drive", way: "google" });
    const onRequest = vi.fn();
    const stop = takeNewConnectorRequests(onRequest);
    expect(onRequest).toHaveBeenCalledExactlyOnceWith({ name: "drive", way: "google" });
    stop();
  });

  it("hands a request to the Library that is drawn, once", () => {
    const onRequest = vi.fn();
    const stop = takeNewConnectorRequests(onRequest);
    requestNewConnector({ name: "notes" });
    expect(onRequest).toHaveBeenCalledExactlyOnceWith({ name: "notes" });
    stop();
    requestNewConnector({});
    expect(onRequest).toHaveBeenCalledOnce();
    takeNewConnectorRequests(() => {})();
  });
});
