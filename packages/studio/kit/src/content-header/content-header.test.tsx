// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { Avatar } from "../avatar/avatar.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { ContentHeader } from "./content-header.tsx";

afterEach(unmountAll);

verifies("kit.content-header", () => {
  it("shows the picture, the title as a heading over its line, and the actions last", () => {
    const { container } = render(
      <ContentHeader
        picture={<Avatar name="Chief" size="header" />}
        title="Chief"
        line="Paperclip · Acme"
        actions={<button type="button">Find</button>}
      />,
    );
    const header = container.querySelector("header") as HTMLElement;
    const heading = header.querySelector("h2") as HTMLElement;

    expect(header.className.split(" ")).toEqual(
      expect.arrayContaining(["border-b", "border-border"]),
    );
    expect(header.firstElementChild?.className.split(" ")).toContain("size-10");
    expect(heading.textContent).toBe("Chief");
    expect(heading.className.split(" ")).toContain("truncate");
    expect(header.querySelector("p")?.textContent).toBe("Paperclip · Acme");
    expect(header.lastElementChild?.textContent).toBe("Find");
  });

  it("shows only the heading beside the picture without a line", () => {
    const { container } = render(<ContentHeader picture={<Avatar name="Ada" />} title="Ada" />);
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Ada");
  });
});
