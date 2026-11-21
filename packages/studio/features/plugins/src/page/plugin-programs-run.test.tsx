// @vitest-environment jsdom

import { type Plugin, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { weather } from "../test-support/plugins.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { ProgramsRun } from "../trust/trust-text.ts";
import { ReviewPluginDialog } from "./review-plugin-dialog.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

function plugin(yaml: string): Plugin {
  const parsed = parseFile("plugin", yaml);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

const radar = plugin(`id: weather
version: 1.2.0
sdk: 1
name: Weather
localTools:
  - id: radar
    start: { package: { runner: npx, name: weather-mcp, version: 1.2.3 } }
    network: [radar.example.com]
    tools:
      - { name: radar, description: The radar., risk: read, untrusted: false }`);

const cantStart = "Doesn't start on this computer: the sandbox can't start here.";

/** Opens Review with the app's answer to whether programs can run, and how many times it was asked. */
async function review(programs: (() => Promise<ProgramsRun>) | undefined) {
  render(
    <ReviewPluginDialog
      plugin={weather("not-trusted")}
      manifest={radar}
      trust={async () => {}}
      programs={programs}
      onClose={() => {}}
    />,
  );
  await act(async () => {});
}

function dialogText(): string {
  return document.querySelector("dialog")?.textContent ?? "";
}

verifies("plugins.plugin-trust-program-rows", () => {
  it("reads whether programs can run when Review opens, and says they can't start here", async () => {
    let asked = 0;
    await review(async () => {
      asked += 1;
      return "sandbox-unavailable";
    });

    expect(asked).toBe(1);
    expect(dialogText()).toContain(cantStart);
  });

  it("keeps the line that holds either way when the app can't say", async () => {
    await review(async () => {
      throw new Error("acme host gone");
    });

    expect(dialogText()).not.toContain(cantStart);
    expect(dialogText()).toContain("Trust Weather?");
  });
});
