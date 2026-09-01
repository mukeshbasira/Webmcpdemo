// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import App from './App'
import { TOOLS, loadPreset, registerTools, wrap } from './tools'
import { PROFILES, ROOM_MAX, ROOM_MIN, addNote, answerNote, set, state } from './store'

const defineFlat = (a: unknown) => wrap(TOOLS.find(t => t.name === 'define_flat')!).execute(a)
const enterRoom = (a: unknown) => wrap(TOOLS.find(t => t.name === 'enter_room')!).execute(a)

// The most basic question there is, and nothing asked it: does the page come up? A crash on load is
// the one failure that costs everything — the judge opens the link and there is nothing there — and
// it is invisible to every test that imports a function instead of mounting the app.
// It also puts App, Panel, FlatPlan and Scene3D into the coverage report, which had been quietly
// leaving them out: they are never imported by a test, so the number was flattering itself.
let host: HTMLDivElement | null = null
beforeAll(() => {
  // jsdom has no WebGL, which is the point — this is the path a machine without it takes
  ;(globalThis as { matchMedia?: unknown }).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  // without this the panel's tool list is empty and never renders, so anything asserted about it
  // would be asserted about a component that is not on the page
  registerTools()
})
afterEach(() => { host?.remove(); host = null; loadPreset('dad-visits') })   // a test that builds a home must not leave the next one standing in it

const mount = () => {
  host = document.createElement('div'); document.body.append(host)
  act(() => { createRoot(host!).render(<App />) })
  return host
}

it('the page comes up, with the room drawn and the panel beside it', () => {
  loadPreset('dad-visits')
  const el = mount()
  expect(el.querySelector('svg'), 'nothing was drawn').toBeTruthy()
  expect(el.textContent, 'the page rendered empty').toBeTruthy()
  expect(el.textContent!.length, 'the page came up nearly blank').toBeGreaterThan(200)
})

it('says what the agent can see, and what is in the room', () => {
  loadPreset('dad-visits')
  const text = mount().textContent!
  expect(text, 'the panel does not mention tools at all').toMatch(/tool/i)
  expect(text.toLowerCase(), 'the furniture in the room is not named anywhere on the page').toContain('sofa')
})

it('reaching for the 3D view says something is happening', async () => {
  loadPreset('dad-visits')
  const el = mount()
  const btn = [...el.querySelectorAll('button')].find(b => /^3d$/i.test((b.textContent ?? '').trim()))
  expect(btn, 'there is no way to reach the 3D view').toBeTruthy()
  await act(async () => { btn!.click() })
  // Scene3D is lazy, so what a visitor sees first is the Suspense fallback. Asserting on the page
  // text without this comment in mind matches the "3D" on the button itself — which is what an
  // earlier version of this test did, and it would have passed with no 3D view in the app at all.
  expect(el.textContent, 'the view switched to an empty box with no word of explanation').toContain('building the room')
})

it('the whole home draws, with a room you can walk into', async () => {
  loadPreset('dad-visits')
  const el = mount()
  // define_flat asks before it builds over a furnished room, and nobody is here to answer
  const tick = setInterval(() => { const q = state.notes.find(n => n.options?.includes('\u2713 allow') && !n.answered); if (q) answerNote(q.id, '\u2713 allow') }, 5)
  await act(async () => { await defineFlat({ bedrooms: 2, people: 4 }) })
  clearInterval(tick)
  expect(el.textContent, 'the home did not draw').toMatch(/[Kk]itchen/)
  const chips = [...el.querySelectorAll('[role="button"]')]
  const chip = chips.find(b => /kitchen/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))
  expect(chip, 'no way to walk into a room without a mouse').toBeTruthy()
  expect(chip!.getAttribute('tabindex'), 'the rooms of a home cannot be tabbed to').toBe('0')
})

it('the transcript and the score are announced, not just displayed', () => {
  loadPreset('dad-visits')
  const el = mount()
  expect(el.querySelectorAll('[aria-live]').length, 'a page whose premise is telling you things tells them silently').toBeGreaterThan(0)
})

