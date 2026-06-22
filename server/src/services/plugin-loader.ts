/**
 * PluginLoader — discovery, installation, and runtime activation of plugins.
 *
 * This service is the entry point for the plugin system's I/O boundary:
 *
 * 1. **Discovery** — Scans the local plugin directory
 *    (`~/.rudder/plugins/`) and `node_modules` for packages matching
 *    the `rudder-plugin-*` naming convention. Aggregates results with
 *    path-based deduplication.
 *
 * 2. **Installation** — `installPlugin()` downloads from npm (or reads a
 *    local path), validates the manifest, checks capability consistency,
 *    and persists the install record.
 *
 * 3. **Runtime activation** — `activatePlugin()` wires up a loaded plugin
 *    with all runtime services: resolves its entrypoint, builds
 *    capability-gated host handlers, spawns a worker process, syncs job
 *    declarations, registers event subscriptions, and discovers tools.
 *
 * 4. **Shutdown** — `shutdownAll()` gracefully stops all active workers
 *    and unregisters runtime hooks.
 *
 * @see doc/engineering/PLUGIN_RUNTIME_CONTRACT.md — Plugin Discovery
 * @see doc/engineering/PLUGIN_RUNTIME_CONTRACT.md — Package Contract
 * @see doc/engineering/PLUGIN_RUNTIME_CONTRACT.md — Process Model
 */
export * from "./plugin-loader.core.js";
export * from "./plugin-loader.helpers.js";
export * from "./plugin-loader.worker-paths.js";
