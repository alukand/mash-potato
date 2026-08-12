import { Logo } from './Logo'
import { CtaButton } from './ui'

// App Store guideline 1.2 requires a terms/EULA agreement carrying an explicit
// zero-tolerance stance on objectionable content and abusive users, and it must
// be presented BEFORE a user registers or logs in — not at first post, where
// this app used to gate it (that is what got 1.0 (36) rejected).
//
// It sits in front of the auth form, NOT in front of the app: browsing is not
// account based and must stay open (guideline 5.1.1(v), the previous
// rejection). So the order is: browse freely -> tap Sign in -> agree -> sign in.

export const TERMS_URL = 'https://mashpotato.app/terms'
export const PRIVACY_URL = 'https://mashpotato.app/privacy'

interface TermsGateProps {
  onAgree: () => void
  /** Back to browsing: agreeing must never be the only way out. */
  onBack?: () => void
}

export function TermsGate({ onAgree, onBack }: TermsGateProps) {
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

        <header className="mp-rise mb-6 flex flex-col items-center text-center">
          <Logo className="h-12 w-12" />
          <h1 className="mt-4 font-display text-[26px] font-semibold leading-tight tracking-tight">
            Before you join
          </h1>
          <p className="mt-2 text-[14px] leading-snug text-muted">
            Mash Potato has comments, group chats and messages. These are the rules for all of
            them.
          </p>
        </header>

        <div className="mp-rise mp-card rounded-[26px] p-6" style={{ animationDelay: '80ms' }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
            Zero tolerance
          </h2>
          <p className="mt-2.5 text-[14px] leading-relaxed">
            There is <span className="font-semibold">no tolerance for objectionable content or
            abusive users</span>. Hateful, harassing, threatening, sexually explicit and illegal
            content are not allowed anywhere in the app.
          </p>
          <ul className="mt-4 flex flex-col gap-2.5 text-[13px] leading-snug text-muted">
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
              <span>
                Every comment and message is filtered before it posts.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
              <span>
                You can report anything you see, and block anyone. Blocking hides them from you
                straight away and tells us about it.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
              <span>
                We review every report within 24 hours. Content that breaks these rules is
                removed and the account that posted it is ejected.
              </span>
            </li>
          </ul>

          <CtaButton tone="teal" onClick={onAgree} className="mt-6 w-full py-3.5 text-[15px]">
            I agree to these rules
          </CtaButton>

          <p className="mt-3 text-center text-[12px] leading-snug text-muted">
            Agreeing accepts the{' '}
            <a href={TERMS_URL} target="_blank" rel="noreferrer" className="text-teal underline">
              Terms of Use
            </a>{' '}
            and the{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-teal underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
