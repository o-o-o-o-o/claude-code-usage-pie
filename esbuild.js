const esbuild = require("esbuild");
const { nodeExternalsPlugin } = require("esbuild-node-externals");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const analyze = process.argv.includes("--analyze");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(` ${location.file}:${location.line}:${location.column}:`);
      });
      console.log("[watch] build finished");
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    bundle: true,
    logLevel: "silent",
    plugins: [
      nodeExternalsPlugin(),
      esbuildProblemMatcherPlugin,
    ],
    treeShaking: true,
    define: {
      "process.env.NODE_ENV": production ? '"production"' : '"development"',
    },
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }

  if (analyze) {
    const { visualizer } = require("esbuild-visualizer");
    await esbuild.build({
      ...ctx.initialOptions,
      plugins: [...(ctx.initialOptions.plugins || []), visualizer()],
      outfile: "dist/extension.analyzed.js",
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
