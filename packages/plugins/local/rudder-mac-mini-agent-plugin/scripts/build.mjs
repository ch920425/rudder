import esbuild from "esbuild";

const common = {
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: true,
};

await esbuild.build({
  entryPoints: ["src/manifest.ts"],
  outfile: "dist/manifest.js",
  bundle: false,
  ...common,
});

await esbuild.build({
  entryPoints: ["src/worker.ts"],
  outfile: "dist/worker.js",
  bundle: true,
  ...common,
});

await esbuild.build({
  entryPoints: ["src/client.ts"],
  outfile: "dist/client.js",
  bundle: true,
  ...common,
});

await esbuild.build({
  entryPoints: ["src/token-cache.ts"],
  outfile: "dist/token-cache.js",
  bundle: false,
  ...common,
});
