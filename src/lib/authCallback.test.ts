import { describe, expect, it } from 'vitest'
import { parseAuthCallback } from './authCallback'

const origin = 'https://app.mashpotato.app'
describe('email link callback boundary', () => {
  it('accepts a single authorization code only at the app callback', () => {
    expect(parseAuthCallback(`${origin}/auth/callback?code=one-use-code`, origin)).toEqual({ kind: 'code', code: 'one-use-code' })
  })
  it('accepts the registered native callback only when native handling is enabled', () => {
    const url = 'com.mashpotato.app://auth/callback?code=native-code'
    expect(parseAuthCallback(url, origin)).toBeNull()
    expect(parseAuthCallback(url, origin, true)).toEqual({ kind: 'code', code: 'native-code' })
    expect(parseAuthCallback('com.mashpotato.app://attacker/callback?code=bad', origin, true)).toBeNull()
    expect(parseAuthCallback('com.mashpotato.app://auth:123/callback?code=bad', origin, true)).toBeNull()
  })
  it.each([
    'https://app.mashpotato.app.attacker.test/auth/callback?code=bad',
    'https://attacker.test/auth/callback?code=bad',
    'https://app.mashpotato.app@attacker.test/auth/callback?code=bad',
    'https://attacker@app.mashpotato.app/auth/callback?code=bad',
    `${origin}/profile?code=bad`,
    `${origin}/auth/callback/extra?code=bad`,
    'javascript:alert(1)',
    'not a url',
  ])('ignores unrelated or untrusted links: %s', (url) => {
    expect(parseAuthCallback(url, origin)).toBeNull()
  })
  it.each([
    `${origin}/auth/callback`,
    `${origin}/auth/callback?code=`,
    `${origin}/auth/callback?code=%20`,
    `${origin}/auth/callback?code=first&code=second`,
    `${origin}/auth/callback?error=access_denied&error_description=untrusted-copy`,
    `${origin}/auth/callback#access_token=someone-elses-session`,
    `${origin}/auth/callback?code=valid#access_token=untrusted`,
  ])('rejects invalid callbacks and fragment sessions: %s', (url) => {
    expect(parseAuthCallback(url, origin)).toEqual({ kind: 'error' })
  })
})
