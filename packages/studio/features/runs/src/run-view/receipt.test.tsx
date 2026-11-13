// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { Receipt } from "./receipt.tsx";

afterEach(unmountAll);

verifies("runs.run-view.receipt-summary", () => {
  it("draws the summary line under the receipt's heading", () => {
    const root = render(<Receipt summary="Finished in 2 min · sent nothing" />);
    expect(root.querySelector("h2")?.textContent).toBe("Receipt");
    expect(root.querySelector("p")?.textContent).toBe("Finished in 2 min · sent nothing");
  });
});
