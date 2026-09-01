// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { Plan } from './Plan'
import { PRESETS } from './presets'
import { humanEvent, propose, set, state, updateItem } from './store'
import { TOOLS, violations, wrap } from './tools'

// "Every control tabs, takes Enter and says what it is — including the ✓ and ✗ on a proposal, which
// are shapes in an SVG and had to be taught to behave like buttons." That claim was checked by a
// regex over App.tsx and Panel.tsx, which never look at Plan.tsx, where those shapes live. A <g> with
// an onClick renders perfectly and is invisible to a keyboard and to a screen reader, and nothing
// about the page looks wrong when it happens.
let host: HTMLDivElement | null = null
const render = (node: React.ReactElement) => {
  host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  act(() => { root.render(node) })
  return host
}
afterEach(() => { host?.remove(); host = null })

const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
  set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
    profile: p.profile, hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [],
    calls: [], layouts: {}, flat: null, here: null }) }

it('the drawing tells a screen reader what it shows', () => {
  scene()
  const el = render(<Plan violations={violations()} />)
  const svg = el.querySelector('svg')!
  expect(svg.getAttribute('role'), 'the plan is an unlabelled graphic').toBe('img')
  const said = svg.getAttribute('aria-label') ?? ''
  expect(said.length, 'the description is too short to be one').toBeGreaterThan(40)
  // it has to describe THIS room, not a generic sentence
  expect(said, 'the description does not give the size of the room').toMatch(/\d+ by \d+ centimetres/)
  expect(said.toLowerCase(), 'the description does not name what is in the room').toContain('sofa')
})

it('the ✓ and ✗ on a proposal are real buttons', () => {
  scene()
  act(() => { propose({ item: 'sofa', x: 40, y: 40, rot: 0 }) })
  const el = render(<Plan violations={violations()} />)
  const buttons = [...el.querySelectorAll('[role="button"]')]
  expect(buttons.length, 'the proposal has no controls a keyboard can reach').toBeGreaterThanOrEqual(2)
  for (const b of buttons) {
    expect(b.getAttribute('tabindex'), 'a control the tab key skips').toBe('0')
    expect((b.getAttribute('aria-label') ?? '').length, 'a control that does not say what it is').toBeGreaterThan(4)
  }
  const accept = buttons.find(b => /as the agent suggests/.test(b.getAttribute('aria-label') ?? ''))!
  const keep = buttons.find(b => /where it is/.test(b.getAttribute('aria-label') ?? ''))!
  expect(accept, 'nothing accepts the proposal').toBeTruthy()
  expect(keep, 'nothing rejects the proposal').toBeTruthy()
})

it('Enter moves the furniture, exactly as the mouse would', () => {
  scene()
  const was = state.items.find(i => i.id === 'sofa')!.x
  act(() => { propose({ item: 'sofa', x: was + 60, y: 40, rot: 0 }) })
  const el = render(<Plan violations={violations()} />)
  const accept = [...el.querySelectorAll('[role="button"]')]
    .find(b => /as the agent suggests/.test(b.getAttribute('aria-label') ?? ''))! as HTMLElement
  act(() => { accept.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
  expect(state.proposals.length, 'Enter did nothing — the control is mouse-only').toBe(0)
  expect(state.items.find(i => i.id === 'sofa')!.x, 'the sofa did not move').not.toBe(was)
})

it('the space bar works too, and does not scroll the page instead', () => {
  scene()
  act(() => { propose({ item: 'sofa', x: 40, y: 40, rot: 0 }) })
  const el = render(<Plan violations={violations()} />)
  const keep = [...el.querySelectorAll('[role="button"]')]
    .find(b => /where it is/.test(b.getAttribute('aria-label') ?? ''))! as HTMLElement
  const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
  act(() => { keep.dispatchEvent(ev) })
  expect(state.proposals.length, 'the space bar did not reject the proposal').toBe(0)
  expect(ev.defaultPrevented, 'the space bar scrolled the page as well as pressing the control').toBe(true)
})

// Seen on the live page: a turning circle against the right wall put its label half off the drawing —
// "no 1.5m t" — in the beat the accessibility profile exists for. The circles are allowed to run past
// the wall; the words are not.
it('no label runs off the edge of the drawing', () => {
  const p = PRESETS.find(x => x.id === 'dad-visits')!
  set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
    profile: 'accessibility', hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [],
    calls: [], layouts: {}, flat: null, here: null })
  const el = render(<Plan violations={violations()} />)
  const labels = [...el.querySelectorAll('text')].filter(t => /no [\d.]+m turn/.test(t.textContent ?? ''))
  expect(labels.length, 'this scene stopped stranding anything, so the test checks nothing').toBeGreaterThan(1)
  for (const t of labels) {
    // the plan is drawn at a scale, and the font scales with it — so take the half-width from the
    // size actually rendered rather than assuming 11px. Monospace is about 0.6 of its size per
    // character, so half a label is length x fontSize x 0.3.
    const half = (t.textContent ?? '').length * Number(t.getAttribute('font-size')) * 0.3
    const x = Number(t.getAttribute('x'))
    expect(x, `"${t.textContent}" starts at ${(x - half).toFixed(0)}, left of the wall`).toBeGreaterThanOrEqual(half - 1)
    expect(x, `"${t.textContent}" ends at ${(x + half).toFixed(0)}, past the ${state.room.w}cm wall`).toBeLessThanOrEqual(state.room.w - half + 1)
  }
})

// The landing page tells a judge to try this: "Drag something yourself — the agent's next call sees
// it." The pointer half cannot be tested here honestly: the handler converts client coordinates with
// DOMPoint.matrixTransform against the SVG's screen matrix, and jsdom has neither — standing those in
// means asserting about my own arithmetic rather than the page's. So this covers what the sentence
// actually promises the agent, driven exactly as the drag handler drives it.
it('a piece moved by hand reaches the agent on its next call', async () => {
  scene()
  const plant = state.items.find(i => i.id === 'plant')!
  const from = { x: plant.x, y: plant.y }
  updateItem('plant', { x: from.x - 60, y: from.y - 60 })
  humanEvent({ action: 'moved', item: 'plant', from, to: { x: from.x - 60, y: from.y - 60 },
    text: `dragged the plant to (${from.x - 60},${from.y - 60})` })

  const out = JSON.parse((await wrap(TOOLS.find(t => t.name === 'measure')!)
    .execute({ a: 'sofa', b: 'tv' })).content[0].text)
  const seen = out.humanChanges?.find((h: { item?: string }) => h.item === 'plant')
  expect(seen, "the agent's next call does not mention what the human did").toBeTruthy()
  expect(seen.action, 'it does not say they moved it').toBe('moved')
  expect(seen.text, 'it does not say so in words the agent can repeat').toMatch(/dragged the plant/)
  expect(seen.from, 'it does not say where it came from').toEqual(from)

  // and it is drained: the call after that must not repeat it
  const again = JSON.parse((await wrap(TOOLS.find(t => t.name === 'measure')!)
    .execute({ a: 'sofa', b: 'tv' })).content[0].text)
  expect(again.humanChanges, 'the same change is reported twice').toBeUndefined()
})
