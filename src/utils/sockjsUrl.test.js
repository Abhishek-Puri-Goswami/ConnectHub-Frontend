import { describe, it, expect } from 'vitest'
import { toSockJsUrl } from './sockjsUrl'

describe('toSockJsUrl', () => {
  it('converts ws:// to http:// (the misconfiguration that broke chat)', () => {
    expect(toSockJsUrl('ws://localhost:8080/ws')).toBe('http://localhost:8080/ws')
  })

  it('converts wss:// to https://', () => {
    expect(toSockJsUrl('wss://chat.example.com/ws')).toBe('https://chat.example.com/ws')
  })

  it('is case-insensitive on the scheme', () => {
    expect(toSockJsUrl('WS://localhost:8080/ws')).toBe('http://localhost:8080/ws')
  })

  it('leaves http and https URLs unchanged', () => {
    expect(toSockJsUrl('http://localhost:8080/ws')).toBe('http://localhost:8080/ws')
    expect(toSockJsUrl('https://chat.example.com/ws')).toBe('https://chat.example.com/ws')
  })

  it('leaves a same-origin relative path unchanged', () => {
    expect(toSockJsUrl('/ws')).toBe('/ws')
  })

  it('does not touch "ws" appearing elsewhere in the URL', () => {
    expect(toSockJsUrl('http://ws.example.com/ws')).toBe('http://ws.example.com/ws')
  })

  it('passes through undefined/null untouched', () => {
    expect(toSockJsUrl(undefined)).toBeUndefined()
    expect(toSockJsUrl(null)).toBeNull()
  })
})
