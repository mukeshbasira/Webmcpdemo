import { expect, it } from 'vitest'
import { TOOLS, wrap } from './tools'
import { PRESETS } from './presets'
import { answerNote, set, state } from './store'
import { planSheet } from './sheet'

// "A plan you can hand to someone" is a claimed feature, and the whole-home half of it — a cover with
// the floor plan and then a page per room — had never been generated in a test. It works. What it
// rests on is not obvious from reading it: one CSS rule, `.room + .room { break-before: page }`, which
// only does anything while the blocks stay siblings. Nest them and the sheet silently becomes one
// long page, which nobody discovers until they print it.
const run = async (name: string, args: unknown = {}) => {
  const tick = setInterval(() => { const q = state.notes.find(n => n.options?.includes('✓ allow') && !n.answered); if (q) answerNote(q.id, '✓ allow') }, 5)
  try { return JSON.parse((await wrap(TOOLS.find(t => t.name === name)!).execute(args)).content[0].text) } finally { clearInterval(tick) }
}
const blocks = (html: string) => [...html.matchAll(/class="room"/g)].map(m => m.index!)

it('a home prints as a cover and a page per room', async () => {
  await run('define_flat', { bedrooms: 2, people: 4 })
  const html = planSheet('Test home', [])
  const at = blocks(html)
  expect(at.length, 'a cover plus one block per room').toBe(state.flat!.rooms.length + 1)
  // the page break is a sibling selector: nest one block inside another and it stops applying
  for (const [a, b] of at.slice(0, -1).map((a, i) => [a, at[i + 1]])) {
    const between = html.slice(a, b)
    expect(between.split('<div').length - between.split('</div').length,
      'the room blocks stopped being siblings — the whole home prints as one long page').toBe(0)
  }
  expect(html, 'the rule that makes each room its own page is gone').toContain('break-before: page')
  for (const r of state.flat!.rooms) expect(html, `${r.name} is missing from the sheet`).toContain(r.name)
  expect(html, 'the sheet prints centimetres only').toMatch(/\d+ ?cm/)
  expect(html, 'the sheet prints no feet and inches').toMatch(/\d+' ?\d*"/)
  expect(html, 'something reached the paper unrendered').not.toMatch(/undefined|NaN|\[object Object\]/)
})

it('prints the room you are standing in, including what you just changed', async () => {
  await run('define_flat', { bedrooms: 1, people: 2 })
  await run('enter_room', { id: 'kitchen' })
  await run('add_item', { type: 'hob' })
  // still in the kitchen, nothing saved back — the sheet has to stow the room on screen first
  const html = planSheet('Test home', [])
  const kitchen = state.flat!.rooms.find(r => r.id === 'kitchen')!
  const at = blocks(html)
  const start = at.find(i => html.slice(i, i + 400).includes(kitchen.name))!
  const end = at.find(i => i > start) ?? html.length
  expect(html.slice(start, end), 'the hob was left on screen and never reached the paper').toMatch(/[Hh]ob/)
})

it('a single room still prints without a home around it', () => {
  const p = PRESETS.find(x => x.id === 'dad-visits')!
  set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
    profile: p.profile, hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [],
    calls: [], layouts: {}, flat: null, here: null })
  const html = planSheet('One room', [])
  expect(blocks(html), 'a single room should be one block, not a home').toHaveLength(1)
  expect(html).not.toMatch(/undefined|NaN/)
})

// Seen on a generated sheet: "shelf" with its last letter painted over by the wall. The label logic
// already grew inward for a piece against a wall, but the wall is drawn 4 units wide and centred on
// the boundary, so it covers 2 units of the room — and the label was placed to end at exactly
// room.w - 2, which is under it.
it('no label on the drawing runs into a wall', () => {
  const p = PRESETS.find(x => x.id === 'dad-visits')!
  set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
    profile: 'general', hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [],
    calls: [], layouts: {}, flat: null, here: null })
  const html = planSheet('One room', [])
  const labels = [...html.matchAll(/<text x="([\d.-]+)"[^>]*?font-size="([\d.]+)"[^>]*?text-anchor="(\w+)"[^>]*>([\w-]+)<\/text>/g)]
  expect(labels.length, 'no piece labels on the drawing at all').toBeGreaterThan(4)
  // The outline is 4 units wide and centred on the boundary, so it covers 2 units of the room. Ending
  // exactly there is the bug — "shelf" did, and its f was painted over — so the label has to clear the
  // inner edge with daylight to spare, not merely reach it.
  const INK = 2, CLEAR = 2
  for (const [, xs, fss, anchor, id] of labels) {
    const x = Number(xs), w = id.length * Number(fss) * 0.58
    const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x
    expect(left, `"${id}" starts at ${left.toFixed(0)}, and the left wall is inked to ${INK}`).toBeGreaterThanOrEqual(INK + CLEAR)
    expect(left + w, `"${id}" ends at ${(left + w).toFixed(0)}, and the right wall is inked from ${state.room.w - INK}`)
      .toBeLessThanOrEqual(state.room.w - INK - CLEAR)
  }
})
