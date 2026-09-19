// SockJS speaks HTTP(S) and upgrades to a real WebSocket itself, so it rejects ws:// and wss://
// URLs outright ("The URL's scheme must be either 'http:' or 'https:'"). Accept either form in
// configuration (VITE_WS_URL) and convert it, so a natural-looking `ws://` value can't silently
// break real-time messaging.
export function toSockJsUrl(url) {
  return typeof url === 'string' ? url.replace(/^ws(s?):\/\//i, 'http$1://') : url
}
