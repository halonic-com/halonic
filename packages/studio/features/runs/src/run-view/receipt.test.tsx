// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { Receipt } from "./receipt.tsx";

afterEach(unmountAll);

verifies("runs.run-view.receipt-summary", () => {
  it("draws the summary line under the receipt's heading", () => {
    const root = render(<Receipt summary="Finished in 2 min · sent nothing" approvals={[]} />);
    expect(root.querySelector("h2")?.textContent).toBe("Receipt");
    expect(root.querySelector("p")?.textContent).toBe("Finished in 2 min · sent nothing");
  });

  it("hides the Approvals section when the run asked for none", () => {
    const root = render(<Receipt summary="Finished in 2 min · sent nothing" approvals={[]} />);
    expect(root.querySelector("h3")).toBeNull();
  });

  it("lists each approval under an Approvals heading", () => {
    const root = render(
      <Receipt
        summary="Finished in 2 min"
        approvals={[
          { callId: "a", text: "gmail_send: approved by you at 10:42" },
          { callId: "b", text: "drive_save: rejected by a rule at 10:43" },
        ]}
      />,
    );
    expect(root.querySelector("h3")?.textContent).toBe("Approvals");
    expect([...root.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "gmail_send: approved by you at 10:42",
      "drive_save: rejected by a rule at 10:43",
    ]);
  });
});
