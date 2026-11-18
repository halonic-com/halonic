/** The Rules' words (flow-routines 3.7, microcopy 12.3). */
export const rulesWords = {
  label: "Rules",
  overlap: "If the previous run is still busy",
  overlapOptions: {
    skip: "Skip this run",
    queue: "Queue it until the previous one is done",
    allow: "Start anyway",
  },
  catchUp: "Missed while closed or asleep",
  catchUpOptions: {
    last: "Run once to catch up",
    all: "Run every missed time",
    none: "Skip missed times",
  },
  couldntSave: (reason: string) => `Couldn't save the change. ${reason}`,
} as const;
