// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// GitHub Pages project sites are served under the repository path.
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const base = isGitHubPages ? "/direct-link-transfer/" : "/";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Build a fully static site for GitHub Pages; otherwise keep the default
  // cloudflare-module preset so Lovable's own deploy path keeps working.
  nitro: isGitHubPages ? { preset: "static" } : undefined,
  vite: {
    base,
  },
});
