// Files (chat images, attachments, avatars) are served by the backend behind an HttpOnly "media
// session" cookie: <img>/<video> tags cannot send an Authorization header, so the browser
// attaches the cookie instead. The cookie lives 30 minutes; renew it well before that.
const API = import.meta.env.VITE_API_BASE_URL || '/api/v1'
export const RENEW_EVERY_MS = 20 * 60 * 1000

export async function startMediaSession(fetchImpl = fetch) {
  const token = localStorage.getItem('accessToken')
  if (!token) return false
  try {
    const res = await fetchImpl(API + '/media/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'include', // required so the browser stores the cross-origin Set-Cookie
    })
    return res.ok
  } catch {
    return false
  }
}

// Starts a session now and keeps it renewed; returns a stop function.
export function keepMediaSessionAlive(fetchImpl = fetch, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval) {
  startMediaSession(fetchImpl)
  const id = setIntervalImpl(() => startMediaSession(fetchImpl), RENEW_EVERY_MS)
  return () => clearIntervalImpl(id)
}
