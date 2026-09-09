import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { requestPasswordReset, requestSignInCode, resetPasswordWithCode, signIn, verifySignInCode } from '../lib/api'
import { getAuthLinkError } from '../lib/authLinks'
import { Logo } from '../components/Logo'
import { CtaButton, fieldClass } from '../components/ui'
import { TermsGate, TERMS_URL, PRIVACY_URL } from '../components/TermsGate'

// Guideline 1.2: the terms + zero-tolerance agreement must be shown BEFORE
// registering or logging in. Remembered per device so it is a one-time step,
// and re-affirmed by the line under the CTA on every visit.
const TERMS_KEY = 'mp.termsAgreed'

function readTermsAgreed(): boolean {
  try {
    return localStorage.getItem(TERMS_KEY) === '1'
  } catch {
    return false
  }
}

function storeTermsAgreed() {
  try {
    localStorage.setItem(TERMS_KEY, '1')
  } catch {
    // private mode: the gate simply shows again next launch
  }
}

type Mode = 'email' | 'password' | 'forgot'
const codeFieldClass = `${fieldClass} text-center font-mono text-[18px] tracking-[0.4em]`

interface AuthScreenProps { onBack?: () => void }

export function AuthScreen({ onBack }: AuthScreenProps = {}) {
  const [termsAgreed, setTermsAgreed] = useState(readTermsAgreed)
  const [mode, setMode] = useState<Mode>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [resendIn, setResendIn] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(getAuthLinkError)

  useEffect(() => {
    const onError = () => setError(getAuthLinkError())
    window.addEventListener('mp:auth-link-error', onError)
    return () => window.removeEventListener('mp:auth-link-error', onError)
  }, [])

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = window.setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendIn])

  function switchMode(next: Mode) {
    if (inFlight.current) return
    setMode(next); setSent(false); setCode(''); setPassword(''); setNotice(null); setError(null)
  }

  async function sendEmail() {
    if (mode === 'forgot') await requestPasswordReset(email.trim())
    else await requestSignInCode(email.trim())
    setSent(true); setResendIn(60)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null); setNotice(null)
    try {
      if (mode === 'password') await signIn(email.trim(), password)
      else if (!sent) await sendEmail()
      else if (mode === 'forgot') await resetPasswordWithCode(email.trim(), code.trim(), password)
      else await verifySignInCode(email.trim(), code.trim())
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function resend() {
    if (inFlight.current || resendIn > 0) return
    inFlight.current = true; setBusy(true); setError(null); setNotice(null)
    try { await sendEmail(); setNotice('A fresh email is on its way. Use the newest one.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not resend. Please try again.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  if (!termsAgreed) return <TermsGate onBack={onBack} onAgree={() => { storeTermsAgreed(); setTermsAgreed(true) }} />

  const heading = mode === 'password' ? 'Welcome back' : mode === 'forgot' ? 'Reset your password' : sent ? 'Check your email' : 'Your next movie night starts here'
  const label = busy ? (sent || mode === 'password' ? 'Signing in…' : 'Sending…') : mode === 'password' ? 'Sign in' : mode === 'forgot' ? (sent ? 'Set new password' : 'Send reset code') : sent ? 'Sign in with this code' : 'Email me a sign-in link'

  return <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
    <div className="mx-auto w-full max-w-[400px]">
      {onBack && <button type="button" onClick={onBack} className="mb-5 min-h-11 text-[13px] font-semibold text-muted hover:text-text">← Keep browsing</button>}
      <header className="mp-rise mb-7">
        <Logo className="mb-5 h-12 w-12" />
        <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight">{heading}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {mode === 'email' ? sent ? <>We sent a sign-in link to <strong className="break-all font-semibold text-text">{email.trim()}</strong>. Open it on this device, or enter the 6-digit code below.</> : 'Sign in or create an account with your email. No password to remember.' : mode === 'password' ? 'Use your existing password, or switch to an email link below.' : sent ? 'Enter the code from your email and choose a new password.' : 'We’ll email you a code to reset your password.'}
        </p>
      </header>
      <form onSubmit={submit} className="mp-rise mp-card rounded-[26px] p-5">
        <fieldset disabled={busy} className="space-y-4">
          {!sent && <label className="block text-[13px] font-semibold">Email address<input type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={`mt-2 ${fieldClass}`} /></label>}
          {sent && <label className="block text-[13px] font-semibold">{mode === 'email' ? 'Or use your email code' : 'Your reset code'}<input type="text" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" className={`mt-2 ${codeFieldClass}`} /></label>}
          {(mode === 'password' || (mode === 'forgot' && sent)) && <label className="block text-[13px] font-semibold">{mode === 'password' ? 'Password' : 'New password'}<input type="password" required minLength={mode === 'forgot' ? 8 : 6} autoComplete={mode === 'forgot' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'forgot' ? 'At least 8 characters' : 'Your password'} className={`mt-2 ${fieldClass}`} /></label>}
          {notice && !error && <p role="status" className="text-[13px] leading-snug text-teal">{notice}</p>}
          {error && <p role="alert" className="text-[13px] leading-snug text-coral">{error}</p>}
          <CtaButton type="submit" disabled={busy} className="min-h-12 w-full px-4 text-[14px]">{label}</CtaButton>
        </fieldset>
        <p className="mt-3 text-center text-[12px] leading-relaxed text-muted">By continuing you agree to the <a href={TERMS_URL} target="_blank" rel="noreferrer" className="text-teal underline">Terms of Use</a> and <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-teal underline">Privacy Policy</a>, including zero tolerance for objectionable content or abusive users.</p>
        {sent && <>
          <p className="mt-5 text-center text-[12px] text-muted">Can’t find the email? Check your spam folder.</p>
          <button type="button" disabled={busy || resendIn > 0} onClick={() => void resend()} className="mt-1 min-h-11 w-full text-[13px] font-semibold text-teal disabled:text-muted">{resendIn > 0 ? `Resend email in ${resendIn}s` : 'Resend email'}</button>
          <button type="button" disabled={busy} onClick={() => switchMode(mode)} className="min-h-11 w-full text-[13px] text-muted">Use a different email</button>
        </>}
        {!sent && <button type="button" disabled={busy} onClick={() => switchMode(mode === 'email' ? 'password' : 'email')} className="mt-4 min-h-11 w-full text-[13px] font-semibold text-muted">{mode === 'email' ? 'Sign in with a password instead' : 'Sign in with an email link instead'}</button>}
        {mode === 'password' && <button type="button" disabled={busy} onClick={() => switchMode('forgot')} className="min-h-11 w-full text-[13px] text-muted">Forgot your password?</button>}
      </form>
      {!sent && mode === 'email' && <p className="mt-5 text-center text-[13px] leading-relaxed text-muted">New here? Next, you’ll make your rubric and find a group.</p>}
    </div>
  </main>
}
