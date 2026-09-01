import { beforeAll, expect, it } from 'vitest'
import { TOOLS, activeTools, loadHome, loadPreset, registerTools, wrap } from './tools'
import { PRESETS } from './presets'
import { PROFILES, answerNote, nudgeAgent, set, state } from './store'

// registerTools() is the seam this whole project turns on — contextual tools appear and disappear by
// registering and aborting against document.modelContext, and Chrome fires `toolchange` because of it.
// It had no test. Everything else asserted what activeTools() *intends*; nothing checked that the
// browser ends up holding that set, which is a different claim and the one an agent actually sees.
//
// A fake browser that refuses to register the same name twice, and honours abort.
const live: string[] = []
const handed = new Map<string, { execute?: (a?: unknown) => Promise<unknown> }>()
const calls: string[] = []

beforeAll(() => {
  Object.defineProperty(globalThis, 'location', { value: { origin: 'https://x', pathname: '/', search: '', href: 'https://x/' }, configurable: true })
  const mc = {
    registerTool: (t: { name: string; execute?: (a?: unknown) => Promise<unknown> }, opts?: { signal?: AbortSignal }) => {
      calls.push(t.name)
      handed.set(t.name, t)
      if (live.includes(t.name)) throw new Error(`registered twice without an abort between: ${t.name}`)
      live.push(t.name)
      opts?.signal?.addEventListener('abort', () => { const i = live.indexOf(t.name); if (i >= 0) live.splice(i, 1) })
      return Promise.resolve()
    },
  }
  Object.defineProperty(globalThis, 'navigator', { value: { modelContext: mc }, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, 'history', { value: { replaceState() {}, pushState() {} }, configurable: true })
  registerTools()
})

const run = async (name: string, args: unknown = {}) => {
  const tick = setInterval(() => { const q = state.notes.find(n => n.options?.includes('✓ allow') && !n.answered); if (q) answerNote(q.id, '✓ allow') }, 5)
  try { return JSON.parse((await wrap(TOOLS.find(t => t.name === name)!).execute(args)).content[0].text) }
  finally { clearInterval(tick) }
}

it('the browser holds exactly the tools the page means to offer', async () => {
  const p = PRESETS.find(x => x.id === 'dad-visits')!
  set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9,
    notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
  expect(live.length, 'the fake browser was never asked to register anything').toBeGreaterThan(10)
  expect([...live].sort()).toEqual([...activeTools()].sort())
})

it('a contextual tool really reaches the browser, and really leaves it', async () => {
  await run('define_flat', { bedrooms: 1, people: 2 })
  await run('enter_room', { id: 'bed1' })
  expect(live, 'an empty bedroom has no bedside to check').not.toContain('bedside_check')
  await run('add_item', { type: 'bed_double' })
  expect(live, 'the bedside check never reached the browser').toContain('bedside_check')
  await run('enter_room', { id: 'kitchen' })
  expect(live, 'the bedside check is still registered in the kitchen').not.toContain('bedside_check')
})

it('walking the same rooms forty times does not accumulate anything', async () => {
  await run('define_flat', { bedrooms: 2, people: 4 })
  const before = calls.length
  for (let i = 0; i < 10; i++) for (const id of ['bed1', 'kitchen', 'bath', 'hall']) await run('enter_room', { id })
  expect(new Set(live).size, 'the same tool is in the list twice').toBe(live.length)
  expect([...live].sort(), 'the browser and the page disagree after forty room changes').toEqual([...activeTools()].sort())
  // 10 registrations for 40 room changes: only what actually changed. A number near 40 would mean
  // every room change tears the whole list down and builds it again, which is `toolchange` noise
  // an agent has to re-read each time.
  expect(calls.length - before, `${calls.length - before} registerTool calls for 40 room changes`).toBeLessThan(25)
}, 120_000)

// The page→agent channel: a transient tool whose description IS the message. Three things about it
// were unguarded — a new message must replace the old tool rather than leave it registered, reading
// the message must take the tool away again ("when your agent reads it, this disappears"), and the
// whole thing has to actually reach the browser.
it('a message from the human arrives as a tool, and leaves when it is read', async () => {
  const p = PRESETS.find(x => x.id === 'dad-visits')!
  set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9,
    nudge: null, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
  expect(live, 'a stale message tool was already registered').not.toContain('read_message_from_human')

  nudgeAgent('The human moved the sofa back. Ask why.')
  await new Promise(r => setTimeout(r, 0))
  expect(live, 'the message never reached the browser').toContain('read_message_from_human')
  expect(live.filter(n => n === 'read_message_from_human'), 'registered more than once').toHaveLength(1)

  // a second message replaces the first, it does not stack another tool on top of it
  nudgeAgent('And they turned the lamp off.')
  await new Promise(r => setTimeout(r, 0))
  expect(live.filter(n => n === 'read_message_from_human'), 'the old message tool was left registered').toHaveLength(1)
  expect(state.nudge!.text, 'the first message was lost').toContain('moved the sofa back')
  expect(state.nudge!.text, 'the second message was lost').toContain('lamp off')

  // Call the one the BROWSER was handed, not window.room's. They were two separate implementations
  // of the same tool, and the registered one was the copy no test could reach.
  await handed.get('read_message_from_human')!.execute!({})
  await new Promise(r => setTimeout(r, 20))
  expect(state.nudge, 'the message stayed queued after the agent read it').toBeNull()
  expect(live, 'the tool is still in the browser after being read').not.toContain('read_message_from_human')
})

// The other half of the question "Screen at eye level" raised: a rule was advertised that nothing
// could ever raise. A tool with a `when()` no state satisfies is the same fault on the tool side —
// it would sit in the count three write-ups quote and never reach a browser. Walk the states the
// page actually has and require every tool to turn up in one of them.
it('every tool the page ships can reach a browser in some state', async () => {
  const call = async (n: string, a: unknown = {}) =>
    JSON.parse((await wrap(TOOLS.find(x => x.name === n)!).execute(a)).content[0].text)
  const seen = new Set<string>()
  const snap = () => activeTools().forEach(n => seen.add(n))
  for (const p of PRESETS) { loadPreset(p.id); snap()
    for (const profile of PROFILES) { set({ profile }); snap() } }
  loadHome('flat'); snap()
  for (const r of state.flat!.rooms) { await call('enter_room', { id: r.id }); snap() }
  await call('enter_room', { id: 'bed1' }); await call('add_item', { type: 'bed_double', x: 40, y: 40 }); snap()
  await call('enter_room', { id: 'kitchen' })
  for (const type of ['hob', 'sink', 'fridge']) await call('add_item', { type, x: 20, y: 20 })
  await call('move_items', { id: 'hob', x: 30, y: 30 }); snap()
  loadPreset('living-pile'); await call('say', { text: 'hi' }); await call('baseline'); snap()
  expect(TOOLS.map(t => t.name).filter(n => !seen.has(n)), 'shipped, counted, and no state registers it').toEqual([])
}, 30_000)
