import { LetterTile } from "../../src/letter-tile/letter-tile.tsx";
import type { PartSection } from "../state-table.tsx";

export const letterTileSection: PartSection = {
  id: "letter-tile",
  number: "26.2",
  name: "LetterTile",
  order: "kit 26.2 · left to right: an agent, a plugin, a routine, an empty name",
  notApplicable: "hover, focus, disabled (decoration, not interactive)",
  rows: [
    {
      name: "Default",
      copies: () => (
        <>
          <LetterTile name="Reporter" />
          <LetterTile name="gmail" />
          <LetterTile name="Weekly sort" />
          <LetterTile name="" />
        </>
      ),
    },
  ],
};
