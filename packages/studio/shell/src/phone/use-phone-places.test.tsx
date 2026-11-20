// @vitest-environment jsdom

import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { type PhonePlaces, usePhonePlaces } from "./use-phone-places.ts";

afterEach(unmountAll);

it("keeps a renamed page's memory, as it is still the same page", () => {
  let places: PhonePlaces | undefined;
  function Probe() {
    places = usePhonePlaces();
    return null;
  }
  render(<Probe />);
  act(() => places?.openIn("more", { key: "workflow/reply", title: "Reply" }));
  const memory = places?.memory;
  if (memory !== undefined) memory.scroll = 120;

  act(() => places?.retitle((location) => (location.key === "workflow/reply" ? "Answer" : undefined)));

  expect(places?.page.location.title).toBe("Answer");
  expect(places?.memory).toBe(memory);
  expect(places?.memory.scroll).toBe(120);
});
