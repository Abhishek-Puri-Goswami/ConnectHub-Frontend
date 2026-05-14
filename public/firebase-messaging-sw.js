/*
 * firebase-messaging-sw.js — Firebase Service Worker (Background Push)
 *
 * Handles push notifications when the ConnectHub tab is closed or not focused.
 * Firebase suppresses browser notifications when the page is in the foreground;
 * the main app handles those via initForegroundListener() in firebase.js.
 *
 * CONFIG PASSING:
 *   This file lives in /public and is not processed by Vite, so VITE_ env vars
 *   are not available here. Instead, the main app sends the Firebase config via
 *   postMessage after registering this service worker. We listen for that message
 *   before initialising Firebase so we never have hardcoded credentials here.
 *
 * NOTIFICATION CLICK:
 *   Clicking a notification focuses the ConnectHub tab (or opens it) so the user
 *   lands directly in the chat. The roomId in the notification data can be used
 *   to navigate to the right room once the tab is active.
 */

/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

let messagingReady = false

// ── Receive Firebase config from the main thread ─────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'FIREBASE_CONFIG') return
  if (messagingReady) return // already initialised — ignore duplicate messages

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(event.data.config)
    }

    const messaging = firebase.messaging()
    messagingReady = true

    // ── Background message handler ───────────────────────────────────────────
    messaging.onBackgroundMessage((payload) => {
      const title   = payload.notification?.title || 'ConnectHub'
      const body    = payload.notification?.body  || 'You have a new notification'
      const roomId  = payload.data?.roomId        || ''
      const type    = payload.data?.type          || ''

      const iconMap = {
        NEW_MESSAGE: '/icon-message.png',
        MENTION:     '/icon-mention.png',
        ROOM_INVITE: '/icon-invite.png',
      }

      self.registration.showNotification(title, {
        body,
        icon:  iconMap[type] || '/vite.svg',
        badge: '/vite.svg',
        data:  { roomId, url: self.location.origin + '/chat' },
        tag:   'connecthub-' + (roomId || 'general'), // replaces prev notification for same room
        renotify: true,
        vibrate: [200, 100, 200],
      })
    })
  } catch (e) {
    console.error('[SW] Firebase init failed:', e)
  }
})

// ── Notification click — focus / open the chat tab ────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || self.location.origin + '/chat'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If ConnectHub is already open, focus it
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) return clients.openWindow(targetUrl)
    })
  )
})
