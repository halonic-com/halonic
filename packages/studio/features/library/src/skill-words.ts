/** The words of the skill page: flow-library 5.1 and microcopy. */
export const skillWords = {
  kindName: "skill",
  place: "Library",
  name: "Name",
  nameKept: "A skill needs a name, so the old one is kept.",
  description: "When to use it",
  descriptionHint: "Agents read this to decide when to use the skill.",
  descriptionKept: "A skill needs “When to use it”, so the old text is kept.",
  instructions: "Instructions (Markdown)",
  otherHeader: "Also in the header",
  otherHeaderHint: "Kept as they are. Edit them in the file.",
  files: "Files in this skill",
  notUsed: "No agent uses this skill yet. Add it under an agent's Tools.",
  loading: "Loading the skill",
  couldntLoad: "Couldn't load the skill",
  tryAgain: "Try again",
  unreadable: "This skill's file can't be read here. Open it as a file to fix its header.",
} as const;