// A page left open across a deploy asks for a chunk that no longer exists. That took the whole app
// down — "Something broke", the room gone with it — for what is only an old page asking for a file
// that moved. Seen live: the 3D view after a redeploy, with the layout lost.
it('a chunk that no longer exists does not take the room down with it', async () => {
  const { Boundary } = await import('./Boundary')
  const Boom = () => { throw new Error('Failed to fetch dynamically imported module: /assets/Scene3D-abc.js') }
  host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  act(() => { root.render(<Boundary only="the 3D view"><Boom /></Boundary>) })
  quiet.mockRestore()
  const text = host.textContent ?? ''
  expect(text, 'an old page reads as a crash').not.toContain('Something broke')
  expect(text, 'it does not say what actually happened').toContain('updated while you had it open')
  expect(text, 'it does not say the rest of the page is fine').toContain('the 3D view')
  expect([...host.querySelectorAll('button')].some(b => /reload/i.test(b.textContent ?? '')), 'no way to get the new version').toBe(true)
})

it('a real crash still says so', async () => {
  const { Boundary } = await import('./Boundary')
  const Boom = () => { throw new Error('cannot read properties of undefined') }
  host = document.createElement('div'); document.body.append(host)
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  act(() => { createRoot(host!).render(<Boundary><Boom /></Boundary>) })
  quiet.mockRestore()
  expect(host.textContent, 'every error now claims to be a stale page').toContain('Something broke')
})

// The panel told you to switch to accessibility to grow a wheelchair audit — while you were standing
// in a bathroom that had switched itself on the way in and already had the tool. Advice to do a thing
// that is done reads as a page that is not paying attention to where you are.
it('the tool list explains the tool that is there, not one that is not', async () => {
  loadPreset('dad-visits')
  const el = mount()
  expect(el.textContent, 'the hint disappeared entirely').toMatch(/set the goal to/)
  expect(el.textContent, 'a general room should not claim a contextual tool').not.toMatch(/is in it because/)

  const tick = setInterval(() => { const q = state.notes.find(n => n.options?.includes('✓ allow') && !n.answered); if (q) answerNote(q.id, '✓ allow') }, 5)
  await act(async () => { await defineFlat({ bedrooms: 1, people: 2 }) })
  clearInterval(tick)
  await act(async () => { await enterRoom({ id: 'bath' }) })
  const text = el.textContent ?? ''
  expect(text, 'in a bathroom it still tells you to turn on what is already on').not.toMatch(/set the goal to/)
  expect(text, 'it does not name the tool this room actually grew').toMatch(/access_check is in it because this room is judged on accessibility/)
})

// The save banner said "That is 12 rooms — delete one to make space" for every failure, including a
// private window where nothing had ever been saved. Telling somebody to delete rooms they do not have
// is worse than saying nothing: they go and look for them.
it('a browser that will not store anything is not blamed on the number of saves', async () => {
  loadPreset('dad-visits')
  const el = mount()
  const refuse = () => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') },
    removeItem: () => {}, key: () => null, get length() { return 0 } } })
  const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  refuse()
  try {
    const btn = [...el.querySelectorAll('button')].find(b => /save this room/i.test(b.textContent ?? ''))
    expect(btn, 'there is no way to save a room').toBeTruthy()
    await act(async () => { btn!.click() })
    const save = [...el.querySelectorAll('button')].find(b => /^save$/i.test((b.textContent ?? '').trim()))
    expect(save, 'the save panel did not open').toBeTruthy()
    await act(async () => { save!.click() })
    const text = el.textContent ?? ''
    expect(text, 'it blamed a private window on having too many rooms').not.toMatch(/delete one to make space/)
    expect(text, 'it does not say what actually went wrong').toMatch(/will not let the page store anything/)
  } finally { if (was) Object.defineProperty(globalThis, 'localStorage', was) }
})

// Four places had an opinion about how big a room may be, and I consolidated three of them earlier
// without noticing the fourth: the size field a human types into allowed 20 to 2000 while the room
// itself is ROOM_MIN to ROOM_MAX. Typing 2000 showed a number the page then quietly reduced, and
// typing 20 gave you a 150cm room while the field said 20.
it('the size fields offer what the room will actually accept', () => {
  loadPreset('dad-visits')
  const el = mount()
  const nums = [...el.querySelectorAll('input[type="number"]')] as HTMLInputElement[]
  expect(nums.length, 'the room size fields are gone').toBeGreaterThanOrEqual(2)
  for (const n of nums.slice(0, 2)) {
    expect(Number(n.min), `a field offers ${n.min}cm and the room starts at ${ROOM_MIN}`).toBe(ROOM_MIN)
    expect(Number(n.max), `a field offers ${n.max}cm and the room stops at ${ROOM_MAX}`).toBe(ROOM_MAX)
  }
})

