/** The words of the New skill dialog: flow-library 3.2 and microcopy 11.2. */
export const newSkillWords = {
  title: "New skill",
  name: "Name",
  nameMissing: "Give it a name.",
  hub: "Hub",
  description: "When to use it",
  descriptionMissing: "Say when an agent should use this skill.",
  create: "Create",
  creating: "Creating…",
  retry: "Try again",
  folder: (folder: string) => `Folder: ${folder}`,
  failed: (reason: string) => `Couldn't create the skill: ${reason}.`,
} as const;
