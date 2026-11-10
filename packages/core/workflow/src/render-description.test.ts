import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { renderDescription } from "./template.ts";

/** Acme's `review` step description, as written in `examples/acme`. */
const acmeReview =
  "Approve this reply?\n{{context.reply}}\n\nSample: approving finishes the run. Nothing is sent.";

verifies("workflow.render-description", () => {
  it("gives the first line as the title and the filled-in rest as the body", () => {
    expect(renderDescription(acmeReview, { context: { reply: "Hello Ada" } })).toEqual({
      title: "Approve this reply?",
      body: "Hello Ada\n\nSample: approving finishes the run. Nothing is sent.",
    });
  });

  it("keeps a filled-in value exactly as written, links, images and HTML included", () => {
    const reply =
      "See [our site](https://example.com) ![logo](https://example.com/a.png) <script>alert(1)</script>";
    const { title, body } = renderDescription(acmeReview, { context: { reply } });
    expect(title).toBe("Approve this reply?");
    expect(body.split("\n")[0]).toBe(reply);
  });

  it("leaves no placeholder behind when the value is missing", () => {
    const { title, body } = renderDescription(acmeReview, { context: {} });
    expect(title).toBe("Approve this reply?");
    expect(body).toBe("Sample: approving finishes the run. Nothing is sent.");
    expect(
      renderDescription("Check {{context.order}}\nA\n{{context.note}}\nB", { context: {} }),
    ).toEqual({
      title: "Check",
      body: "A\n\nB",
    });
  });

  it("keeps the title on one line when a value in it has line breaks", () => {
    const scope = { context: { order: "A-1\nA-2" } };
    expect(renderDescription("Check order {{context.order}}", scope)).toEqual({
      title: "Check order A-1 A-2",
      body: "",
    });
  });

  it("gives an empty body for a one-line description, and an empty title for an empty one", () => {
    expect(renderDescription("Read the email", {})).toEqual({ title: "Read the email", body: "" });
    expect(renderDescription("", {})).toEqual({ title: "", body: "" });
    expect(renderDescription("\nOnly a body", {})).toEqual({ title: "", body: "Only a body" });
  });
});
