/**
 * Builds the Vercel deployment with the Build Output API (https://vercel.com/docs/build-output-api):
 *   .vercel/output/static            the Vite site
 *   .vercel/output/functions/api.func one Node.js function, bundled by Bun into a single file
 *   .vercel/output/config.json       routing: /api/* → function, static files, SPA fallback
 *
 * Run from packages/web:  bun scripts/vercel-build.ts
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, ".vercel/output");
const fn = path.join(out, "functions/api.func");

const vite = Bun.spawnSync(["bun", "x", "vite", "build"], { cwd: root, stdout: "inherit", stderr: "inherit" });
if (vite.exitCode !== 0) process.exit(vite.exitCode);

await rm(out, { recursive: true, force: true });
await mkdir(fn, { recursive: true });
await cp(path.join(root, "dist"), path.join(out, "static"), { recursive: true });

// The libsql client's Node entry imports the native sqlite driver at module load. Functions have
// no persistent disk anyway, so the API always talks to a remote (Turso / libsql) database over
// HTTP: resolve the package to its web build and leave the native driver out of the bundle.
const bundle = await Bun.build({
  entrypoints: [path.join(root, "src/vercel-entry.ts")],
  outdir: fn,
  naming: "index.mjs",
  target: "node",
  format: "esm",
  minify: false,
  sourcemap: "none",
  external: ["bufferutil", "utf-8-validate"],
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "libsql-web-client",
      setup(build) {
        build.onResolve({ filter: /^@libsql\/client$/ }, () => ({ path: Bun.resolveSync("@libsql/client/web", root) }));
      },
    },
  ],
});
if (!bundle.success) {
  for (const log of bundle.logs) console.error(log);
  process.exit(1);
}

await writeFile(
  path.join(fn, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60, memory: 1024 }, null, 2),
);
await writeFile(path.join(fn, "package.json"), JSON.stringify({ type: "module" }));

await writeFile(
  path.join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/assets/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "^/redeem/(.*)$", headers: { "cache-control": "public, max-age=86400" }, continue: true },
        { src: "^/api(?:/.*)?$", dest: "/api" },
        { handle: "filesystem" },
        // Missing hashed assets stay 404 rather than becoming an immutable-cached copy of the page.
        { src: "^/assets/.*$", status: 404 },
        { src: "^/(.*)$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

const size = Bun.file(path.join(fn, "index.mjs")).size;
console.log(`[vercel-build] function bundle ${(size / 1024).toFixed(0)} kB, output at ${path.relative(root, out)}`);
