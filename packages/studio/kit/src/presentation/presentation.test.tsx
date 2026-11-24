// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import {
  NarrowProvider,
  PresentationProvider,
  useNarrow,
  usePresentation,
} from "./presentation.tsx";

afterEach(() => {
  unmountAll();
});

function ShowPresentation() {
  return <p>{usePresentation()}</p>;
}

verifies("kit.presentation", () => {
  it("is desktop without a provider", () => {
    const { container } = render(<ShowPresentation />);
    expect(container.textContent).toBe("desktop");
  });

  it("is what the nearest provider sets", () => {
    const { container } = render(
      <PresentationProvider presentation="desktop">
        <PresentationProvider presentation="phone">
          <ShowPresentation />
        </PresentationProvider>
      </PresentationProvider>,
    );
    expect(container.textContent).toBe("phone");
  });
});

function ShowNarrow() {
  return <p>{useNarrow() ? "narrow" : "wide"}</p>;
}

verifies("kit.narrow", () => {
  it("is wide without a provider", () => {
    const { container } = render(<ShowNarrow />);
    expect(container.textContent).toBe("wide");
  });

  it("is what the nearest provider sets, whatever the presentation", () => {
    const { container } = render(
      <NarrowProvider narrow={false}>
        <NarrowProvider narrow>
          <ShowNarrow />
          <ShowPresentation />
        </NarrowProvider>
      </NarrowProvider>,
    );
    expect(container.textContent).toBe("narrowdesktop");
  });
});
