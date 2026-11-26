import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { halonicFrame, type RunnerFrame } from "../frames.ts";
import { BridgedHttp, type ResponseFrame } from "./bridged-http.ts";

/** The head frame Halonic sends for a reply with status 600 to request 0. */
const busyHead: ResponseFrame = {
  type: "head",
  id: 0,
  status: 600,
  statusText: "Busy",
  headers: [],
  url: "https://api.example.com/data",
  hasBody: false,
};

verifies("integration-runner.odd-status", () => {
  it("takes a head frame with a status above 599", () => {
    expect(halonicFrame.safeParse(busyHead).success).toBe(true);
  });

  it("hands the integration a reply with status 600 and `ok` false", async () => {
    const sent: RunnerFrame[] = [];
    const http = new BridgedHttp(
      (frame) => sent.push(frame),
      () => 1,
    );
    const reply = http.fetch("https://api.example.com/data");
    http.take(busyHead);

    const response = await reply;
    expect(response.status).toBe(600);
    expect(response.ok).toBe(false);
    expect(response.statusText).toBe("Busy");
    expect(response.url).toBe("https://api.example.com/data");
  });
});
