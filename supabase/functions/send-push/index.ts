// Push sender. Database triggers (push_notify -> pg_net) POST id-only event
// payloads here; this function resolves names server-side and delivers alerts
// to Apple devices over the APNs HTTP/2 API with an ES256 provider token.
// FCM (Android) can slot in later as a second delivery path per token
// platform — the event contract stays the same.
//
// Auth: callers must present the shared secret (x-push-secret) that lives in
// public.notification_config and in this function's PUSH_SHARED_SECRET env.
// The service-role key is used ONLY here, server-side, to resolve recipients.
//
// Events (see 20260712230000_push_notifications.sql + 20260714120000 +
// 20260726120000_messaging.sql):
//   { event: 'group_added',   group_id, recipient_id, actor_id }
//   { event: 'round_started', session_id, group_id, actor_id }
//   { event: 'member_locked', session_id, group_id, actor_id }
//   { event: 'comment_reply', comment_id, title_id, group_id?, recipient_id, actor_id }
//   { event: 'new_message',   message_id, conversation_id, actor_id }   (no group_id)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PUSH_SHARED_SECRET = Deno.env.get('PUSH_SHARED_SECRET') ?? ''
const APNS_AUTH_KEY = Deno.env.get('APNS_AUTH_KEY') ?? '' // the .p8 file's PEM content
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') ?? ''
const APPLE_TEAM_ID = Deno.env.get('APPLE_TEAM_ID') ?? ''
const APNS_TOPIC = Deno.env.get('APNS_TOPIC') ?? 'com.mashpotato.app'
// TestFlight and the App Store use production APNs; override for dev builds.
const APNS_HOST = Deno.env.get('APNS_HOST') ?? 'https://api.push.apple.com'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---- PostgREST (service role; recipients and names only) -------------------

const REST_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function rest<T>(pathAndQuery: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: REST_HEADERS })
  if (!res.ok) throw new Error(`rest ${pathAndQuery}: ${res.status}`)
  return (await res.json()) as T[]
}

async function displayName(userId: string | null): Promise<string> {
  if (!userId) return 'Someone'
  const rows = await rest<{ display_name: string }>(
    `profiles?id=eq.${userId}&select=display_name`,
  )
  return rows[0]?.display_name ?? 'Someone'
}

async function groupName(groupId: string): Promise<string> {
  const rows = await rest<{ name: string }>(`groups?id=eq.${groupId}&select=name`)
  return rows[0]?.name ?? 'your group'
}

async function memberIds(groupId: string): Promise<string[]> {
  const rows = await rest<{ user_id: string }>(
    `group_members?group_id=eq.${groupId}&select=user_id`,
  )
  return rows.map((r) => r.user_id)
}

async function sessionInfo(
  sessionId: string,
): Promise<{ state: string; titleName: string } | null> {
  const rows = await rest<{ state: string; titles: { name: string } | null }>(
    `reveal_sessions?id=eq.${sessionId}&select=state,titles(name)`,
  )
  if (rows.length === 0) return null
  return { state: rows[0].state, titleName: rows[0].titles?.name ?? 'your movie' }
}

async function titleInfo(
  titleId: string,
): Promise<{ name: string; tmdbId: number | null; mediaType: string } | null> {
  const rows = await rest<{ name: string; tmdb_id: number | null; media_type: string }>(
    `titles?id=eq.${titleId}&select=name,tmdb_id,media_type`,
  )
  if (rows.length === 0) return null
  return { name: rows[0].name, tmdbId: rows[0].tmdb_id, mediaType: rows[0].media_type }
}

// ---- messaging ---------------------------------------------------------------

interface ConversationRow {
  id: string
  kind: string
  group_id: string | null
  title: string | null
  dm_user_a: string | null
  dm_user_b: string | null
  request_state: string
}

async function conversationRow(id: string): Promise<ConversationRow | null> {
  const rows = await rest<ConversationRow>(
    `conversations?id=eq.${id}&select=id,kind,group_id,title,dm_user_a,dm_user_b,request_state`,
  )
  return rows[0] ?? null
}

async function messageRow(
  id: string,
): Promise<{ body: string; kind: string; share_label: string | null } | null> {
  const rows = await rest<{ body: string; kind: string; share_label: string | null }>(
    `messages?id=eq.${id}&select=body,kind,share_label`,
  )
  return rows[0] ?? null
}

/**
 * Everyone in a conversation, mirroring is_conversation_member's three
 * branches. Service-role reads bypass RLS, so the membership rule has to be
 * restated here — keep it in step with the migration.
 */
