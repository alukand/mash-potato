import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  requestPasswordReset,
  requestSignInCode,
  resendSignupCode,
  resetPasswordWithCode,
  signIn,
  signUp,
  verifySignInCode,
  verifySignupCode,
} from '../lib/api'
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

// Email + password auth against local/hosted Supabase. On success the
// onAuthStateChange listener in App flips the screen — no navigation here.
// Confirm email is ON: signup and password reset both run on 6-digit codes
// entered here (no deep links on mobile).

type Mode = 'signin' | 'signup' | 'confirm' | 'forgot' | 'code'

const codeFieldClass = `${fieldClass} text-center font-mono text-[18px] tracking-[0.4em]`

interface AuthScreenProps {
  /** Present when sign-in was opened FROM browsing (guideline 5.1.1(v)):
   *  a signed-out visitor must be able to back out and keep looking around. */
  onBack?: () => void
}

export function AuthScreen({ onBack }: AuthScreenProps = {}) {
  const [termsAgreed, setTermsAgreed] = useState(readTermsAgreed)
  const [mode, setMode] = useState<Mode>('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  // forgot-password: request the code first, then code + new password together
  const [forgotStage, setForgotStage] = useState<'request' | 'verify'>('request')
  // passwordless: same two-step shape, no password at the end
  const [codeStage, setCodeStage] = useState<'request' | 'verify'>('request')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function switchMode(m: Mode) {
    setMode(m)
    setError(null)
    setNotice(null)
    setCode('')
    if (m === 'forgot') setForgotStage('request')
    if (m === 'code') setCodeStage('request')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await signUp(
          email.trim(),
          password,
          displayName.trim() || 'Member',
        )
        if (needsConfirmation) {
          setMode('confirm')
          setBusy(false)
        }
        // else: App's auth listener takes over
      } else if (mode === 'confirm') {
        await verifySignupCode(email.trim(), code.trim())
        // success: App's auth listener takes over
      } else if (mode === 'forgot') {
        if (forgotStage === 'request') {
          await requestPasswordReset(email.trim())
          setForgotStage('verify')
          setNotice(`Code sent to ${email.trim()}.`)
          setBusy(false)
        } else {
          await resetPasswordWithCode(email.trim(), code.trim(), newPassword)
          // success: signed in with the new password; App takes over
        }
      } else if (mode === 'code') {
        if (codeStage === 'request') {
          await requestSignInCode(email.trim())
          setCodeStage('verify')
          setNotice(`Code sent to ${email.trim()}.`)
          setBusy(false)
        } else {
          await verifySignInCode(email.trim(), code.trim())
          // success: App's auth listener takes over
        }
      } else {
        await signIn(email.trim(), password)
        // success: App's auth listener takes over
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  async function handleResend() {
    setBusy(true)
    setError(null)
    try {
      await resendSignupCode(email.trim())
      setNotice(`New code sent to ${email.trim()}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend')
    } finally {
      setBusy(false)
    }
  }

  const ctaLabel = busy
    ? mode === 'signin'
      ? 'Signing in…'
      : mode === 'signup'
        ? 'Creating account…'
        : mode === 'confirm'
          ? 'Checking…'
          : mode === 'code'
            ? codeStage === 'request'
              ? 'Sending…'
              : 'Signing in…'
            : forgotStage === 'request'
              ? 'Sending…'
              : 'Resetting…'
    : mode === 'signin'
      ? 'Sign in'
      : mode === 'signup'
        ? 'Create account'
        : mode === 'confirm'
          ? 'Confirm'
          : mode === 'code'
            ? codeStage === 'request'
              ? 'Email me a code'
              : 'Sign in'
            : forgotStage === 'request'
              ? 'Send me a code'
              : 'Set new password'

  // Guideline 1.2: agreement comes BEFORE the account exists, so it gates the
  // form rather than sitting beside it.
  if (!termsAgreed) {
    return (
      <TermsGate
        onBack={onBack}
        onAgree={() => {
          storeTermsAgreed()
          setTermsAgreed(true)
        }}
      />
    )
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-[400px]">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mp-rise mb-4 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 5-7 7 7 7" />
            </svg>
            Keep browsing
          </button>
        )}
        <header className="mp-rise mb-8 flex flex-col items-center text-center">
          <Logo className="h-14 w-14" />
          <h1 className="mt-4 font-display text-[34px] font-semibold leading-none tracking-tight">
            Mash Potato
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            Rate movies and shows with your friends.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="mp-rise mp-card rounded-[26px] p-6"
          style={{ animationDelay: '80ms' }}
        >
          {(mode === 'signin' || mode === 'signup') && (
            <div className="mb-5 flex rounded-full border border-line bg-surface-2 p-1">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`flex-1 rounded-full py-2 text-[12px] font-semibold transition-colors ${
                    mode === m ? 'bg-teal/10 text-teal' : 'text-muted'
                  }`}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}

          {mode === 'confirm' && (
            <div className="mb-4">
              <p className="text-[15px] font-semibold leading-snug">Check your email</p>
              <p className="mt-1 text-[13px] leading-snug text-muted">
                We sent a 6-digit code to{' '}
                <span className="font-medium text-text">{email.trim()}</span>. Enter it to
                finish creating your account.
              </p>
            </div>
          )}

          {mode === 'forgot' && (
            <div className="mb-4">
              <p className="text-[15px] font-semibold leading-snug">Reset your password</p>
              <p className="mt-1 text-[13px] leading-snug text-muted">
                {forgotStage === 'request'
                  ? 'Enter your email and we will send a 6-digit code.'
                  : 'Enter the code from your email and pick a new password.'}
              </p>
            </div>
          )}

          {mode === 'code' && (
            <div className="mb-4">
              <p className="text-[15px] font-semibold leading-snug">Sign in without a password</p>
              <p className="mt-1 text-[13px] leading-snug text-muted">
                {codeStage === 'request'
                  ? 'We email you a 6-digit code; enter it here and you are in.'
                  : 'Enter the code from your email.'}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {mode === 'signup' && (
              <input
                type="text"
                required
                maxLength={60}
                placeholder="Display name"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={fieldClass}
              />
            )}
            {mode !== 'confirm' && (
              <input
                type="email"
                required
                placeholder="Email"
                autoComplete="email"
                value={email}
                disabled={
                  (mode === 'forgot' && forgotStage === 'verify') ||
                  (mode === 'code' && codeStage === 'verify')
                }
                onChange={(e) => setEmail(e.target.value)}
                className={`${fieldClass} disabled:opacity-60`}
              />
            )}
            {(mode === 'signin' || mode === 'signup') && (
              <input
                type="password"
                required
                minLength={mode === 'signup' ? 8 : 6}
                placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
              />
            )}
            {(mode === 'confirm' ||
              (mode === 'forgot' && forgotStage === 'verify') ||
              (mode === 'code' && codeStage === 'verify')) && (
              <input
                type="text"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="6-digit code"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={codeFieldClass}
              />
            )}
            {mode === 'forgot' && forgotStage === 'verify' && (
              <input
                type="password"
                required
                minLength={8}
                placeholder="New password (8+ characters)"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={fieldClass}
              />
            )}
          </div>

          {notice && !error && (
            <p className="mt-3 text-[13px] leading-snug text-teal">{notice}</p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-[13px] leading-snug text-coral">
              {error}
            </p>
          )}

          <CtaButton type="submit" disabled={busy} className="mt-5 w-full py-3.5 text-[14px]">
            {ctaLabel}
          </CtaButton>

          {/* Guideline 1.2: the agreement is re-stated at the point of signing
              in or registering, not only on the gate before it. */}
          {(mode === 'signin' || mode === 'signup') && (
            <p className="mt-3 text-center text-[12px] leading-snug text-muted">
              By continuing you agree to the{' '}
              <a href={TERMS_URL} target="_blank" rel="noreferrer" className="text-teal underline">
                Terms of Use
              </a>{' '}
              and{' '}
              <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-teal underline">
                Privacy Policy
              </a>
              , including zero tolerance for objectionable content or abusive users.
            </p>
          )}

          {mode === 'signin' && (
            <>
              <button
                type="button"
                onClick={() => switchMode('code')}
                className="mt-3 w-full rounded-full border border-line py-2.5 text-center text-[13px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
              >
                Email me a sign-in code instead
              </button>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="mt-2 w-full text-center text-[12px] font-semibold text-muted transition-colors hover:text-teal"
              >
                Forgot password?
              </button>
            </>
          )}
          {mode === 'confirm' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleResend()}
              className="mt-3 w-full text-center text-[12px] font-semibold text-muted transition-colors hover:text-teal disabled:opacity-60"
            >
              Send a new code
            </button>
          )}
          {(mode === 'confirm' || mode === 'forgot' || mode === 'code') && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="mt-2 w-full text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
            >
              Back to sign in
            </button>
          )}
        </form>

        <p
          className="mp-rise mt-6 text-center font-mono text-[10px] text-muted"
          style={{ animationDelay: '160ms' }}
        >
          ratings stay hidden until the whole group reveals
        </p>
      </div>
    </div>
  )
}
