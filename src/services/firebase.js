/*
 * firebase.js — Firebase Cloud Messaging (FCM) Initialisation & Helpers
 *
 * PURPOSE:
 *   Manages the full browser-side push notification lifecycle:
 *     1. Initialise the Firebase app from VITE_FIREBASE_* env vars.
 *     2. Register the service worker (public/firebase-messaging-sw.js) and
 *        forward the Firebase config to it so it can handle background pushes.
 *     3. Request Notification permission and get the FCM registration token.
 *     4. Listen for foreground push messages (tab is open/focused) and surface
 *        them via the toast system so users don't miss them.
 *
 * HOW IT INTEGRATES:
 *   - ProfilePanel.jsx calls requestPushPermission() to enable push.
 *   - ProfilePanel.jsx calls revokePushToken(token) to disable push.
 *   - ChatLayout.jsx calls initForegroundListener() once on mount so that
 *     foreground pushes show as toasts.
 *
 * GRACEFUL DEGRADATION:
 *   If VITE_FIREBASE_API_KEY is not set (dev / CI environment), isConfigured
 *   is false and all exported functions are safe no-ops that resolve immediately.
 *   The UI shows "Push notifications not configured" in that case.
 *
 * SERVICE WORKER CONFIG PASSING:
 *   Vite does not process files in public/, so VITE_ vars cannot be injected
 *   directly into the service worker. Instead, after registering the SW we
 *   post the config object to it via postMessage so it can initialise Firebase
 *   on its end for background message delivery.
 */

import { initializeApp, getApps }    from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

// ── Configuration ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

/**
 * True only when all six required Firebase env vars are present.
 * If false, the push notification UI shows a "not configured" state and
 * all helpers below are safe no-ops.
 */
export const isConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  VAPID_KEY
)

// ── Initialisation ──────────────────────────────────────────────────────────
let messagingInstance = null

if (isConfigured) {
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    messagingInstance = getMessaging(app)
  } catch (e) {
    console.warn('[FCM] Firebase init failed:', e.message)
  }
}

// ── Service Worker Registration ─────────────────────────────────────────────
let swRegistration = null

async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers not supported')
  if (swRegistration) return swRegistration
  swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/',
  })
  // Forward the Firebase config so the SW can handle background messages
  const sendConfig = (reg) => {
    const target = reg.active || reg.waiting || reg.installing
    target?.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig })
  }
  if (swRegistration.active) {
    sendConfig(swRegistration)
  } else {
    swRegistration.addEventListener('updatefound', () => {
      const newWorker = swRegistration.installing
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') sendConfig(swRegistration)
      })
    })
  }
  return swRegistration
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * requestPushPermission — requests Notification permission and returns the FCM token.
 *
 * @returns {Promise<string>} the FCM registration token
 * @throws  if permission is denied or the token could not be obtained
 */
export async function requestPushPermission() {
  if (!isConfigured || !messagingInstance) {
    throw new Error('Push notifications are not configured on this server.')
  }
  if (!('Notification' in window)) {
    throw new Error('This browser does not support push notifications.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied.')
  }

  const sw = await ensureServiceWorker()
  const token = await getToken(messagingInstance, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: sw,
  })
  if (!token) throw new Error('Could not obtain FCM token — check VAPID key.')
  return token
}

/**
 * getCurrentPushToken — returns the FCM token stored in localStorage, or null.
 * Used to show current push state without re-requesting permission.
 */
export function getCurrentPushToken() {
  return localStorage.getItem('fcmToken') || null
}

/**
 * savePushToken — stores a registered FCM token in localStorage.
 * Called by ProfilePanel after successfully posting the token to the backend.
 */
export function savePushToken(token) {
  localStorage.setItem('fcmToken', token)
}

/**
 * clearPushToken — removes the FCM token from localStorage.
 * Called by ProfilePanel after successfully deleting the token from the backend.
 */
export function clearPushToken() {
  localStorage.removeItem('fcmToken')
}

/**
 * getNotificationPermissionState — returns the current Notification permission.
 * "granted" | "denied" | "default" | "unsupported"
 */
export function getNotificationPermissionState() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/**
 * initForegroundListener — sets up a handler for push messages received while
 * the app tab is open and focused.
 *
 * Firebase suppresses the browser notification when the tab is visible, so we
 * manually surface the message as an in-app toast via the provided callback.
 *
 * @param {Function} onPush callback(title: string, body: string, data: object)
 * @returns {Function|null} unsubscribe function, or null if FCM not configured
 */
export function initForegroundListener(onPush) {
  if (!isConfigured || !messagingInstance) return null
  return onMessage(messagingInstance, (payload) => {
    const title = payload.notification?.title || 'ConnectHub'
    const body  = payload.notification?.body  || 'New notification'
    const data  = payload.data || {}
    onPush(title, body, data)
  })
}