// and the goals the panel offers are the goals the page has, not a second list beside them
it('the goals on screen are the goals the page knows', () => {
  loadPreset('dad-visits')
  const text = mount().textContent ?? ''
  for (const p of PROFILES) expect(text, `the panel does not offer ${p}`).toContain(p)
})

// The banner that carries a question sits over the plan, and it had whitespace-nowrap on the box
// itself — so max-w-[90%] could never take effect and a long question ran out of the plan pane and
// over the side panel. The longest one the page asks is define_flat's, which names the room and
// counts what is about to be lost, and it is the beat where the human is being asked to decide.
it('a long question stays inside the plan rather than running over the panel', async () => {
  loadPreset('dad-visits')
  const el = mount()
  act(() => { addNote({ kind: 'warn',   // no item: an unattached question is what becomes the banner
    text: 'Your agent wants to build a new 2BHK — this room and all 9 pieces in it go. Allow?',
    options: ['✓ allow', '✗ refuse'] }) })
  await act(async () => {})
  const banner = [...el.querySelectorAll('div')].find(d => /wants to build a new 2BHK/.test(d.textContent ?? '')
    && d.className.includes('absolute'))
  expect(banner, 'the question never reached the plan').toBeTruthy()
  expect(banner!.className, 'the box cannot wrap, so its width is whatever the sentence needs')
    .not.toMatch(/\bwhitespace-nowrap\b/)
  expect(banner!.className, 'nothing caps how wide it can get').toMatch(/max-w-/)
  expect(banner!.className, 'it cannot wrap onto a second line').toMatch(/flex-wrap/)
  // and it is centred by margins, not by left-1/2: an absolutely positioned box offset to the centre
  // can only shrink-to-fit the half of the pane to its right, so even a short line wrapped
  expect(banner!.className, 'centred in a way that halves the width it can use').not.toMatch(/left-1\/2/)
})

// This page can be embedded in a frame a few hundred px wide, and the pulsing tool name in the header is
// the whole visible proof that a call from ANOTHER ORIGIN landed here. All three write-ups tell a
// presenter to point at it during that beat. It was `hidden lg:flex` — gated at 1024px — so in the
// one place the demo points at it, it was not on screen at all.
it('the tool the agent just used shows at any width, because the embed is narrow', async () => {
  loadPreset('dad-visits')
  const el = mount()
  await act(async () => { await wrap(TOOLS.find(t => t.name === 'find_space')!).execute({ type: 'lamp' }) })
  const tag = [...el.querySelectorAll('header span')].find(s => (s.textContent ?? '').trim() === 'find_space')
  expect(tag, 'the header does not show the tool that was just called').toBeTruthy()
  expect(tag!.className, 'the indicator is hidden below a breakpoint, and the embed is 545px wide')
    .not.toMatch(/\bhidden\b|\b(sm|md|lg|xl):/)
})

// The likeliest first experience of all: a judge opens the link in whatever browser they have. There
// is no WebMCP there, and what they see decides whether they keep going or close the tab. The page
// has to say so plainly, say what to do about it, and — the part that matters — still work.
it('a browser with no WebMCP is told what to do, and the page still works', async () => {
  loadPreset('dad-visits')
  set({ view: '2d' })   // an earlier test in this file leaves the 3D view on, and loadPreset does not reset it
  const el = mount()
  const text = el.textContent ?? ''
  expect(state.mcp, 'this test is not actually running without WebMCP').toBe('missing')
  // this is the SCENE, which is where the submission's own link lands — not the landing page
  expect(text, 'the panel does not say the browser has no WebMCP').toMatch(/no WebMCP in this browser/i)
  expect(text, 'it does not say the page still works without one').toMatch(/works on its own/i)
  // and it has to name the switch, not just the browser: "Chrome with WebMCP" leaves somebody in
  // Chrome with no idea what to do next
  expect(text, 'it names a browser without naming the flag').toContain('chrome://flags/#enable-webmcp-testing')

  // and it is not a dead end: the scenes, the plan and the rules are all there
  expect(el.querySelector('svg'), 'no room is drawn').toBeTruthy()
  expect(text, 'the furniture is not listed').toMatch(/sofa/i)
  expect([...el.querySelectorAll('button')].some(b => /watch a session/i.test(b.textContent ?? '')),
    'the one way in without an agent is missing').toBe(true)
  expect(text, 'the rules stopped being shown').toMatch(/\d+\/100|problem/i)
})

