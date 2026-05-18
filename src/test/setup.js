/*
 * setup.js — Vitest Global Test Setup
 *
 * PURPOSE:
 *   This file runs ONCE before any test file executes. Use it to:
 *   - Set up global mocks that every test needs (e.g., localStorage, fetch).
 *   - Polyfill browser APIs that jsdom does not provide.
 *   - Import any global test utilities or matchers.
 *
 * HOW IT'S REFERENCED:
 *   The "setupFiles" option in vite.config.js points to this file.
 *   Vitest loads it automatically before running tests.
 *
 * WHAT IS JSDOM?
 *   jsdom simulates a browser environment inside Node.js. It provides
 *   window, document, localStorage, and basic DOM APIs. However, some
 *   browser APIs that real browsers implement (like matchMedia, ResizeObserver,
 *   IntersectionObserver) are NOT in jsdom — you need to add mocks for those here.
 *
 * BEGINNER TIP — when to add things here:
 *   If multiple test files all start with the same mock setup (e.g., mocking
 *   window.matchMedia), move that setup here to avoid repetition.
 *   If only ONE test file needs a mock, keep the mock in that test file.
 */

/*
 * localStorage / sessionStorage stub
 *
 * WHY: Node.js 22+ exposes a built-in `localStorage` global, but without the
 * `--localstorage-file` CLI flag it is a broken stub whose methods (getItem,
 * setItem, etc.) are not callable. This causes Zustand stores that read
 * localStorage at module-initialisation time (e.g. authStore) to crash with
 * "localStorage.getItem is not a function" during Vitest test collection.
 *
 * We replace the global with a proper in-memory implementation before any
 * test module is imported. jsdom's own localStorage is also set up this way
 * when the environment initialises, but the stores are evaluated before that
 * happens in some worker configurations.
 */
const _makeStorage = () => {
  const store = Object.create(null)
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    key: (n) => Object.keys(store)[n] ?? null,
    get length() { return Object.keys(store).length },
  }
}

// Only replace if the native methods are missing (Node 22 broken stub).
if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', { value: _makeStorage(), writable: true, configurable: true })
}
if (typeof sessionStorage === 'undefined' || typeof sessionStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'sessionStorage', { value: _makeStorage(), writable: true, configurable: true })
}

/*
 * window.matchMedia mock
 *
 * WHY: jsdom does not implement matchMedia (used by CSS media query JS checks).
 * Some UI components call window.matchMedia() — without this mock they throw:
 *   "TypeError: window.matchMedia is not a function"
 *
 * We stub it with a minimal implementation that always returns false for every
 * media query (simulating a non-matching environment). This is enough for
 * unit tests that don't actually depend on responsive breakpoints.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
