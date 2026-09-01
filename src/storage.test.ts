// @vitest-environment node
import { beforeEach, expect, it } from 'vitest'
import { MAX_SAVES, PROFILES, ROOM_MAX, ROOM_MIN, learn, restore, saveRoom, set, state } from './store'
import { CATALOG_TYPES } from './catalog'
import { violations } from './tools'
import { PRESETS } from './presets'

// Every write to the browser goes through one function that tries, prunes the oldest room memories,
// tries again, and only then gives up — telling the human whether the browser is FULL or has refused
// outright, because those need different sentences. None of it had ever run: a quota error is the
// kind of condition nobody reproduces by hand, so the recovery path was written once and left.
let store = new Map<string, string>()
let cap = Infinity

beforeEach(() => {
  store = new Map(); cap = Infinity
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const after = [...store].filter(([x]) => x !== k).reduce((n, [x, y]) => n + x.length + y.length, 0) + k.length + v.length
      if (after > cap) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e }
      store.set(k, v)
    },
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } })
  const p = PRESETS.find(x => x.id === 'dad-visits')!
  set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
    profile: p.profile, hour: 9, storage: 'ok', learned: [], notes: [], feed: [], history: [],
    proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
})

const fillWithOldRoomMemories = (n: number) => {
  for (let i = 0; i < n; i++)
    store.set(`room.learned.old_${i}...`, JSON.stringify([{ t: i + 1, text: `an argument about room ${i}`.repeat(6) }]))
}

it('a full browser loses old arguments before it loses your room', () => {
  fillWithOldRoomMemories(30)
  const roomy = [...store].reduce((n, [k, v]) => n + k.length + v.length, 0)
  cap = roomy + 200                       // no space for a save until something goes
  expect(saveRoom('my room'), 'it gave up instead of making room').toBe('ok')
  expect(state.storage, 'it reported a problem it had already solved').toBe('ok')
  expect([...store.keys()].filter(k => k.startsWith('room.learned.')).length,
    'it threw away nothing, or everything').toBeGreaterThan(0)
  expect([...store.keys()].some(k => k.startsWith('room.saves')), 'the room was not saved').toBe(true)
})

it('a browser with nothing left to give says so', () => {
  cap = 40                                 // room for almost nothing, and nothing to prune
  store.set('room.last', 'x')              // something is stored, so this is a full browser
  expect(saveRoom('my room')).toBe('blocked')
  expect(state.storage, 'a full browser was reported as blocked').toBe('full')
})

it('a browser that refuses everything is a different problem', () => {
  cap = 0                                  // private mode: nothing was ever stored
  expect(saveRoom('my room')).toBe('blocked')
  expect(state.storage, 'a blocked browser was reported as merely full').toBe('blocked')
})

it('the room memory survives a browser that is merely full', () => {
  fillWithOldRoomMemories(30)
  cap = [...store].reduce((n, [k, v]) => n + k.length + v.length, 0) + 300
  learn('the human rejected moving the sofa — you said it blocks the door')
  expect(state.learned.map(l => l.text), 'the lesson was lost').toHaveLength(1)
  expect(state.storage, 'it gave up on a browser it could have made room in').toBe('ok')
})

it('never keeps more saves than it promises', () => {
  for (let i = 0; i < MAX_SAVES + 3; i++) saveRoom(`room ${i}`)
  const saves = JSON.parse(store.get('room.saves') ?? '[]')
  expect(saves.length, `${saves.length} saves kept, and the page promises ${MAX_SAVES}`).toBeLessThanOrEqual(MAX_SAVES)
})

// A save is untrusted input too — it can come from an older version of this page, a hand-edited
// localStorage, or a room saved before a bound moved. restore() took whatever it found: a piece the
// catalogue no longer has, or a goal that was renamed, made check() throw and took the whole page
// down. The share loader has always cleaned what it reads; a save went in unwashed.
it('a damaged save cannot take the page down', () => {
  const bad: [string, unknown][] = [
    ['a piece the catalogue lost', { room: { w: 400, h: 400, doors: [], windows: [], outlets: [] },
      items: [{ id: 'a', type: 'hot_tub', x: 10, y: 10, rot: 0, w: 100, h: 100 },
              { id: 'b', type: 'sofa', x: 20, y: 20, rot: 0, w: 210, h: 90 }] }],
    ['a goal nobody has heard of', { room: { w: 400, h: 400, doors: [], windows: [], outlets: [] }, items: [], profile: 'nonsense' }],
    ['words where the numbers go', { room: { w: 'wide', h: null, doors: null, windows: 7, outlets: 'none' }, items: 'lots' }],
    ['an hour that does not exist', { room: { w: 400, h: 400, doors: [], windows: [], outlets: [] }, items: [], hour: 99 }],
    ['a room from before the bound moved', { room: { w: 1800, h: 1600, doors: [], windows: [], outlets: [] }, items: [] }],
  ]
  let taken = 0
  for (const [what, save] of bad) {
    // either answer is fine — refusing a save outright is as safe as cleaning it. What is not fine is
    // taking it and then falling over, which is what used to happen.
    if (restore(save as never)) taken++
    expect(() => violations(), `${what}: the page threw`).not.toThrow()
    expect(state.room.w, `${what}: room ${state.room.w}cm wide`).toBeLessThanOrEqual(ROOM_MAX)
    expect(state.room.w, `${what}: room ${state.room.w}cm wide`).toBeGreaterThanOrEqual(ROOM_MIN)
    expect(state.hour, `${what}: the clock says ${state.hour}`).toBeLessThanOrEqual(23)
    expect(PROFILES, `${what}: goal is ${state.profile}`).toContain(state.profile)
    for (const i of state.items) expect(CATALOG_TYPES, `${what}: kept a ${i.type}`).toContain(i.type)
  }
  expect(taken, 'every damaged save was refused, so nothing was cleaned').toBeGreaterThan(3)
  // and the good pieces in a half-damaged save are kept, not thrown out with the bad one
  restore(bad[0][1] as never)
  expect(state.items.map(i => i.id), 'a whole save was discarded for one bad piece').toEqual(['b'])
})
