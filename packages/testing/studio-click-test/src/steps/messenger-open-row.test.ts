import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { seedNames } from "../test-paperclip.ts";
import { agentChatRow, agentPictureIn, messengerSend, openRowFillOf } from "./messenger-send.ts";

/** The open row's muted fill, as the app draws it in light. */
const rowFill = "rgb(236, 236, 240)";

/**
 * A Messenger whose sent message reaches Paperclip, drawing the agent's picture in its row and
 * header, with the row's and the tile's backgrounds as given; `shown` false is a narrow window.
 */
function studioWithOpenRow(tileFill: string, shown = true): FakeStudio {
  const studio = fakeStudio("Acme");
  Object.assign(studio.context, {
    openShortcut: async (name: string) => {
      studio.windows.set(name, { text: `${seedNames.agent} Chat`, buttons: new Map() });
    },
  });
  Object.assign(studio.context.driver, {
    pressKeys: async () => {
      studio.paperclip.comments.push(studio.typed.join(""));
    },
  });
  for (const xpath of Object.values(agentPictureIn)) studio.elements.set(xpath, 1);
  if (shown) studio.elements.set(agentChatRow, 1);
  studio.backgrounds.set(openRowFillOf.row, rowFill);
  studio.backgrounds.set(openRowFillOf.tile, tileFill);
  return studio;
}

verifies("studio-click-test.messenger-open-row", () => {
  it("passes when the open chat's tile has a fill apart from its row's", async () => {
    const studio = studioWithOpenRow("rgb(255, 255, 255)");
    await expect(messengerSend.run(studio.context)).resolves.toEqual({ passed: true });
  });

  it("fails as TILE_ON_ROW_FILL when the tile has the open row's fill", async () => {
    const studio = studioWithOpenRow(rowFill);
    await expect(messengerSend.run(studio.context)).resolves.toEqual({
      passed: false,
      code: "TILE_ON_ROW_FILL",
      note: `The open chat's row and its picture's tile are both ${rowFill}, so the tile's circle doesn't show.`,
    });
  });

  it("compares nothing in a narrow window, which shows the open chat without the list", async () => {
    const studio = studioWithOpenRow(rowFill, false);
    await expect(messengerSend.run(studio.context)).resolves.toEqual({ passed: true });
  });
});
