import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runDemo, stopDemo } from './demo'
import { PRESETS } from './presets'
import { loadPreset, registerTools, violations } from './tools'
import { score } from './rules'
import { set, state, subscribe } from './store'

// The scripted session is the safety net: it exists for the moment the live agent misbehaves on
// camera. Its steps were tested by three separate blocks that each reimplemented the runner's own
// `$last` substitution — so the substitution could break and every one of them would still pass.
// This drives the real runner through the real window.room, which is the whole point of it.
// This file drives the real runner through every scripted step of every preset. Alone the heaviest
// test takes 1.0s; under the whole suite running in parallel it crossed vitest's 5s default and went
// red on a machine that was merely busy. A flaky red teaches you to ignore red, so the bound is set
// from that measurement — still short enough that a runner which never finishes fails rather than hangs.
vi.setConfig({ testTimeout: 20_000 })

const scene = (id: string) => { const p = PRESETS.find(x => x.id === id)!
  set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
    profile: p.profile, hour: 9, demo: null, notes: [], feed: [], history: [], proposals: [],
    humanEvents: [], calls: [], layouts: {}, flat: null, here: null }) }

beforeEach(() => {
  Object.defineProperty(globalThis, 'location', { value: { origin: 'https://x', pathname: '/', search: '', href: 'https://x/' }, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
  // no modelContext on either: this exercises the path a visitor without an agent takes, which is
  // exactly who the scripted session exists for
  Object.defineProperty(globalThis, 'document', { value: {}, configurable: true })
  // loadPreset writes the scene into the address bar
  Object.defineProperty(globalThis, 'history', { value: { replaceState() {}, pushState() {} }, configurable: true })
  registerTools()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

const play = async (id: string) => { scene(id); const done = runDemo(); await vi.runAllTimersAsync(); await done }

it('every scripted session runs to the end and hands the page back', async () => {
  for (const p of PRESETS.filter(x => x.demo?.length)) {
    await play(p.id)
    expect(state.demo, `${p.id} left the page stuck in demo mode`).toBeNull()
    expect(state.calls.length, `${p.id} made no tool calls at all`).toBeGreaterThanOrEqual(p.demo!.length - 1)
  }
})

it('$last really is the piece the previous step made', async () => {
  const p = PRESETS.find(x => x.demo?.some(([, a]) => Object.values(a).includes('$last')))!
  await play(p.id)
  // the substitution is the runner's, not a test's copy of it: a literal '$last' reaching a tool
  // comes back as "no such piece", and the transcript would carry the word itself
  expect(JSON.stringify(state.calls), 'a raw $last reached a tool').not.toContain('$last')
  expect(state.feed.some(f => /\$last/.test(f.text ?? '')), 'the transcript shows the placeholder').toBe(false)
})

it('pressing it twice does not start two sessions over each other', async () => {
  scene('dad-visits')
  const first = runDemo()
  expect(state.demo, 'the first session did not start').not.toBeNull()
  await runDemo()                                   // the second press, while the first is mid-flight
  expect(state.demo, 'the second press ended the first session').not.toBeNull()
  await vi.runAllTimersAsync(); await first
  expect(state.demo).toBeNull()
})

it('stop actually stops it', async () => {
  scene('dad-visits')
  const done = runDemo()
  await vi.advanceTimersByTimeAsync(2500)
  const sofar = state.calls.length
  stopDemo()
  await vi.runAllTimersAsync(); await done
  expect(state.calls.length, 'it kept going after stop').toBeLessThan(sofar + 3)
  expect(state.demo).toBeNull()
})

it('a tool that throws mid-session is shrugged off', async () => {
  scene('dad-visits')
  const room = (globalThis as { room?: Record<string, unknown> }).room!
  const real = room.get_room
  room.get_room = () => { throw new Error('the page fell over') }
  const done = runDemo(); await vi.runAllTimersAsync(); await done
  room.get_room = real
  expect(state.demo, 'one bad step ended the whole session').toBeNull()
  expect(state.calls.length, 'it gave up after the first failure').toBeGreaterThan(2)
})

it('something throwing outside a step does not kill the button for good', async () => {
  // A throwing TOOL is already shrugged off by the step's own catch. What is not caught is anything
  // thrown by set() itself — and set() runs every store subscriber, one of which is the tool
  // registration sync. If that ever throws, state.demo stays set, the guard at the top of runDemo
  // refuses to start again, and the button that exists for the moment the live agent misbehaves is
  // dead for the rest of the session with no way back but a reload.
  scene('dad-visits')
  // it has to throw AFTER a step number has been set, or the page was never in demo mode and the
  // test proves nothing — feed() calls set() before the loop even begins
  let fired = false
  const off = subscribe(() => { if (state.demo !== null && !fired) { fired = true; throw new Error('a subscriber fell over') } })
  const done = runDemo().catch(() => {})
  await vi.runAllTimersAsync(); await done
  off()
  expect(fired, 'the subscriber never threw — the page was never in demo mode').toBe(true)
  expect(state.demo, 'the page is stuck in demo mode and can never play another session').toBeNull()
  // and it can genuinely be played again
  scene('dad-visits')
  const again = runDemo(); await vi.runAllTimersAsync(); await again
  expect(state.calls.length, 'the second session never ran').toBeGreaterThan(2)
})

// The narration is read off the screen during the demo, and one line of it is a claim about the
// session's own outcome: "75/100 on a room this hard is the honest answer, not 100". Every step was
// tested; the number they add up to was not. If a rule or a tool changed such that the thirteen calls
// no longer improved the room, the page would be saying 75 on camera while showing something else.
it('the open-plan session really does get from 11 to the 75 it claims', async () => {
  loadPreset('open-plan')
  const before = score(violations() as never)
  const said = Number(PRESETS.find(p => p.id === 'open-plan')!.demo!.map(([, , n]) => n).join(' ').match(/(\d+)\/100/)?.[1])
  expect(said, 'the narration stopped quoting a score').toBeTruthy()

  // no ticker answering questions: a scripted session never stops to ask, and there is a test above
  // that says so. An interval here would also fight the fake timers into an infinite loop.
  const done = runDemo()
  await vi.runAllTimersAsync()
  await done

  const after = score(violations() as never)
  expect(before, 'open-plan no longer starts in a heap').toBeLessThan(20)
  expect(after, `the narration says ${said}/100 and the session ends on ${after}`).toBe(said)
})

// dad-visits ends WORSE than it started, and that is the point of it — the session switches the goal
// to accessibility and the room stops being good enough. A test that only ever asserted "the score
// went up" would have to make an exception for this one, so it asserts the shape instead.
// The scripted session's one measured claim drifted away from the layout it was written against:
// "a 62cm gap" checked out at 115cm, so the safety-net demo's showcase beat was the page correcting
// its own script by 53cm, in red, on camera. The number is now deliberately a bluff — but a pinned
// one, because the failure was nobody noticing when it stopped being the number DEMO.md quotes.
it('every number the scripted session says out loud is the one the page reports back', async () => {
  const seen: Record<string, unknown[]> = {}
  for (const p of PRESETS.filter(x => x.demo?.some(([n, a]: any) => n === 'say' && a.claim))) {
    await play(p.id)
    seen[p.id] = state.notes.filter(n => n.verdict).map(n => ({ ok: n.verdict!.ok, actual: n.verdict!.actual, said: n.verdict!.said }))
  }
  expect(seen, 'a scripted claim changed — DEMO.md quotes the verdict word for word, so update it too')
    .toEqual({ 'dad-visits': [{ ok: false, actual: 65, said: 95 }] })
})

it('the dad-visits session ends by exposing the problem, not hiding it', async () => {
  loadPreset('dad-visits')
  expect(score(violations() as never), 'it no longer starts at 90').toBe(90)
  const done = runDemo()
  await vi.runAllTimersAsync()
  await done
  expect(state.profile, 'the session no longer switches to accessibility').toBe('accessibility')
  expect(score(violations() as never), 'the room no longer looks worse once judged for a wheelchair').toBeLessThan(60)
})
