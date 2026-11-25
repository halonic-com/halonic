/** A workflow file, imported as its text: esbuild's text loader in the bundle, a Vite transform in the tests. */
declare module "*.workflow.yaml" {
  const text: string;
  // biome-ignore lint/style/noDefaultExport: a text import has only a default export.
  export default text;
}
