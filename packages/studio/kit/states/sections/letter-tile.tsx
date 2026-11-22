import { LetterTile } from "../../src/letter-tile/letter-tile.tsx";
import type { PartSection } from "../state-table.tsx";

export const letterTileSection: PartSection = {
  id: "letter-tile",
  number: "26.4",
  name: "LetterTile",
  order:
    "kit 26.4 · left to right: an agent, a plugin, a routine, an empty name; lg: a Cloud product",
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
    {
      name: "lg",
      copies: () => (
        <>
          <LetterTile name="Acme support" size="lg" />
          <LetterTile name="" size="lg" />
        </>
      ),
    },
  ],
};
