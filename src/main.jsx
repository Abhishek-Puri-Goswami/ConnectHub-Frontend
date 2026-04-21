/*
 * main.jsx — Application Entry Point
 *
 * This is the very first file React executes when the app loads in the browser.
 * It does three things before rendering anything:
 *
 * 1. Patches the global `fetch` function to intercept HTTP 429 (Too Many Requests)
 *    responses globally. This means even old code paths that do not use the
 *    `useRateLimit` hook will still show the rate-limit toast to the user.
 *
 * 2. Mounts the root React component tree inside <React.StrictMode>, which
 *    enables extra runtime warnings during development (double-invocation of
 *    effects, deprecated API detection, etc.).
 *
 * 3. Attaches the React app to the single <div id="root"> defined in index.html,
 *    effectively making the whole page a React-controlled SPA.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { patchFetchFor429 } from './utils/useRateLimit'

/*
 * patchFetchFor429 replaces window.fetch with a wrapper that checks every
 * response status. When it sees 429, it fires a "rateLimitHit" CustomEvent
 * on the window so RateLimitToast can display a non-blocking alert without
 * requiring any prop-drilling through the component tree.
 */
patchFetchFor429()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
