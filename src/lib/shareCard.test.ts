import { describe, expect, it } from 'vitest'
import { cardSticker, headlineLines, spreadWord } from './shareCard'

describe('the card mascot', () => {
  it('shouts when the group split, whatever the score', () => {
    expect(cardSticker(8.4, 3)).toBe('shouting')
    expect(cardSticker(2.1, 4.5)).toBe('shouting')
  })

  it('doubts a low Mashed, and otherwise brings popcorn', () => {
    expect(cardSticker(4.9, 1.2)).toBe('skeptical')
    expect(cardSticker(5, 1.2)).toBe('popcorn')
    expect(cardSticker(9.1, null)).toBe('popcorn')
    expect(cardSticker(null, null)).toBe('popcorn')
  })
})

describe('the headline', () => {
  it('colours the agreed category teal and the split one coral', () => {
    expect(headlineLines('United on Story. Split over Pacing.')).toEqual([
      [
        { text: 'United on ', tone: 'text' },
        { text: 'Story', tone: 'teal' },
        { text: '.', tone: 'text' },
      ],
      [
        { text: 'Split over ', tone: 'text' },
        { text: 'Pacing', tone: 'coral' },
        { text: '.', tone: 'text' },
      ],
    ])
  })

  it('keeps any other headline as one plain line', () => {
    expect(headlineLines('Same wavelength, every category.')).toEqual([
      [{ text: 'Same wavelength, every category.', tone: 'text' }],
    ])
  })
})

describe('the spread meter', () => {
  it('names how far apart the group was', () => {
    expect(spreadWord(0.4)).toBe('In sync')
    expect(spreadWord(1)).toBe('Close call')
    expect(spreadWord(2.9)).toBe('Close call')
    expect(spreadWord(3)).toBe('Split')
  })
})