async function conversationMemberIds(c: ConversationRow): Promise<string[]> {
  if (c.kind === 'dm') return [c.dm_user_a, c.dm_user_b].filter((x): x is string => !!x)
  if (c.kind === 'group' && c.group_id) return memberIds(c.group_id)
  const rows = await rest<{ user_id: string }>(
    `conversation_participants?conversation_id=eq.${c.id}&select=user_id`,
  )
  return rows.map((r) => r.user_id)
}

/** Who has muted this conversation (they get no alert). */
async function mutedIn(conversationId: string): Promise<Set<string>> {
  const rows = await rest<{ user_id: string }>(
    `conversation_state?conversation_id=eq.${conversationId}&muted=is.true&select=user_id`,
  )
  return new Set(rows.map((r) => r.user_id))
}

/** Anyone in a block relationship with the sender, either direction. */
async function blockedWith(userId: string): Promise<Set<string>> {
  const [outgoing, incoming] = await Promise.all([
    rest<{ blocked_id: string }>(`user_blocks?blocker_id=eq.${userId}&select=blocked_id`),
    rest<{ blocker_id: string }>(`user_blocks?blocked_id=eq.${userId}&select=blocker_id`),
  ])
  return new Set([
    ...outgoing.map((r) => r.blocked_id),
    ...incoming.map((r) => r.blocker_id),
  ])
}

async function tokensFor(userIds: string[]): Promise<{ token: string; user_id: string }[]> {
  if (userIds.length === 0) return []
  const list = userIds.join(',')
  return rest<{ token: string; user_id: string }>(
    `device_tokens?user_id=in.(${list})&platform=eq.ios&select=token,user_id`,
  )
}

async function pruneToken(token: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/device_tokens?token=eq.${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: REST_HEADERS,
  }).catch(() => {})
}

// ---- APNs (ES256 provider token, cached ~45 min) ----------------------------

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let apnsKeyPromise: Promise<CryptoKey> | null = null
function apnsKey(): Promise<CryptoKey> {
  if (!apnsKeyPromise) {
    const body = APNS_AUTH_KEY.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
    const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
    apnsKeyPromise = crypto.subtle.importKey(
      'pkcs8',
      der,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
  }
  return apnsKeyPromise
}

let cachedJwt: { token: string; iat: number } | null = null
async function apnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedJwt && now - cachedJwt.iat < 2700) return cachedJwt.token
  const unsigned =
    b64url(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID })) +
    '.' +
    b64url(JSON.stringify({ iss: APPLE_TEAM_ID, iat: now }))
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      await apnsKey(),
      new TextEncoder().encode(unsigned),
    ),
  )
  cachedJwt = { token: `${unsigned}.${b64url(sig)}`, iat: now }
  return cachedJwt.token
}

