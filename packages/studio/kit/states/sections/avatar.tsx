import { Avatar } from "../../src/avatar/avatar.tsx";
import type { PartSection } from "../state-table.tsx";

export const avatarSection: PartSection = {
  id: "avatar",
  number: "26.6",
  name: "Avatar",
  order: "kit 26.6 · left to right: two words, one word, an empty name",
  notApplicable: "hover, focus, disabled (decoration, not interactive)",
  rows: [
    {
      name: "Default",
      copies: () => (
        <>
          <Avatar name="Sofia Marin" />
          <Avatar name="Sofia" />
          <Avatar name="" />
        </>
      ),
    },
  ],
};
