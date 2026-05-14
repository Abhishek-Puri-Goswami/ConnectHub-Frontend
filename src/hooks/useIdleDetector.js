/*
 * useIdleDetector — Automatic Away Detection Hook
 *
 * Monitors user activity on the page. After IDLE_MS of no interaction, the
 * current user is automatically switched to AWAY via presenceStore.setAutoAway().
 * As soon as activity resumes, presenceStore.clearAutoAway() restores the previous
 * status (so a user who was DND before going idle gets DND back, not ONLINE).
 *
 * Activity events monitored: mousemove, keydown, mousedown, touchstart, scroll, focus.
 * 'focus' is included so returning to the tab counts as activity.
 *
 * The timer is debounced — every activity event resets the countdown.
 * The hook is a no-op until a user is logged in (userId is required to call the API).
 *
 * Usage:
 *   Call once in ChatLayout — the hook manages its own lifecycle.
 *   useIdleDetector(user.userId)
 */
import { useEffect, useRef } from 'react'
import { usePresenceStore } from '../store/presenceStore'

const IDLE_MS = 5 * 60 * 1000   // 5 minutes of inactivity → AWAY

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'focus']

export function useIdleDetector(userId) {
  const timerRef = useRef(null)

  useEffect(() => {
    if (!userId) return

    const scheduleAway = () => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        usePresenceStore.getState().setAutoAway(userId)
      }, IDLE_MS)
    }

    const onActivity = () => {
      // If the user was auto-set to AWAY, restore their previous status immediately
      usePresenceStore.getState().clearAutoAway(userId)
      // Reset the idle countdown
      scheduleAway()
    }

    // Start the initial countdown
    scheduleAway()

    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, onActivity, { passive: true })
    )

    return () => {
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(evt =>
        window.removeEventListener(evt, onActivity)
      )
    }
  }, [userId])
}
