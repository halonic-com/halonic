// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSays, Receipt } from "./receipt.tsx";

afterEach(unmountAll);

verifies("runs.run-view.receipt-summary", () => {
  it("draws the summary line under the receipt's heading", () => {
    const root = render(<Receipt summary="Finished in 2 min · asked you once" approvals={[]} />);
    expect(root.querySelector("h2")?.textContent).toBe("Receipt");
    expect(root.querySelector("p")?.textContent).toBe("Finished in 2 min · asked you once");
  });

  it("hides the Approvals section when the run asked for none", () => {
    const root = render(<Receipt summary="Finished in 2 min · asked you once" approvals={[]} />);
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

verifies("runs.run-view.receipt-messages-read", () => {
  it("draws Messages and Read sections with their lines", () => {
    const root = render(
      <Receipt
        summary="Finished in 2 min"
        approvals={[]}
        messages={["Drafted 1 email", "Sent 2 emails"]}
        reads={["Read 3 emails"]}
      />,
    );
    expect([...root.querySelectorAll("h3")].map((heading) => heading.textContent)).toEqual([
      "Messages",
      "Read",
    ]);
    expect([...root.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "Drafted 1 email",
      "Sent 2 emails",
      "Read 3 emails",
    ]);
  });

  it("leaves out sections without lines", () => {
    const root = render(<Receipt summary="Finished in 2 min" approvals={[]} />);
    expect(root.querySelector("h3")).toBeNull();
  });
});

verifies("runs.run-view.receipt-items", () => {
  it("draws the Items section first, and leaves it out with no lines", () => {
    const root = render(
      <Receipt
        summary="Finished in 1 min"
        approvals={[]}
        items={["Created 1 file: weekly-report.md"]}
        reads={["Read 12 emails"]}
      />,
    );
    expect([...root.querySelectorAll("h3")].map((heading) => heading.textContent)).toEqual([
      "Items",
      "Read",
    ]);
    expect(root.querySelector("li")?.textContent).toBe("Created 1 file: weekly-report.md");
    expect(render(<Receipt summary="Finished" approvals={[]} />).querySelector("h3")).toBeNull();
  });
});

verifies("runs.run-view.agent-says", () => {
  it("draws the agent's words as plain text in a dashed, named frame", () => {
    const text =
      "This week: 12 emails.\n![x](https://example.com/x.png) [link](https://example.com)";
    const root = render(<AgentSays text={text} />);
    const frame = root.querySelector("section");
    expect(frame?.classList.contains("border-dashed")).toBe(true);
    expect(frame?.getAttribute("aria-labelledby")).toBe("run-agent-says");
    expect(root.querySelector("h2")?.textContent).toBe(
      "What the agent says it did (its own words, not checked)",
    );
    expect(root.querySelector("p")?.textContent).toBe(text);
    expect(root.querySelector("img, a")).toBeNull();
  });
});

verifies("runs.run-view.receipt-models-cost", () => {
  it("draws a Models and cost section, and leaves it out with no lines", () => {
    const root = render(
      <Receipt
        summary="Finished"
        approvals={[]}
        models={["sonnet · 1 call", "Estimated cost €0.01"]}
      />,
    );
    expect(root.querySelector("h3")?.textContent).toBe("Models and cost");
    expect([...root.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "sonnet · 1 call",
      "Estimated cost €0.01",
    ]);
    expect(render(<Receipt summary="Finished" approvals={[]} />).querySelector("h3")).toBeNull();
  });
});
