// Diff supabase/config.toml against the HOSTED auth config.
//
// Why this exists: `config.toml` configures the LOCAL stack only. Hosted has
// its own settings and its own defaults, so anything auth-shaped works on your
// machine and silently differs in production. That gap has bitten three times:
//
//   * email templates  — hosted kept Supabase's stock link-based ones, so every
//                        code-based flow was broken for everyone
//   * site_url         — hosted stayed on localhost:3000
//   * otp_length       — local 6, hosted 8, so the app's 6-digit input could
//                        never accept the code it was emailed
//
// None of those failed loudly. Each looked like an app bug.
//
// Usage:  SUPABASE_ACCESS_TOKEN=sbp_... node scripts/check-hosted-auth.mjs
// Get a token at https://supabase.com/dashboard/account/tokens (account-wide,
// so revoke it when you are done).

import { readFileSync } from 'node:fs'

const PROJECT_REF = 'lvmcwvhlfijvegxbqipc'
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set. See the header of this file.')
  process.exit(2)
}

const toml = readFileSync('supabase/config.toml', 'utf8')
/** Grab a bare key from config.toml (first match wins; enough for these). */
const val = (key) => {
  const m = toml.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
  { headers: { Authorization: `Bearer ${token}` } },
)
if (!res.ok) {
  console.error(`Management API ${res.status}: ${await res.text()}`)
  process.exit(2)
}
const hosted = await res.json()

const tpl = (f) => readFileSync(`supabase/templates/${f}`, 'utf8').trim()

// MUST match: a difference here is a bug users will hit.
const mustMatch = [
  ['otp length', val('otp_length'), String(hosted.mailer_otp_length)],
  ['min password length', val('minimum_password_length'), String(hosted.password_min_length)],
  ['confirmation body', tpl('confirmation.html'), (hosted.mailer_templates_confirmation_content || '').trim()],
  ['recovery body', tpl('recovery.html'), (hosted.mailer_templates_recovery_content || '').trim()],
  ['magic_link body', tpl('magic_link.html'), (hosted.mailer_templates_magic_link_content || '').trim()],
  ['email_change body', tpl('email_change.html'), (hosted.mailer_templates_email_change_content || '').trim()],
]

let bad = 0
for (const [label, local, remote] of mustMatch) {
  const ok = local !== null && local === remote
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'DIFF'}  ${label}`)
  if (!ok) {
    console.log(`        local : ${JSON.stringify(String(local).slice(0, 70))}`)
    console.log(`        hosted: ${JSON.stringify(String(remote).slice(0, 70))}`)
  }
}

// Every template must render the CODE, not a link. This is the check that
// would have caught the original breakage on its own.
for (const [label, key] of [
  ['confirmation', 'mailer_templates_confirmation_content'],
  ['recovery', 'mailer_templates_recovery_content'],
  ['magic_link', 'mailer_templates_magic_link_content'],
  ['email_change', 'mailer_templates_email_change_content'],
]) {
  const body = hosted[key] || ''
  if (!body.includes('{{ .Token }}') || body.includes('ConfirmationURL')) {
    bad++
    console.log(`DIFF  ${label} template does not render {{ .Token }} — hosted is sending a LINK`)
  }
}

// Expected to differ; printed for eyeballing, never failed on.
console.log('\n--- differs on purpose ---')
console.log(`  site_url       hosted: ${hosted.site_url}`)
console.log(`  uri_allow_list hosted: ${hosted.uri_allow_list}`)
console.log(`  custom SMTP    hosted: ${hosted.smtp_host || '(none — templates are LOCKED without it on free tier)'}`)

console.log(bad === 0 ? '\nHosted auth matches config.toml.' : `\n${bad} MISMATCH(ES) — hosted will behave differently from local.`)

// exitCode, NOT process.exit(): forcing exit while fetch's socket is still
// closing trips a libuv assertion on Windows and reports 127 even when every
// check passed. Let Node drain and leave on its own.
process.exitCode = bad === 0 ? 0 : 1
