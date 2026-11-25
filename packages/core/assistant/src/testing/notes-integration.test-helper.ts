// A local integration the model could write for a fake notes service at
// api.notes.example.com: its permission sheet, its code and the connector
// file that switches it on, as the Build chat's integration tests propose
// them. `search_notes` only reads; `add_note` writes.

/** Where each of the three files goes. */
export const notesPaths = {
  sheet: "integrations/notes/integration.yaml",
  code: "integrations/notes/backend/index.js",
  connector: "library/connectors/notes.connector.yaml",
} as const;

export const notesSheet = `id: notes
version: 1.0.0
kit: 1
provides: [connector]
hosts:
  - api.notes.example.com
secrets:
  notes-key:
    purpose: The API key of your notes account.
    hosts: [api.notes.example.com]
    as: bearer
tools:
  - name: search_notes
    description: Searches the notes. Returns the id and title of each note found.
    arguments:
      query: Words to search for.
    risk: read
    untrusted: true
  - name: add_note
    description: Adds a note to the account.
    arguments:
      text: The note's text.
    risk: write
    untrusted: false
`;

export const notesCode = `const api = "https://api.notes.example.com/v1";
const auth = { secret: "notes-key", as: "bearer" };

const searchNotes = {
  name: "search_notes",
  description: "Searches the notes. Returns the id and title of each note found.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Words to search for." } },
    required: ["query"],
    additionalProperties: false,
  },
  risk: "read",
  untrusted: true,
};

const addNote = {
  name: "add_note",
  description: "Adds a note to the account.",
  parameters: {
    type: "object",
    properties: { text: { type: "string", description: "The note's text." } },
    required: ["text"],
    additionalProperties: false,
  },
  risk: "write",
  untrusted: false,
};

export default {
  name: "notes",
  version: "1.0.0",
  tools: [searchNotes, addNote],
  connect(host) {
    return {
      async callTool(name, args, signal) {
        if (name === "search_notes") {
          const url = \`\${api}/notes?q=\${encodeURIComponent(args.query)}\`;
          const response = await host.http.fetch(url, { auth, signal });
          const { notes } = await response.json();
          return JSON.stringify(notes.slice(0, 20).map(({ id, title }) => ({ id, title })));
        }
        const body = JSON.stringify({ text: args.text });
        const response = await host.http.fetch(\`\${api}/notes\`, { method: "POST", body, auth, signal });
        const { id } = await response.json();
        return JSON.stringify({ id });
      },
    };
  },
};
`;

export const notesConnector = `id: notes
name: Notes
transport:
  integration:
    folder: notes
`;
