// A for-each workflow for Acme's support hub, for the checks of C340 (HAL-14303): each test
// writes it with one text changed.

/** Where the workflow goes in a copy of Acme. */
export const announceFile = "hubs/support/workflows/announce.workflow.yaml";

/** A sound for-each workflow on Acme's writer; each case changes one text in it. */
export const announceWorkflow = `id: announce
name: Announce
initial: plan
states:
  plan:
    agent: writer
    output: topics
    on:
      - to: each
  each:
    type: foreach
    items: "{{context.topics}}"
    as: topic
    agent: writer
    input: Announce {{topic}}
    output: announcements
    on:
      - to: done
  done:
    type: final
`;
