import { useEffect, useId, useRef, useState } from 'react'
import { addMember, fetchMembers, fetchMyFriends, searchProfiles } from '../lib/api'
import type { GroupInfo, UserSearchResult } from '../lib/api'
import { fieldClass } from './ui'

/** Shared by Profile and Rate. Mount with key={group.id} to isolate each roster. */
export function AddGroupMembers({ group, userId, onAdded }: {
  group: GroupInfo
  userId: string
  onAdded: () => void
}) {
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [friends, setFriends] = useState<UserSearchResult[]>([])
  const [memberIds, setMemberIds] = useState<string[] | null>(null)
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const adding = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let stale = false
    setError(null)
    Promise.all([fetchMembers(group.id), fetchMyFriends(userId)])
      .then(([members, people]) => {
        if (stale) return
        setMemberIds(members.map((m) => m.userId))
        setFriends(people)
      })
      .catch(() => !stale && setError('Could not load people. Please try again.'))
    return () => { stale = true }
  }, [group.id, userId, retry])

  useEffect(() => {
    setResults([])
    const q = query.trim()
    if (q.length < 2 || memberIds === null) {
      setSearching(false)
      return
    }
    let stale = false
    setSearching(true)
    setError(null)
    const timer = setTimeout(() => {
      searchProfiles(q, [...memberIds, userId])
        .then((people) => !stale && setResults(people))
        .catch(() => !stale && setError('Search could not load. Please try again.'))
        .finally(() => !stale && setSearching(false))
    }, 350)
    return () => { stale = true; clearTimeout(timer) }
  }, [query, memberIds, userId, retry])

  async function add(person: UserSearchResult) {
    if (adding.current || group.role !== 'owner') return
    adding.current = true
    setBusyId(person.userId)
    setError(null)
    setNotice(null)
    try {
      await addMember(group.id, person.userId)
      setMemberIds((ids) => [...(ids ?? []), person.userId])
      setNotice(`${person.displayName} was added to ${group.name}. You are now in a group together.`)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this person. Try again.')
    } finally {
      adding.current = false
      setBusyId(null)
    }
  }

  if (group.role !== 'owner') return <p className="text-[13px] text-muted">Ask the group owner to add friends to {group.name}.</p>
  const suggestions = friends.filter((friend) => !memberIds?.includes(friend.userId))
  const people = query.trim().length >= 2 ? results : suggestions
  return (
    <div className="mp-rise">
      <p className="mb-3 text-[13px] leading-snug text-muted">
        Add someone directly to {group.name}. They need a Mash Potato account first.
      </p>
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-semibold">Search by display name</label>
      <input id={inputId} type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter at least 2 characters" className={fieldClass} />
      {error && <div role="alert" className="mt-3 text-[13px] text-coral">{error} <button type="button" onClick={() => setRetry((n) => n + 1)} className="min-h-11 px-2 underline">Try again</button></div>}
      {notice && <p role="status" className="mt-3 text-[13px] text-teal">{notice}</p>}
      {memberIds === null || searching ? (!error && <p role="status" className="mt-3 text-[13px] text-muted">{searching ? 'Searching…' : 'Loading people…'}</p>) : (
        <>
          {query.trim().length < 2 && suggestions.length > 0 && <p className="mb-1 mt-4 text-[12px] font-semibold text-muted">Friends from your other groups</p>}
          <ul className="divide-y divide-line/50">
            {people.map((person) => (
              <li key={person.userId} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 break-words text-[14px] font-medium">{person.displayName}</span>
                <button type="button" disabled={busyId !== null} onClick={() => void add(person)} aria-label={`Add ${person.displayName} to ${group.name}`} className="min-h-11 shrink-0 rounded-full border border-teal/40 px-4 text-[13px] font-semibold text-teal transition-colors hover:border-teal disabled:opacity-50">
                  {busyId === person.userId ? 'Adding…' : 'Add to group'}
                </button>
              </li>
            ))}
          </ul>
          {!error && query.trim().length >= 2 && people.length === 0 && <p className="mt-3 text-[13px] text-muted">No new people found. Check their display name; people already in this group are hidden.</p>}
        </>
      )}
    </div>
  )
}