// Pressing "reply" on the agent's question put the input in the SIDE PANEL — three hundred pixels
// from the sentence being answered, and on a narrow layout the panel is shut, so the box the page
// had just asked you to type in was not on screen at all. Both kinds of note answer in place now:
// the banner opens its own box, and a bubble pinned to a piece opens one over the plan.
it('the reply box opens where the question is, never in the panel', () => {
  loadPreset('dad-visits')
  const el = mount()
  const boxes = () => [...el.querySelectorAll('input')].filter(i => i.getAttribute('aria-label') === 'Your reply to the agent')
  expect(boxes(), 'a reply box is showing before anyone asked for one').toHaveLength(0)

  for (const note of [{ text: 'Shall I move the sofa?' }, { text: 'Shall I move it?', item: 'sofa' }]) {
    act(() => { addNote(note as never) })
    const id = state.notes.at(-1)!.id
    act(() => { set({ replyTo: id }) })
    const box = boxes()
    expect(box, `${note.item ? 'a bubble on the plan' : 'the banner'} opened ${box.length} reply boxes`).toHaveLength(1)
    expect(box[0].closest('aside'), 'the box opened in the side panel, away from the question').toBeNull()
    act(() => { set({ replyTo: null, notes: [] }) })
  }
})

// The 2D/3D toggle sat in the header, one control among five, beside a breadcrumb and a save button —
// and people worked on the room without ever noticing the page had a second view. It belongs on the
// thing it changes. Placement is layout, which jsdom has none of, so what is pinned is the structure
// that makes the placement true: it is out of the header, and it is inside the element that holds
// the plan rather than a sibling of it.
it('the view toggle sits with the plan, not in the header', () => {
  loadPreset('dad-visits')
  const el = mount()
  const toggle = [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === '3D')
  expect(toggle, 'the 3D button is gone').toBeTruthy()
  expect(el.querySelector('header')!.contains(toggle!), 'the toggle is back in the header').toBe(false)
  // the plan and the toggle share an ancestor that holds nothing else of the page
  const stage = toggle!.closest('main > div')!
  expect(stage, 'the toggle is not inside the area that holds the room').toBeTruthy()
  expect(stage.querySelector('svg'), 'the toggle is nowhere near the drawing it switches').toBeTruthy()
  // and both states are reachable and say which one is on
  const two = [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === '2D')!
  expect([two, toggle!].map(b => b.getAttribute('aria-pressed')).sort(), 'nothing says which view is showing').toEqual(['false', 'true'])
})

// A bare "›" is a shape, not a word. Nobody knew it hid the panel, and nobody who pressed it knew how
// to get it back.
it('the panel says what hiding it does, and how to undo it', () => {
  loadPreset('dad-visits'); set({ panelHidden: false })
  const el = mount()
  const hide = [...el.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'hide this panel')!
  expect(hide, 'nothing hides the panel any more').toBeTruthy()
  expect(hide.textContent, 'the control is a chevron and no word').toMatch(/hide/i)
  act(() => { hide.click() })
  const show = [...el.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'show the panel')!
  expect(show, 'hiding the panel left no way back').toBeTruthy()
  expect(show.textContent, 'the way back does not say what it is').toMatch(/show panel/i)
  act(() => { show.click() })
  expect([...el.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === 'hide this panel'), 'the panel did not come back').toBe(true)
})

// Un-hiding the tool indicator added an item to a header that was already full at narrow widths, and
// it then overflowed: 456px of content in 354. Measured in a real browser at both widths that matter
// — a 390px phone and a 545px frame — the header now fits exactly, because the widest thing
// in it steps aside. These are the two structural facts that make that true.
it('the header gives up the save control before it gives up the tool the agent used', () => {
  loadPreset('dad-visits')
  const header = mount().querySelector('header')!
  const saves = [...header.querySelectorAll('div')].find(d => /save this room/i.test(d.textContent ?? ''))
  expect(saves, 'the save control is gone from the header').toBeTruthy()
  expect(saves!.className, 'the save control stays at every width, so the header overflows on a phone')
    .toMatch(/hidden sm:/)
})
