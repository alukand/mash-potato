import { useEffect, useRef, useState } from 'react'
import { deleteRubricPreset, fetchMyRubricPresets, savePersonalRubric, setFavoriteRubricPreset } from '../lib/api'
import type { GroupInfo, GroupRubricRow, UserRubricPreset } from '../lib/api'
import { defaultRubricRows, TASTE_MODES } from '../lib/rubricCatalog'
import { CtaButton, fieldClass } from './ui'
import { RubricRowsEditor } from './RubricRowsEditor'

interface Draft { id: string | null; name: string; rows: GroupRubricRow[] }

export function PersonalRubrics({ userId, groups, onOpenGroup }: {
  userId: string
  groups: GroupInfo[]
  onOpenGroup: (id: string) => void
}) {
  const [presets, setPresets] = useState<UserRubricPreset[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [original, setOriginal] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [retry, setRetry] = useState(0)
  const dirty = draft !== null && JSON.stringify(draft) !== original
  const valid = draft !== null && draft.name.trim().length > 0 && draft.rows.some((r) => r.enabled && r.weight > 0)

  useEffect(() => {
    let stale = false
    setError(null)
    fetchMyRubricPresets(userId).then((p) => !stale && setPresets(p)).catch(() => !stale && setError('Could not load your rubrics. Try again.'))
    return () => { stale = true }
  }, [userId, retry])

  function edit(preset?: UserRubricPreset, copy = false) {
    const next: Draft = { id: copy ? null : preset?.id ?? null, name: copy ? `${preset?.name ?? ''} copy`.slice(0, 40) : preset?.name ?? '', rows: (preset?.rows ?? defaultRubricRows()).map((r) => ({ ...r })) }
    setDraft(next)
    setOriginal(JSON.stringify(next))
    setError(null)
    setNotice(null)
    setConfirmDelete(null)
    setConfirmDiscard(false)
  }

  async function act(action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try { await action() } catch (err) { setError(err instanceof Error ? err.message : 'Could not save changes. Try again.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function save() {
    if (!draft || !valid) return
    if (presets?.some((p) => p.id !== draft.id && p.name.toLowerCase() === draft.name.trim().toLowerCase())) {
      setError('You already have a rubric with that name. Choose another name.')
      return
    }
    await act(async () => {
      const id = await savePersonalRubric(userId, draft.id, draft.name, draft.rows)
      setPresets((list) => [...(list ?? []).filter((p) => p.id !== id), { id, name: draft.name.trim(), rows: draft.rows, isFavorite: list?.find((p) => p.id === id)?.isFavorite ?? false }])
      setDraft(null)
      setNotice('Rubric saved. Existing groups keep their current weights.')
    })
  }

  return (
    <div>
      <p className="mb-4 text-[13px] leading-snug text-muted">Save your own sets of categories and weights for {TASTE_MODES.buff.plural} groups. Your favorite is used when you create or join one. These do not change your solo card.</p>
      {error && <div role="alert" className="mb-3 text-[13px] text-coral">{error}{presets === null && <button type="button" onClick={() => setRetry((n) => n + 1)} className="min-h-11 px-2 underline">Try again</button>}</div>}
      {notice && <p role="status" className="mb-3 text-[13px] text-teal">{notice}</p>}
      {draft ? (
        <form className="mp-rise" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <fieldset disabled={busy}>
            <legend className="mb-3 text-[15px] font-semibold">{draft.id ? 'Edit rubric' : 'New rubric'}</legend>
            <label className="mb-4 block text-[13px] font-semibold">Rubric name<input type="text" autoFocus required maxLength={40} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Story comes first" className={`mt-1.5 ${fieldClass}`} /></label>
            <RubricRowsEditor rows={draft.rows} onChange={(rows) => setDraft({ ...draft, rows })} disabled={busy} />
            <div className="mt-4 flex flex-wrap gap-2">
              <CtaButton type="submit" disabled={busy || !valid || (draft.id !== null && !dirty)} className="min-h-11 flex-1 px-4 text-[13px]">{busy ? 'Saving…' : 'Save rubric'}</CtaButton>
              <button type="button" onClick={() => dirty ? setConfirmDiscard(true) : setDraft(null)} className="min-h-11 rounded-full border border-line px-4 text-[13px] text-muted">Cancel</button>
            </div>
            {confirmDiscard && <div className="mp-rise mt-3 text-[13px]"><p>Discard your unsaved rubric changes?</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setConfirmDiscard(false)} className="min-h-11 px-3 text-teal">Keep editing</button><button type="button" onClick={() => { setDraft(null); setConfirmDiscard(false) }} className="min-h-11 px-3 text-coral">Discard changes</button></div></div>}
          </fieldset>
        </form>
      ) : (
        <>
          {presets === null ? <p className="text-[13px] text-muted">Loading rubrics…</p> : presets.length === 0 ? <p className="mb-3 text-[13px] text-muted">No saved rubrics yet. Start with the seven core categories and make them yours.</p> : (
            <div className="divide-y divide-line/50">
              {[...presets].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name)).map((p) => (
                <div key={p.id} className="py-3">
                  <p className="break-words text-[15px] font-semibold">{p.name}</p>
                  <p className="mt-1 text-[12px] text-muted">{p.rows.filter((r) => r.enabled).length} categories{p.isFavorite && <span className="ml-2 text-gold">★ Favorite for new groups</span>}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => edit(p)} aria-label={`Edit ${p.name}`} className="min-h-11 rounded-full border border-line px-4 text-[13px] font-semibold text-teal disabled:opacity-50">Edit</button>
                    <button type="button" disabled={busy} onClick={() => void act(async () => { await setFavoriteRubricPreset(userId, p.isFavorite ? null : p.id); setPresets(await fetchMyRubricPresets(userId)); setNotice(p.isFavorite ? 'Favorite cleared. New groups use the app default.' : `${p.name} is your favorite for new ${TASTE_MODES.buff.plural} groups.`) })} aria-pressed={p.isFavorite} className="min-h-11 rounded-full border border-line px-3 text-[13px] text-gold disabled:opacity-50">{p.isFavorite ? 'Remove favorite' : 'Make favorite'}</button>
                    <button type="button" disabled={busy} onClick={() => edit(p, true)} aria-label={`Make a copy of ${p.name}`} className="min-h-11 px-3 text-[13px] text-muted disabled:opacity-50">Copy</button>
                    <button type="button" disabled={busy} onClick={() => setConfirmDelete(p.id)} aria-label={`Delete ${p.name}`} className="min-h-11 px-3 text-[13px] text-muted hover:text-coral disabled:opacity-50">Delete</button>
                  </div>
                  {confirmDelete === p.id && <div className="mp-rise mt-2 text-[13px]"><p>Delete “{p.name}”? Existing group weights stay as they are.</p><div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => setConfirmDelete(null)} className="min-h-11 px-3 text-muted">Keep rubric</button><button type="button" disabled={busy} onClick={() => void act(async () => { await deleteRubricPreset(userId, p.id); setPresets((list) => list?.filter((item) => item.id !== p.id) ?? []); setConfirmDelete(null); setNotice('Rubric deleted.') })} className="min-h-11 px-3 text-coral">{busy ? 'Deleting…' : 'Delete rubric'}</button></div></div>}
                </div>
              ))}
            </div>
          )}
          <button type="button" disabled={busy || presets === null} onClick={() => edit()} className="mt-3 min-h-11 w-full rounded-full border border-gold/40 px-4 text-[13px] font-semibold text-gold disabled:opacity-50">+ New rubric</button>
          {groups.some((g) => g.tasteMode === 'buff') && <div className="mt-5"><p className="text-[13px] font-semibold">Use a saved rubric in an existing group</p><p className="mt-1 text-[12px] text-muted">Open a group, choose Edit my rubric, then load a saved rubric and save your group weights.</p><div className="mt-2 flex flex-wrap gap-2">{groups.filter((g) => g.tasteMode === 'buff').map((g) => <button key={g.id} type="button" onClick={() => onOpenGroup(g.id)} className="min-h-11 max-w-full rounded-full border border-line px-3 text-[13px] text-teal"><span className="block truncate">{g.name} →</span></button>)}</div></div>}
        </>
      )}
    </div>
  )
}
