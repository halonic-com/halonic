// @vitest-environment jsdom

import { type Plugin, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { WhatItAdds } from "../page/what-it-adds.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { Quoted } from "./quoted.tsx";

afterEach(unmountAll);

function plugin(yaml: string): Plugin {
  const parsed = parseFile("plugin", yaml);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

verifies("plugins.plugin-text", () => {
  it("quotes a plugin's own text, isolated so its direction stays inside the quotes", () => {
    const view = render(<Quoted text="תחזית למחר" />);
    expect(view.textContent).toBe("“תחזית למחר”");
    expect(view.querySelector("bdi")?.textContent).toBe("תחזית למחר");
  });

  it("isolates each tool description and title in What it adds", () => {
    const manifest = plugin(`id: weather
version: 1.0.0
sdk: 1
name: מזג אוויר
backend:
  hosts: [api.example.com]
  tools:
    - { name: forecast, description: תחזית, risk: read, untrusted: false }
ui:
  commands:
    - { id: forecast, title: הצג תחזית, tool: forecast }
  cards:
    - { id: today, title: היום, tool: forecast }
  panel: { title: רדאר }`);
    const view = render(<WhatItAdds manifest={manifest} />);
    const isolated = Array.from(view.querySelectorAll("bdi"), (bdi) => bdi.textContent);
    expect(isolated).toEqual(["תחזית", "הצג תחזית", "היום", "רדאר"]);
  });
});
