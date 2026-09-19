import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startMediaSession, keepMediaSessionAlive, RENEW_EVERY_MS } from './mediaSession'

beforeEach(() => {
  const store = {}
  vi.stubGlobal('localStorage', {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v },
  })
})

describe('media session', () => {
  it('does nothing when logged out', async () => {
    const f = vi.fn()
    expect(await startMediaSession(f)).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('POSTs with the bearer token and credentials so the cookie is stored', async () => {
    localStorage.setItem('accessToken', 'abc')
    const f = vi.fn().mockResolvedValue({ ok: true })
    expect(await startMediaSession(f)).toBe(true)
    const [url, init] = f.mock.calls[0]
    expect(url).toMatch(/\/media\/session$/)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.headers.Authorization).toBe('Bearer abc')
  })

  it('reports failure without throwing on network errors or non-2xx', async () => {
    localStorage.setItem('accessToken', 'abc')
    expect(await startMediaSession(vi.fn().mockRejectedValue(new Error('net')))).toBe(false)
    expect(await startMediaSession(vi.fn().mockResolvedValue({ ok: false }))).toBe(false)
  })

  it('starts immediately, renews on an interval, and can be stopped', () => {
    localStorage.setItem('accessToken', 'abc')
    const f = vi.fn().mockResolvedValue({ ok: true })
    const si = vi.fn().mockReturnValue(7)
    const ci = vi.fn()
    const stop = keepMediaSessionAlive(f, si, ci)
    expect(f).toHaveBeenCalledTimes(1)
    expect(si).toHaveBeenCalledWith(expect.any(Function), RENEW_EVERY_MS)
    si.mock.calls[0][0]()
    expect(f).toHaveBeenCalledTimes(2)
    stop()
    expect(ci).toHaveBeenCalledWith(7)
  })
})
