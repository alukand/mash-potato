import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultRubricRows } from './rubricCatalog'

const db = vi.hoisted(() => ({
  from: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(),
}))
vi.mock('./supabase', () => ({ supabase: { from: db.from } }))

import { savePersonalRubric } from './api'

describe('saving personal rubrics', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    for (const method of [db.from, db.insert, db.update, db.eq, db.select]) method.mockReturnValue(db)
    db.single.mockResolvedValue({ data: { id: 'saved-rubric' }, error: null })
  })

  it('renames and edits the same owned rubric without resetting its favorite or owner', async () => {
    const rows = defaultRubricRows()
    const id = await savePersonalRubric('me', 'saved-rubric', '  Story first  ', rows)
    expect(id).toBe('saved-rubric')
    expect(db.update).toHaveBeenCalledWith({ name: 'Story first', rows })
    expect(db.eq.mock.calls).toEqual([['user_id', 'me'], ['id', 'saved-rubric']])
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.select).toHaveBeenCalledWith('id')
  })

  it('creates a copy as a new owned row instead of overwriting a namesake', async () => {
    const rows = defaultRubricRows()
    await savePersonalRubric('me', null, 'My copy', rows)
    expect(db.insert).toHaveBeenCalledWith({ user_id: 'me', name: 'My copy', rows })
    expect(db.update).not.toHaveBeenCalled()
  })

  it('reports a duplicate name so the editor can keep the unsaved draft', async () => {
    db.single.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    await expect(savePersonalRubric('me', null, 'Taken', defaultRubricRows())).rejects.toThrow('Choose another name')
  })

  it('does not report success when the requested row is missing or inaccessible', async () => {
    db.single.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No matching rubric' } })
    await expect(savePersonalRubric('me', 'missing', 'Rename', defaultRubricRows())).rejects.toThrow('No matching rubric')
  })
})