async function sendApns(
  token: string,
  title: string,
  body: string,
  threadId: string,
  data: Record<string, string>,
): Promise<'sent' | 'pruned' | 'failed'> {
  const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await apnsJwt()}`,
      'apns-topic': APNS_TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    },
    body: JSON.stringify({
      // Custom keys are ID-ONLY routing data (never score values): the app
      // uses them to land a notification tap on the right group's round.
      aps: { alert: { title, body }, sound: 'default', 'thread-id': threadId },
      ...data,
    }),
  })
  if (res.ok) return 'sent'
  const detail = await res.text()
  if (
    res.status === 410 ||
    detail.includes('BadDeviceToken') ||
    detail.includes('Unregistered') ||
    detail.includes('DeviceTokenNotForTopic')
  ) {
    await pruneToken(token)
    return 'pruned'
  }
  console.error('apns rejected', res.status, detail)
  return 'failed'
}

// ---- event -> recipients + copy ---------------------------------------------

interface PushEvent {
  event: string
  // absent for public-thread comment replies AND for every message event
  group_id?: string | null
  session_id?: string
  comment_id?: string
  title_id?: string
  message_id?: string
  conversation_id?: string
  recipient_id?: string
  actor_id?: string | null
}

async function composeAndSend(evt: PushEvent) {
  const [actor, group] = await Promise.all([
    displayName(evt.actor_id ?? null),
    evt.group_id ? groupName(evt.group_id) : Promise.resolve('your group'),
  ])

  let recipients: string[] = []
  let title = ''
  let body = ''
  // extra ID-only routing keys, per event
  const extraRouting: Record<string, string> = {}

  if (evt.event === 'comment_reply' && evt.recipient_id && evt.title_id) {
    const t = await titleInfo(evt.title_id)
    if (!t) return { skipped: 'title gone' }
    recipients = [evt.recipient_id]
    title = `${actor} replied to your take`
    body = `${t.name}: see what they said.`
    if (t.tmdbId !== null) {
      extraRouting.tmdb_id = String(t.tmdbId)
      extraRouting.media_type = t.mediaType
    }
  } else if (evt.event === 'group_added' && evt.recipient_id) {
    recipients = [evt.recipient_id]
    title = `${actor} added you to ${group}`
    body = 'Set your rubric and jump into the next round.'
  } else if (evt.event === 'round_started' && evt.session_id && evt.group_id) {
    const session = await sessionInfo(evt.session_id)
    if (!session) return { skipped: 'session gone' }
    recipients = (await memberIds(evt.group_id)).filter((id) => id !== evt.actor_id)
    title = `${actor} invited ${group}`
    body = `${session.titleName}: score it blind, then catch the reveal.`
  } else if (evt.event === 'member_locked' && evt.session_id && evt.group_id) {
    const session = await sessionInfo(evt.session_id)
    if (!session) return { skipped: 'session gone' }
    recipients = (await memberIds(evt.group_id)).filter((id) => id !== evt.actor_id)
    if (session.state === 'revealed') {
      title = `${actor} joined the reveal`
      body = `${session.titleName}'s Mashed just recomputed.`
    } else {
      title = `${actor} locked in scores`
      body = `${session.titleName} is waiting on the rest of ${group}.`
    }
  } else if (evt.event === 'new_message' && evt.message_id && evt.conversation_id) {
    const [conv, msg] = await Promise.all([
      conversationRow(evt.conversation_id),
      messageRow(evt.message_id),
    ])
    if (!conv || !msg) return { skipped: 'conversation gone' }

    const [members, muted, blocked] = await Promise.all([
      conversationMemberIds(conv),
      mutedIn(conv.id),
      blockedWith(evt.actor_id ?? ''),
    ])
    recipients = members.filter(
      (id) => id !== evt.actor_id && !muted.has(id) && !blocked.has(id),
    )

    // A pending request is ONE message to a stranger: it still notifies, or
    // the request would be invisible until they happened to open the app.
    // The text is resolved HERE, with the service key, never in the payload.
    const preview =
      msg.kind === 'title' || msg.kind === 'playlist'
        ? (msg.body || `shared ${msg.share_label ?? 'something'}`)
        : msg.body
    if (conv.kind === 'dm') {
      // A DM is already attributed by its title, so the body is just the text.
      title = actor
      body = preview
    } else {
      title =
        conv.kind === 'group' && conv.group_id
          ? await groupName(conv.group_id)
          : (conv.title ?? 'Chat')
      body = `${actor}: ${preview}`
    }
    extraRouting.conversation_id = conv.id
  } else {
    return { skipped: `unknown event ${evt.event}` }
  }

  const tokens = await tokensFor(recipients)
  if (tokens.length === 0) return { sent: 0, note: 'no registered devices' }

  const routing: Record<string, string> = { event: evt.event, ...extraRouting }
  if (evt.group_id) routing.group_id = evt.group_id
  if (evt.session_id) routing.session_id = evt.session_id
  const threadId = evt.conversation_id ?? evt.group_id ?? evt.title_id ?? 'mash'
  const results = await Promise.all(
    tokens.map((t) => sendApns(t.token, title, body, threadId, routing)),
  )
  return {
    sent: results.filter((r) => r === 'sent').length,
    pruned: results.filter((r) => r === 'pruned').length,
    failed: results.filter((r) => r === 'failed').length,
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  if (!PUSH_SHARED_SECRET || req.headers.get('x-push-secret') !== PUSH_SHARED_SECRET) {
    return json({ error: 'forbidden' }, 403)
  }
  if (!APNS_AUTH_KEY || !APNS_KEY_ID || !APPLE_TEAM_ID) {
    // Not configured yet: acknowledge so pg_net doesn't retry-storm.
    return json({ skipped: 'apns not configured' })
  }

  let evt: PushEvent
  try {
    evt = (await req.json()) as PushEvent
  } catch {
    return json({ error: 'bad payload' }, 400)
  }
  if (!evt?.event) return json({ error: 'bad payload' }, 400)
  // Most events are group-scoped, but two are not: a comment_reply can be on
  // a public thread, and a message belongs to a CONVERSATION — a DM has no
  // group at all. This check used to 400 every single message.
  const GROUPLESS = new Set(['comment_reply', 'new_message'])
  if (!evt.group_id && !GROUPLESS.has(evt.event)) return json({ error: 'bad payload' }, 400)
  if (evt.event === 'new_message' && !evt.conversation_id) {
    return json({ error: 'bad payload' }, 400)
  }

  try {
    return json(await composeAndSend(evt))
  } catch (err) {
    console.error('send-push failed', err)
    return json({ error: 'send failed' }, 500)
  }
})
