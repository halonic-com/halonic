import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

/**
 * The `seats` plugin's worker. The host starts it as `worker.js` in the
 * folder `pnpm run build:seats-plugin` writes (`dist/seats/`), after it has
 * run the plugin's migrations. It has nothing to answer yet: the board-only
 * routes and the `seats.read` job come in the next pull requests.
 */
export const plugin = definePlugin({
  async setup() {
    // Nothing to register yet.
  },
});

// biome-ignore lint/style/noDefaultExport: the plugin host reads the plugin from the default export.
export default plugin;

runWorker(plugin, import.meta.url);
