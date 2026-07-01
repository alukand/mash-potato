import { describe, it, expect } from 'vitest'
import { scoreColor } from './scoreColor'

describe('scoreColor', () => {
  it('anchors the ramp: coral -> gold -> lime', () => {
    expect(scoreColor(1)).toBe('rgb(224, 122, 95)') // coral
    expect(scoreColor(5.5)).toBe('rgb(231, 178, 78)') // gold (midpoint)
    expect(scoreColor(10)).toBe('rgb(201, 209, 78)') // lime
  })

  it('clamps out-of-range values to the ends', () => {
    expect(scoreColor(0)).toBe(scoreColor(1))
    expect(scoreColor(42)).toBe(scoreColor(10))
  })
})
