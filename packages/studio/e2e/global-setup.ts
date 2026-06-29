import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

/**
 * Rebuild @actalk/inkos-core before E2E tests start.
 *
 * The E2E API server (tsx watch src/api/index.ts) imports core via the pnpm
 * workspace symlink, which resolves to packages/core/dist/index.js — the
 * compiled output, not the TypeScript source.  If dist/ is stale the server
 * runs old code regardless of what the TypeScript sources say, causing
 * otherwise-correct agent logic (e.g. the terminalToolResultTail guard) to be
 * silently absent at runtime.
 *
 * Rebuilding here ensures the dist is always fresh before tests run.
 */
export default function globalSetup(): void {
  const thisFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(thisFile), "../../../../");
  execSync("pnpm --filter @actalk/inkos-core build", {
    cwd: repoRoot,
    stdio: "inherit",
  });
}
