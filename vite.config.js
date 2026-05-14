import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

/*
 * vite.config.js — Vite build and dev-server configuration for ConnectHub frontend.
 *
 * WHAT IS VITE?
 *   Vite is a build tool and development server for modern JavaScript apps.
 *   It serves files with native ES Modules during development (blazing fast —
 *   no bundling step), and uses Rollup to produce an optimised bundle for production.
 *
 * SECTIONS IN THIS CONFIG:
 *   plugins  — adds the React plugin which handles JSX → JS transformation and
 *              React Fast Refresh (hot-reload that preserves component state).
 *   server   — dev server settings (port, proxy).
 *   test     — Vitest unit test configuration (separate from Playwright E2E tests).
 *
 * PROXY EXPLAINED:
 *   During local development the frontend runs at http://localhost:5173 and the
 *   API Gateway runs at http://localhost:8080. The proxy rewrites requests so
 *   that fetch("/api/auth/login") is transparently forwarded to
 *   http://localhost:8080/api/auth/login without triggering browser CORS errors.
 *   In production (Vercel), these are handled differently via environment variables.
 *
 * UNIT TESTS (Vitest):
 *   npm run test:unit          → runs all *.test.js files once and exits
 *   npm run test:unit:watch    → re-runs on file changes (great during development)
 *   npm run test:unit:coverage → produces a coverage report in ./coverage/
 *
 *   Vitest is configured to use jsdom as the test environment, which simulates a
 *   browser (window, document, localStorage, etc.) without launching a real browser.
 *   This is perfect for testing utility functions, stores, and pure logic.
 *   For full end-to-end UI tests use Playwright (npm run test).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:8080",
        ws: true,
        changeOrigin: true,
      },
      "/oauth2/authorization": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/login/oauth2": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },

  build: {
    // Raise the chunk-size warning threshold — our vendor chunks are intentionally larger
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /*
         * Manual chunk splitting — keeps vendor libraries in separate, long-cached
         * files so a code change in your app does not bust the React/STOMP/date-fns cache.
         */
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-stomp': ['@stomp/stompjs', 'sockjs-client'],
          'vendor-ui': ['lucide-react', 'date-fns', 'emoji-picker-react'],
        },
      },
    },
  },

  /*
   * test — Vitest configuration block.
   *
   * environment: "jsdom"
   *   Vitest runs in Node.js by default, which has no window/document/fetch.
   *   jsdom provides a simulated browser environment so tests that reference
   *   window.dispatchEvent, window.fetch, localStorage, etc. work correctly.
   *
   * globals: true
   *   Makes test(), describe(), expect(), vi, etc. available globally without
   *   needing to import them in every test file (same ergonomics as Jest).
   *
   * setupFiles
   *   A list of files that run once before the test suite starts.
   *   src/test/setup.js is where you put global mocks and polyfills
   *   (e.g., mocking matchMedia for components that use it).
   *
   * coverage
   *   provider: "v8" uses Node's built-in V8 coverage for speed.
   *   reporter: generates text output in the terminal + an HTML report.
   *   exclude: we skip coverage for node_modules, test files themselves,
   *            vite config, and Playwright E2E tests.
   */
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.js"],
    // Only pick up Vitest unit tests — exclude Playwright E2E specs
    include: ["src/**/*.test.{js,jsx,ts,tsx}"],
    exclude: ["node_modules/**", "tests/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "node_modules/**",
        "**/*.test.js",
        "vite.config.js",
        "tests/**",
        "src/test/**",
      ],
    },
  },
})
