// `snapshot.json` exists only next to the built `worker.js`, where the plugin
// builder writes it; `worker.ts` reads it as a JSON module.
declare module "*/snapshot.json" {
  const snapshot: unknown;
  export = snapshot;
}
