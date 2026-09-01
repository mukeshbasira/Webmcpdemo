import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TOOLS, coerce, encodeShare, loadHome, loadPreset, loadShare, openFrom, plain, violations, wrap } from './tools'
import { PRESETS } from './presets'
import { CHAT_MAX, bedSide, check, score } from './rules'
import { buildFlat, flatSize, homeFromParam } from './flat'
import { CATALOG } from './catalog'
import { DOOR, ROOM_MAX, WALL_NAME, WINDOW, acceptProposal, addNote, answerNote, confirm, getItem, learn, loadLearned, rejectProposal, set, state, whoPhrase, type Item } from './store'

// An agent sends what it likes. The schema's `enum` and `required` are advisory — Chrome does not
// enforce either — so every one of these arrives at the tool exactly as written.
const JUNK: [string, unknown][] = [
  ['undefined', undefined], ['null', null], ['empty object', {}], ['empty string', ''],
  ['a bare word', 'garbage'], ['an array', []], ['zero', 0], ['false', false],
  ['a number', 42], ['nested null', { id: null }], ['NaN', { x: NaN, y: NaN, id: 'sofa' }],
]

const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
  set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9,
    notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null }) }

// `share` builds a URL from location. Tests run in node, so without this the sweep would "find" a
// crash in every tool that touches the address bar and learn nothing about any of them.
beforeAll(() => {
  if (typeof globalThis.location === 'undefined')
    Object.defineProperty(globalThis, 'location', { value: { origin: 'https://mcp-five-puce.vercel.app', pathname: '/', search: '', href: 'https://mcp-five-puce.vercel.app/', hash: '' }, configurable: true })
  // loadPreset writes the scene into the address bar, which node does not have either
  if (typeof (globalThis as { history?: unknown }).history === 'undefined')
    Object.defineProperty(globalThis, 'history', { value: { replaceState() {}, pushState() {} }, configurable: true })
  // and no localStorage, which is where a room's remembered refusals live
  if (typeof (globalThis as { localStorage?: unknown }).localStorage === 'undefined') {
    const mem = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() { return mem.size },
    } })
  }
})

it('every tool answers junk with a sentence, not a stack trace', async () => {
  const crash: string[] = [], junky: string[] = []
  for (const t of TOOLS) for (const [what, arg] of JUNK) {
    scene()
    // a tool that stops to ask would otherwise hold this test for its full 90s timeout
    const tick = setInterval(() => {
      const q = state.notes.find(n => n.options?.includes('✓ allow') && !n.answered)
      if (q) answerNote(q.id, '✓ allow')
    }, 5)
    let res: Awaited<ReturnType<ReturnType<typeof wrap>['execute']>>
    try { res = await wrap(t).execute(arg) } finally { clearInterval(tick) }
    const body = JSON.parse(res.content[0].text ?? 'null')
    const err = String(body?.error ?? '')
    // An internal throw reaching the agent is the failure: it names our variables, not their mistake.
    if (/TypeError|ReferenceError|is not a function|Cannot read|is not defined/.test(err))
      crash.push(`${t.name} / ${what} → ${err.slice(0, 100)}`)
    const line = plain(t.name, coerce(t, arg), body)
    for (const [where, text] of [['reply', JSON.stringify(body)], ['transcript', line ?? '']] as const)
      if (/undefined|NaN|\[object Object\]/.test(text))
        junky.push(`${t.name} / ${what} / ${where} → ${text.slice(0, 120)}`)
  }
  expect([...crash, ...junky], 'these reach the agent, or the human reading the transcript').toEqual([])
}, 120_000)

it('the sweep covers every tool and would notice a new one', () => {
  expect(TOOLS.length).toBeGreaterThanOrEqual(28)
  expect(JUNK.length).toBeGreaterThanOrEqual(11)
})

// The junk above is what an agent sends when something has gone wrong. These are what it sends when
// everything is going right and it is simply writing English: metres because the human said metres,
// a capital because the label had one, "couch" because that is the word.
describe('the mistakes a model makes while doing its best', () => {
  const call = async (name: string, args: unknown) => {
    scene(); const t = TOOLS.find(x => x.name === name)!
    return JSON.parse((await wrap(t).execute(args)).content[0].text)
  }

  it('reads 1.5 as metres and says so, instead of parking the sofa in the corner', async () => {
    const r = await call('move_items', { id: 'sofa', x: 1.5, y: 2 })
    expect(r.error, 'moved it to 1.5cm and blamed the overlap').toMatch(/metres/)
    // it quoted a hard-coded "x:1.5" whatever arrived, which reads as though the page misheard the
    // very number it is complaining about
    expect((await call('move_items', { id: 'sofa', x: 3, y: 2 })).error, 'the message does not quote the number that was sent')
      .toMatch(/x:3 puts it 3cm from the wall, not 3m/)
    expect(r.did_you_mean[0]).toMatchObject({ id: 'sofa', x: 150, y: 200 })
    // The human's room gets the last word: someone who means the top-left corner can still have it.
    const forced = await call('move_items', { id: 'sofa', x: 1.5, y: 2, force: true })
    expect(forced.error, 'no way to overrule the guess').toBeUndefined()
  })

  it('an id the room does not have is told so, not lectured about units', async () => {
    // the units check ran over every entry, so a piece that does not exist got a lecture about
    // centimetres instead of being told nobody knows what it is
    const r = await call('move_items', { id: 'nope', x: 1, y: 1 })
    expect(r.error ?? '', 'answered about units for furniture that is not there').not.toMatch(/metres/)
    expect(r.unknown, 'never said the id was unknown').toEqual(['nope'])
  })

  it('a whole-centimetre spot near the wall is not mistaken for metres', async () => {
    const r = await call('move_items', { id: 'sofa', x: 200, y: 20 })
    expect(r.error).toBeUndefined()
  })

  it('takes an id with the capital or the article the model read', async () => {
    for (const id of ['Sofa', 'the sofa', ' SOFA ']) {
      const r = await call('move_items', { id, x: 100, y: 100 })
      expect(r.unknown ?? [], `${id} went unrecognised`).toEqual([])
      // and the write lands: reading the right piece then writing to nothing reported "already_there"
      expect(r.already_there, `${id} resolved for reading but not for moving`).toBeUndefined()
    }
  })

  it('will not guess between two pieces that differ only by case', () => {
    scene()
    expect(getItem('Sofa')?.id, 'one candidate should resolve').toBe('sofa')
    set(s => ({ items: [...s.items, { ...s.items.find(i => i.id === 'sofa')!, id: 'SOFA' }] }))
    expect(getItem('Sofa'), 'picked one of two candidates that differ only by case').toBeUndefined()
    expect(getItem('SOFA')?.id, 'an exact match still wins outright').toBe('SOFA')
  })

  it('numbers written as strings are numbers', async () => {
    const r = await call('move_items', { id: 'plant', x: '120', y: '80' })
    expect(r.already_there, 'a quoted number moved nothing').toBeUndefined()
  })

  it('says what a couch is called here', async () => {
    expect((await call('add_item', { type: 'couch' })).nearest).toContain('sofa')
    expect((await call('add_item', { type: 'Armchair' })).nearest).toContain('armchair')
    // suggested, never substituted — the page is putting real furniture in someone's room
    expect((await call('add_item', { type: 'couch' })).error).toMatch(/no such piece/)
  })
})

// An agent pays for every byte the page hands back, and the first call is the biggest. These numbers
// are measured, not guessed — the point is to notice the day a reply doubles, not to pick a limit.
describe('what a reply costs the agent', () => {
  const bytes = async (name: string) => ((await wrap(TOOLS.find(t => t.name === name)!).execute({})).content[0].text ?? '').length
  const fill = (n: number) => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: { ...p.room, w: 900, h: 900 }, profile: 'accessibility', hour: 9,
      items: Array.from({ length: n }, (_, i) => ({ ...p.items[i % p.items.length], id: `it_${i}`, x: (i % 9) * 90, y: Math.floor(i / 9) * 90 })),
      notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null }) }

  // 1.2x of measured, and it is worth being honest about the reach of that: putting every item into
  // access_check's reply costs +32% and trips it, but replacing the one-line catalogue with full spec
  // objects costs +8% and does not. A cap tight enough to catch that would fail on ordinary edits and
  // I would raise it every time, which is a guard that has stopped guarding. This one catches the
  // class that actually hurts: a reply that suddenly doubles because a list stopped being summarised.
  it('the first call fits in a reply an agent can read', async () => {
    for (const p of PRESETS) {
      set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9,
        notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
      const g = await bytes('get_room')
      expect(g, `get_room answered ${g} characters for ${p.id}`).toBeLessThan(8_700)   // measured 7238, open-plan
      const a = await bytes('access_check')
      expect(a, `access_check answered ${a} characters for ${p.id}`).toBeLessThan(3_500) // measured 2905, open-plan
    }
  })

  it('a room four times as full does not cost four times as much', async () => {
    fill(10); const small = await bytes('get_room'), smallA = await bytes('access_check')
    fill(40); const big = await bytes('get_room'), bigA = await bytes('access_check')
    // measured 1.7× and 3.2× for 4× the furniture — fixed overhead dominates get_room, and
    // access_check is one line per destination. Anything steeper is a list that grew a nested object.
    expect(big / small, `get_room grew ${(big / small).toFixed(1)}× for 4× the items`).toBeLessThan(2.2)
    expect(bigA / smallA, `access_check grew ${(bigA / smallA).toFixed(1)}× for 4× the items`).toBeLessThan(4.2)
  })
})


// A share link is the page's only promise about the future: the room you send is the room they open.
// It has been broken twice by a field nobody thought to encode — `extras` dropped a study on arrival,
// and the walls were sent for months before anyone noticed the far end rebuilds them. Both were found
// one at a time. This is the same question asked mechanically, of every scene the page ships.
describe('a link is the room you sent', () => {
  it('every preset survives its own share link unchanged', () => {
    for (const p of PRESETS) {
      if (!p.items.length) continue
      set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
        profile: p.profile, hour: 14, notes: [], feed: [], history: [], proposals: [], humanEvents: [],
        calls: [], layouts: {}, flat: null, here: null })
      const was = JSON.parse(JSON.stringify({ room: state.room, items: state.items, profile: state.profile, hour: state.hour }))

      expect(loadShare(encodeShare()), `${p.id} produced a link it rejects itself`).toBe(true)

      expect(state.items.map(i => i.id).sort(), `${p.id} lost or gained furniture in transit`).toEqual(was.items.map((i: Item) => i.id).sort())
      expect(state.profile, `${p.id} arrived under a different goal`).toBe(was.profile)
      expect(state.hour, `${p.id} arrived at a different time of day`).toBe(was.hour)
      for (const k of ['w', 'h'] as const)
        expect(state.room[k], `${p.id} room.${k} changed in transit`).toEqual(was.room[k])
      // Openings used to be renumbered at the far end — "north window" arrived as "window 1" — and
      // five messages read that name out loud: "Sun through the north window", "you walk in through
      // the door". So the name is part of the room, not decoration, and it has to survive too.
      for (const k of ['doors', 'windows', 'outlets'] as const)
        expect(state.room[k].map((o: any) => [o.id, o.wall, o.pos, o.width]), `${p.id} ${k} changed in transit`)
          .toEqual(was.room[k].map((o: any) => [o.id, o.wall, o.pos, o.width]))
      for (const a of was.items as Item[]) {
        const b = state.items.find(i => i.id === a.id)!
        for (const k of ['type', 'x', 'y', 'rot', 'w', 'h'] as const)
          expect(b[k], `${p.id}: ${a.id}.${k} arrived as ${b[k]}, was ${a[k]}`).toBe(a[k])
      }
    }
  })

  it('the sentences that name a window still read after the trip', async () => {
    const p = PRESETS.find(x => x.id === 'office-glare')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
      profile: p.profile, hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [],
      calls: [], layouts: {}, flat: null, here: null })
    const before = violations().map(v => v.msg).join(' | ')
    expect(before, 'this scene stopped naming a window at all').toMatch(/east window/)
    expect(loadShare(encodeShare())).toBe(true)
    const after = violations().map(v => v.msg).join(' | ')
    expect(after, 'the shared room says "the window 1"').not.toMatch(/window \d/)
    expect(after, 'the window lost its name in transit').toMatch(/east window/)
  })

  // north and season decide where the sun falls, and no preset sets either — so asserting them in the
  // sweep above compared undefined with undefined and would have passed with the fields deleted.
  // A field only tested by fixtures that never carry it is not tested.
  it('carries the two fields no preset happens to set', () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: { ...JSON.parse(JSON.stringify(p.room)), north: 135, season: 'winter' },
      items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 14, notes: [], feed: [], history: [],
      proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
    expect(loadShare(encodeShare())).toBe(true)
    expect(state.room.north, 'which way the room faces was dropped in transit').toBe(135)
    expect(state.room.season, 'the season was dropped in transit — the sun arrives at the wrong angle').toBe('winter')
  })
})

// Found by reading a whole session the way an agent receives it, rather than by testing a tool. One
// natural sentence — brief({who: 'me and my dad, who uses a wheelchair', activity: 'watching tv
// together'}) — went wrong in three separate ways at once, and every one of them looked like a
// working call.
describe('the brief an agent actually writes', () => {
  // scene() leaves state.brief alone, and brief() reads its own previous answer as a default — so
  // without this every case here is answered by the one before it. The first version of these tests
  // was graded against a leftover brief and reported a bug in the matcher that was not there.
  const brief = async (a: unknown) => { scene(); set({ brief: null })
    return JSON.parse((await wrap(TOOLS.find(t => t.name === 'brief')!).execute(a)).content[0].text) }

  it('reads a phrase about the room as the activity it names', async () => {
    for (const [said, want] of [['watching tv together', 'watch'], ['sleeping', 'sleep'],
      ['we study here', 'study'], ['working from home', 'work'], ['dining', 'dine']] as const)
      expect((await brief({ activity: said, people: 2 })).brief.activity, `"${said}" was thrown away`).toBe(want)
  })

  it('will not choose for the human when the phrase names two', async () => {
    const r = await brief({ activity: 'watch tv while studying', people: 2 })
    // it said "not watch", which passes just as well if the page picked "study" — the fault is
    // choosing at all, so neither may be the answer
    expect(['watch', 'study'], 'the page picked one of the two meanings').not.toContain(r.brief.activity)
    expect((r.corrected ?? []).join(' '), 'it does not say what the ambiguity was').toMatch(/could be .*(watch|study)/)
  })

  it('says when nobody has told it how many people', async () => {
    const r = await brief({ activity: 'watch' })
    expect(r.brief.people, 'the default changed').toBe(1)
    // every rule about seats and places counts against this number, so assuming it in silence
    // answers the question the tool exists to ask
    expect((r.corrected ?? []).join(' '), 'it assumed one person and said nothing').toMatch(/nobody has said/)
    expect((await brief({ activity: 'watch', people: 4 })).corrected?.join(' ') ?? '', 'it complains when told').not.toMatch(/nobody has said/)
  })

  // The fourth way the same sentence went wrong, found by reading what the page did NOT say. The
  // clause shortName cuts off is the one that decides every clearance in the room, and the reply
  // carried on as if the human had never mentioned it: 90/100 under the general rules, for a room
  // the man in the wheelchair cannot cross.
  it('will not let the word that changes every clearance go by unmentioned', async () => {
    const r = await brief({ who: 'me and my dad, who uses a wheelchair', people: 2, activity: 'watch' })
    expect(r.brief.who, 'the label kept the clause after all — this case is no longer the one it tests').toBe('me and my dad')
    expect(r.hint ?? '', 'the wheelchair was dropped in silence').toMatch(/wheelchair/i)
    expect(r.hint ?? '', 'it does not name the tool that acts on it').toMatch(/set_profile/)
    // naming it is the whole point; switching for the human is not the page's call, and the demo
    // turns on the human seeing the score fall when the goal changes
    expect(r.brief, 'the page changed the goal by itself').toBeTruthy()
    expect(state.profile, 'the page switched the profile instead of saying so').not.toBe('accessibility')
    for (const said of ['a rollator', 'my mobility scooter', 'gran, on crutches', 'wheel chairs'])
      expect((await brief({ who: said, people: 2, activity: 'watch' })).hint ?? '', `"${said}" went unmentioned`).toMatch(/set_profile/)
    // nothing to point out once the rules are already on, and no false alarm on an ordinary chair
    expect((await brief({ who: 'me in my armchair', people: 2, activity: 'watch' })).hint, 'an armchair set it off').toBeUndefined()
    scene(); set({ brief: null, profile: 'accessibility' })
    const on = JSON.parse((await wrap(TOOLS.find(t => t.name === 'brief')!).execute({ who: 'my dad, who uses a wheelchair', people: 2, activity: 'watch' })).content[0].text)
    expect(on.hint, 'it nags for a profile that is already set').toBeUndefined()
  })

  it('shortens a name to something a person would have written', async () => {
    for (const [said, want] of [
      ['me and my dad, who uses a wheelchair', 'me and my dad'],
      ['two flatmates and a cat that owns the sofa', 'two flatmates and a cat'],
      ['kids (7 and 9)', 'kids (7 and 9)'],
    ] as const) {
      const r = await brief({ who: said, people: 2, activity: 'watch' })
      expect(r.brief.who, `"${said}" was cut badly`).toBe(want)
      // it is spliced straight into the line the human reads
      expect(r.status, 'the label left a gap or a dangling clause in the sentence').not.toMatch(/ {2}|, to |,$/)
    }
  })
})

// A refusal used to end "Take one of `instead`" whatever came back — and when no legal spot exists
// the reply carries `least_bad`, not `instead`. So in the one case where the agent most needs telling
// what to do next, it was sent to a key that was not in the response. That reads like the page lost
// something, and an agent that trusts it will describe a field that does not exist to the human.
describe('a reply never points at a key it does not carry', () => {
  const NAMES = new Set([...TOOLS.map(t => t.name),
    ...TOOLS.flatMap(t => Object.keys((t.inputSchema as any).properties ?? {}))])
  const dangling = (out: unknown, where: string) => {
    const bad: string[] = []
    if (!out || typeof out !== 'object') return bad
    const keys = new Set(Object.keys(out as object))
    const scan = (v: unknown): void => {
      if (typeof v === 'string') {
        for (const m of v.matchAll(/`([a-z_]{3,24})`/g))
          if (!NAMES.has(m[1]) && !keys.has(m[1])) bad.push(`${where}: points at \`${m[1]}\`, which is not in the reply`)
      } else if (Array.isArray(v)) v.forEach(scan)
      else if (v && typeof v === 'object') Object.values(v).forEach(scan)
    }
    scan(out); return bad
  }
  const call = async (name: string, args: unknown = {}) => {
    const tick = setInterval(() => { const q = state.notes.find(n => n.options?.includes('✓ allow') && !n.answered); if (q) answerNote(q.id, '✓ allow') }, 5)
    try { return JSON.parse((await wrap(TOOLS.find(x => x.name === name)!).execute(args)).content[0].text) } finally { clearInterval(tick) }
  }

  it('across a working session and a failing one', async () => {
    const runs: [string, unknown][] = [
      ['get_room', {}], ['sense_room', {}], ['find_space', { id: 'sofa' }], ['find_space', { type: 'lamp' }],
      ['move_items', { id: 'sofa', x: 0, y: 0 }], ['move_items', { id: 'nope', x: 0, y: 0 }], ['move_items', {}],
      ['add_item', { type: 'hot_tub' }], ['add_item', { type: 'lamp' }], ['arrange', {}], ['baseline', {}],
      ['measure', { a: 'sofa', b: 'tv' }], ['say', { text: 'hi' }], ['brief', {}], ['undo', {}],
      ['access_check', {}], ['dock_item', { id: 'rug' }], ['remove_item', { id: 'plant', keep: true }], ['sun', {}],
    ]
    const bad: string[] = []
    for (const preset of ['dad-visits', 'living-pile']) {
      loadPreset(preset)
      for (const [n, a] of runs) bad.push(...dangling(await call(n, a), `${preset}/${n}`))
    }
    // The branch every one of those misses. Under accessibility no legal spot for the sofa exists, so
    // the refusal answers with least_bad — and the fixtures above only ever produced `instead`, which
    // is why an earlier version of this sweep reported "none" while the bug was still there.
    loadPreset('dad-visits')
    await call('set_profile', { profile: 'accessibility' })
    const refused = await call('move_items', { id: 'sofa', x: 210, y: 40, rot: 0 })
    expect(refused.least_bad, 'this scene stopped producing the refusal this test exists for').toBeTruthy()
    bad.push(...dangling(refused, 'accessibility/move_items'))

    expect(bad, 'an agent told to read a field that is not there').toEqual([])
  }, 90_000)
})

// The sentence the human reads, in every room of a home. `who` stands in place of "person"/"people",
// so a bedroom setting who:'them' for itself produced "for 2 them to sleep" while the hall next door
// read "for 4 people to talk". Found by printing the status line of each room rather than by testing
// the function that builds it.
describe('the line the human reads in each room of a home', () => {
  const call = async (n: string, a: unknown = {}) => {
    const tick = setInterval(() => { const q = state.notes.find(x => x.options?.includes('✓ allow') && !x.answered); if (q) answerNote(q.id, '✓ allow') }, 5)
    try { return JSON.parse((await wrap(TOOLS.find(x => x.name === n)!).execute(a)).content[0].text) } finally { clearInterval(tick) }
  }

  it('reads as English wherever you are standing', async () => {
    loadPreset('blank')
    await call('define_flat', { bedrooms: 2, people: 4 })
    const lines: string[] = []
    for (const [id, type] of [['bed1', 'bed_double'], ['kitchen', 'hob'], ['bath', 'toilet'], ['hall', 'plant']] as const) {
      await call('enter_room', { id })
      lines.push(`${id}: ${(await call('add_item', { type })).status}`)
    }
    for (const line of lines) {
      expect(line, `${line} — a pronoun where a noun goes`).not.toMatch(/for \d+ (them|it|those|us) /)
      expect(line, `${line} — a gap or a doubled space`).not.toMatch(/ {2}/)
    }
    expect(lines.find(l => l.startsWith('bed1')), 'a bedroom stopped saying who it is for').toMatch(/for 2 people to sleep/)
    expect(lines.find(l => l.startsWith('hall')), 'the hall stopped saying who it is for').toMatch(/for 4 people to talk/)
  }, 60_000)
})

// The page's whole bargain with the human is that they can see what the agent did. A tool that changes
// the room and writes nothing to the transcript breaks it silently — the furniture moves and the panel
// says nothing about who moved it.
//
// Reading the transcript as a set is what raised this, and it also produced two false alarms worth
// remembering: a call that errors deliberately writes no line (the agent is told, the human does not
// need a failed attempt), and preset resets the feed, so a probe that sliced from a saved index
// reported "no line" for a scene change that had in fact announced itself.
describe('nothing changes the room in silence', () => {
  const call = async (n: string, a: unknown = {}) => {
    const tick = setInterval(() => { const q = state.notes.find(x => x.options?.includes('✓ allow') && !x.answered); if (q) answerNote(q.id, '✓ allow') }, 5)
    try { return JSON.parse((await wrap(TOOLS.find(x => x.name === n)!).execute(a)).content[0].text) } finally { clearInterval(tick) }
  }

  it('every call that changes something says so in the transcript', async () => {
    const CHANGES: [string, unknown][] = [
      ['brief', { people: 2, activity: 'watch', who: 'me and my dad' }],
      ['set_profile', { profile: 'accessibility' }],
      ['sun', { hour: 17 }],
      ['add_item', { type: 'lamp' }],
      ['move_items', { id: 'plant', x: 60, y: 60 }],
      ['show', { view: '3d' }],
      ['say', { item: 'sofa', text: 'This faces the tv.' }],
      ['remove_item', { id: 'plant', keep: true }],
      ['undo', {}],
      ['set_room', { w: 500, h: 400 }],
      ['preset', { id: 'living-pile' }],     // resets the feed, and must still announce itself
      ['define_flat', { bedrooms: 2, people: 4 }],
      ['enter_room', { id: 'kitchen' }],
    ]
    const silent: string[] = []
    loadPreset('dad-visits')
    for (const [n, a] of CHANGES) {
      // compare against the last line itself, not a saved index: preset empties the feed, and an
      // index taken before the call then points past the end of it
      const was = state.feed.at(-1)?.text ?? null
      const out = await call(n, a)
      const now = state.feed.at(-1)?.text ?? null
      if (out?.error) { silent.push(`${n} could not run: ${String(out.error).slice(0, 60)}`); continue }
      if (now === was || !now) silent.push(`${n} changed the room and the transcript says nothing`)
    }
    expect(silent, 'the human cannot see what the agent did').toEqual([])
  }, 90_000)
})

// Seen on the live page, not in a test: the room's memory listed the same refusal twice, word for
// word. It is the panel that says "every agent that opens this room reads these first", so a page
// that cannot keep its own notes straight undermines the one thing it is promising.
describe('the room remembers each thing once', () => {
  it('the same refusal twice is remembered once, most recent last', () => {
    set({ learned: [] })
    learn('the human rejected moving the plant to (20,20) — you said "nearer the window"')
    learn('the human rejected moving the sofa to (0,30) — you said "it blocks the door"')
    learn('the human rejected moving the plant to (20,20) — you said "nearer the window"')
    expect(state.learned.map(l => l.text), 'the panel shows the same sentence twice').toEqual([
      'the human rejected moving the sofa to (0,30) — you said "it blocks the door"',
      'the human rejected moving the plant to (20,20) — you said "nearer the window"',
    ])
  })

  it('duplicates already in a visitor\'s browser are cleaned up on the way in', () => {
    // node has no localStorage, and the first version of this test wrapped the write in
    // `try { ... } catch { return }` — so it passed by not running, in the same file that documents
    // exactly that failure. The stub in beforeAll is what makes this test a test.
    // the storage key encodes the room's walls, so let learn() make it rather than spelling it out
    // here — a test that rebuilds the key would pass while the real one changed shape
    localStorage.clear()   // other tests in this file have left room memories of their own
    scene()
    learn('seed')
    const key = Object.keys(localStorage).find(k => k.startsWith('room.learned.'))
      ?? [...Array(localStorage.length).keys()].map(i => (localStorage as unknown as { key(i: number): string }).key(i)).find(k => k?.startsWith('room.learned.'))!
    expect(key, 'learn() wrote nothing to storage, so this test has nothing to clean up').toBeTruthy()
    localStorage.setItem(key!, JSON.stringify([{ t: 1, text: 'a' }, { t: 2, text: 'b' }, { t: 3, text: 'a' }, { t: 4, text: 'b' }]))
    set({ learned: [] })
    loadLearned()
    expect(state.learned.map(l => l.text), 'it shows what an older version of the page wrote').toEqual(['a', 'b'])
  })
})

// "for 3 my family to talk" — seen on screen during a scripted session. `who` is the human's own
// words, and four separate places spliced the count in front of them by hand, which is right for
// "5 kids" and wrong for "3 my family". One of the four also managed "for 1 people".
describe('who the room is for, in English', () => {
  it('puts the number where it belongs for either kind of answer', () => {
    for (const [who, people, want] of [
      [undefined, 4, '4 people'], [undefined, 1, '1 person'],
      ['kids', 5, '5 kids'], ['guests', 3, '3 guests'],
      ['my family', 3, 'my family (3)'], ['me and my dad', 2, 'me and my dad (2)'],
      ['our flatmates', 4, 'our flatmates (4)'], ['the kids', 2, 'the kids (2)'],
    ] as const) expect(whoPhrase({ people, ...(who ? { who } : {}) })).toBe(want)
  })

  it('every place that says it says the same thing', async () => {
    scene()
    await wrap(TOOLS.find(t => t.name === 'brief')!).execute({ people: 3, who: 'my family', activity: 'talk' })
    const status = JSON.parse((await wrap(TOOLS.find(t => t.name === 'get_room')!).execute({})).content[0].text).status
    expect(status, 'the agent is told "for 3 my family"').toContain('for my family (3) to talk')
    // and the rules use the same phrase when they count places against people
    const msgs = violations().map(v => `${v.msg} ${v.fix ?? ''}`).join(' | ')
    expect(msgs, 'a rule spliced the count in front of the human\'s words').not.toMatch(/\d+ my family/)
  })
  it('the transcript says it the same way the status does', async () => {
    scene(); set({ brief: null, feed: [] })
    await wrap(TOOLS.find(t => t.name === 'brief')!).execute({ people: 2, who: 'me and my dad', activity: 'watch' })
    const line = state.feed.at(-1)!.text
    const status = JSON.parse((await wrap(TOOLS.find(t => t.name === 'get_room')!).execute({})).content[0].text).status
    // the phrase is built in five places; four were found by grepping for one shape and this one
    // writes it differently, so the human read "2 me and my dad" under a status saying "me and my dad (2)"
    expect(line, `the transcript says "${line}"`).toContain('me and my dad (2)')
    expect(status).toContain('me and my dad (2)')
  })
})

// propose:true answers with `if_accepted`, and the agent reads that number out to the human — the
// transcript says "waiting for you (79/100 if you accept)". Nothing checked that the room actually
// scores 79 afterwards. A prediction the page does not keep is the page lying about a number, which
// is the one thing it exists not to do.
describe('what the page promises a proposal will do', () => {
  const call = async (n: string, a: unknown = {}) =>
    JSON.parse((await wrap(TOOLS.find(x => x.name === n)!).execute(a)).content[0].text)

  it('the score it predicts is the score you get', async () => {
    for (const [preset, id, x, y, rot] of [
      ['dad-visits', 'chair_a', 60, 60, 90],
      ['dad-visits', 'sofa', 40, 40, 0],
      ['living-pile', 'sofa', 100, 200, 90],
      ['open-plan', 'desk', 60, 60, 0],
    ] as const) {
      loadPreset(preset)
      const before = (await call('get_room')).score
      const out = await call('move_items', { id, x, y, rot, propose: true, why: 'a test' })
      expect(out.proposed, `${preset}/${id} was never proposed`).toEqual([id])
      const promised = out.if_accepted.score
      expect(state.items.find(i => i.id === id), 'the piece vanished').toBeTruthy()
      expect((await call('get_room')).score, 'proposing moved the furniture').toBe(before)

      state.proposals.forEach(p => acceptProposal(p.id))
      expect((await call('get_room')).score,
        `${preset}/${id}: promised ${promised} if accepted`).toBe(promised)
    }
  })

  it('the transcript does not record changes that did not happen', async () => {
    // plain() opens by saying a call that did nothing must not claim otherwise — "added a shower" for
    // a shower that would not fit is how somebody ends up buying a shower. Two lines broke its own
    // rule. Found by coverage: neither branch had ever been read by a test.
    loadPreset('dad-visits'); set({ feed: [], history: [] })
    // undo advertises itself as safe to call, and answers undone:false when there is nothing to undo
    const u = await call('undo')
    expect(u.undone, 'this room had something to undo after all').toBe(false)
    expect(state.feed.at(-1)?.text, 'it recorded an undo that never happened').not.toBe('undid the last change')
    expect(state.feed.at(-1)?.text, 'it says nothing about what it tried').toMatch(/nothing to undo/)
    // setting aside is how find_space tells an agent to MAKE room, so it is a choice, not a failure
    set({ feed: [] })
    await call('remove_item', { id: 'chair_a', keep: true })
    const line = state.feed.at(-1)?.text ?? ''
    expect(line, 'the page invented a reason the agent never gave').not.toMatch(/does not fit/)
    // "set chair_a aside" was the one line in the switch printing a raw id; every neighbour names
    // the piece, and the id earns its place only because it is not what the thing is called
    expect(line, 'the raw id where every neighbouring line names the piece').toMatch(/armchair \(chair_a\)/i)
  })

  it('walking into a room does not depend on guessing the argument name', async () => {
    // The demo's whole sixth beat is "walk through it". enter_room({room:'bed1'}) — the obvious call
    // for a tool called enter_room whose description says "stand in a different room" — answered
    // "which room? give an id" beside a list containing bed1. And rooms() hands back an id AND a
    // name, with nothing to say which one this wanted.
    loadHome('flat')
    for (const a of [{ room: 'bed1' }, { id: 'Bedroom 1' }, { id: 'bed1' }] as const)
      expect((await call('enter_room', a)).you_are_in, `${JSON.stringify(a)} did not get into the bedroom`).toBe('Bedroom 1')
    expect((await call('enter_room', { room: 'bed1' })).read, 'it took the wrong key and said nothing').toMatch(/`id`/)
    expect((await call('enter_room', { id: 'Kitchen' })).you_are_in, 'the name rooms() prints does not work').toBe('Kitchen')
    // still a refusal when there is nothing to go on, and it names the parameter this time
    expect((await call('enter_room', {})).error, 'it guessed a room out of nothing').toMatch(/`id`/)
    expect((await call('enter_room', { id: 'sauna' })).error).toMatch(/no room called sauna/)
    expect((await call('enter_room', { id: 'HALL' })).you_are_in, 'case still matters').toBe('Hall')
    // tolerant of how a name is written, not of a shape an agent only sends when it has a bug
    expect((await call('enter_room', { id: '../hall' })).error, 'a path resolved to a room').toMatch(/no room called/)
  })

  it('a proposal never reads as something that happened', async () => {
    // Two tools take `propose`, and only move_items said so in the transcript. On the scripted demo
    // beat whose whole point is "it PROPOSES rather than moves — it is your bed, not its bed", the
    // line the human read was "lined up 2 pieces" while the bed had not moved an inch. Every tool
    // that offers the argument is checked, so a third one cannot be added and quietly skip it.
    const takesPropose = TOOLS.filter(t => (t.inputSchema as any).properties?.propose)
    expect(takesPropose.map(t => t.name).sort(), 'a tool gained or lost `propose`').toEqual(['arrange', 'move_items'])
    for (const t of takesPropose) {
      loadPreset('living-pile'); set({ feed: [] })
      const before = state.items.map(i => `${i.id}:${i.x},${i.y},${i.rot}`).join('|')
      const args = t.name === 'arrange' ? { items: ['sofa', 'chair_a'], as: 'row', gap: 30, propose: true }
        : { id: 'sofa', x: 100, y: 200, rot: 90, propose: true, why: 'a test' }
      await call(t.name, args)
      expect(state.items.map(i => `${i.id}:${i.x},${i.y},${i.rot}`).join('|'), `${t.name} moved the furniture`).toBe(before)
      const line = state.feed.at(-1)?.text ?? ''
      expect(line, `${t.name} wrote no transcript line at all`).toBeTruthy()
      expect(line, `${t.name} told the human "${line}" for a call that moved nothing`).not.toMatch(/^(moved|lined up|docked)/)
      expect(line, `${t.name} does not say it is waiting`).toMatch(/propos|waiting/)
    }
  })

  it('refusing one leaves the room exactly as it was', async () => {
    loadPreset('dad-visits')
    const was = JSON.parse(JSON.stringify(state.items))
    await call('move_items', { id: 'chair_a', x: 60, y: 60, rot: 90, propose: true })
    state.proposals.forEach(p => rejectProposal(p.id, 'it blocks the door'))
    expect(state.items, 'crossing it out moved something anyway').toEqual(was)
    // and the agent is told, in the human's own words
    const after = await call('get_room')
    expect(JSON.stringify(after.humanChanges), 'the agent never learns it was refused').toMatch(/reject|crossed/i)
  })
})

// Seen in a browser: refuse a question, then reply to the same question before the agent has read
// either, and the message it eventually gets quotes the question twice in full. The second copy tells
// it nothing, and the question is the longest part of the sentence.
describe('the message the page pushes to the agent', () => {
  it('does not say the same question twice', () => {
    scene()
    set({ nudge: null, notes: [] })
    const ask = 'Your agent wants to DELETE the plant. Allow?'
    addNote({ item: 'plant', text: ask, kind: 'warn', options: ['✓ allow', '✗ refuse'] })
    answerNote(state.notes.at(-1)!.id, '✗ refuse')
    addNote({ item: 'plant', text: ask, kind: 'warn', options: ['✓ allow', '✗ refuse'] })
    answerNote(state.notes.at(-1)!.id, 'keep it, but move it away from the window')
    const text = state.nudge!.text
    expect(text.split(ask).length - 1, `the question is in there ${text.split(ask).length - 1} times`).toBe(1)
    // and both answers still reach the agent
    expect(text, 'the refusal was lost').toContain('✗ refuse')
    expect(text, 'the reply was lost').toContain('away from the window')
  })

  it('still quotes a different question in full', () => {
    scene()
    set({ nudge: null, notes: [] })
    addNote({ item: 'plant', text: 'Delete the plant?', kind: 'warn', options: ['✓ allow', '✗ refuse'] })
    answerNote(state.notes.at(-1)!.id, '✗ refuse')
    addNote({ item: 'sofa', text: 'Replace the whole room?', kind: 'warn', options: ['✓ allow', '✗ refuse'] })
    answerNote(state.notes.at(-1)!.id, '✗ refuse')
    expect(state.nudge!.text, 'the second question was swallowed').toContain('Replace the whole room?')
    expect(state.nudge!.text, 'the first question was swallowed').toContain('Delete the plant?')
  })
})

// The room keeps 30 steps of history, and undo is offered to the agent as the way back from a bad
// idea — "after baseline, say, if the greedy version scored below the layout it replaced". Every test
// undid exactly one thing, so shortening the history to a single step passed the whole suite: an
// agent that made three moves and then tried to walk them back would have got one, silently.
describe('walking back more than one change', () => {
  const call = async (n: string, a: unknown = {}) =>
    JSON.parse((await wrap(TOOLS.find(x => x.name === n)!).execute(a)).content[0].text)

  it('undoes each change in turn, back to where it started', async () => {
    loadPreset('dad-visits')
    const start = JSON.parse(JSON.stringify(state.items))
    // force:true because this is a test about walking back, not about where things land — without it
    // the first move is refused for an overlap and no history stacks up at all, which the assertion
    // below caught the first time round
    const moves = [['plant', 60, 60], ['rug', 120, 200], ['shelf', 40, 300]] as const
    for (const [id, x, y] of moves) {
      const r = await call('move_items', { id, x, y, force: true })
      expect(r.refused, `moving ${id} was refused even with force`).toBeFalsy()
      expect(r.moved, `moving ${id} changed nothing, so there is no history to walk back`).toBe(1)
    }
    expect(state.items, 'nothing actually moved').not.toEqual(start)

    for (let i = 0; i < moves.length; i++) {
      const r = await call('undo')
      expect(r.undone, `undo ${i + 1} of ${moves.length} had nothing left to undo`).toBe(true)
    }
    expect(state.items.map(i => [i.id, i.x, i.y]), 'the room did not come all the way back')
      .toEqual(start.map((i: Item) => [i.id, i.x, i.y]))
  })

  it('says so when there is nothing left, rather than pretending', async () => {
    loadPreset('dad-visits')
    await call('move_items', { id: 'plant', x: 60, y: 60, force: true })
    expect((await call('undo')).undone).toBe(true)
    const empty = await call('undo')
    expect(empty.undone, 'it claimed to undo something that was not there').toBe(false)
    expect(empty.note, 'it does not say the room is unchanged').toMatch(/nothing to undo/)
  })
})

// A share link is the one input to this page that comes from outside it. loadShare clamps and filters
// everything it reads, and a comment says so — but nothing checked the clamps, so widening the room
// bound to whatever the link says passed the whole suite. A link is a URL anybody can edit.
describe('a link that has been tampered with', () => {
  const link = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o))))

  it('cannot make a room bigger than the page can draw', () => {
    expect(loadShare(link({ r: { w: 9e9, h: -400, doors: [], windows: [], outlets: [] }, i: [] }))).toBe(true)
    expect(state.room.w, 'the room is as wide as the link asked for').toBeLessThanOrEqual(2000)
    expect(state.room.h, 'the room has a negative depth').toBeGreaterThanOrEqual(150)
  })

  it('cannot smuggle in furniture the catalogue has never heard of', () => {
    expect(loadShare(link({ r: { w: 400, h: 400, doors: [], windows: [], outlets: [] },
      i: [{ id: 'a', type: 'hot_tub', x: 10, y: 10 }, { id: 'b', type: 'sofa', x: 20, y: 20 }] }))).toBe(true)
    expect(state.items.map(i => i.type), 'a piece the page cannot draw got in').toEqual(['sofa'])
  })

  it('cannot give a piece a size the room could never hold', () => {
    expect(loadShare(link({ r: { w: 400, h: 400, doors: [], windows: [], outlets: [] },
      i: [{ id: 'sofa', type: 'sofa', x: 10, y: 10, w: 99999, h: -5 }] }))).toBe(true)
    const sofa = state.items.find(i => i.id === 'sofa')!
    expect(sofa.w, 'the sofa is wider than any room').toBeLessThanOrEqual(600)
    expect(sofa.h, 'the sofa has no depth').toBeGreaterThanOrEqual(20)
  })

  it('cannot put an hour on the clock that does not exist', () => {
    expect(loadShare(link({ r: { w: 400, h: 400, doors: [], windows: [], outlets: [] }, i: [], h: 99 }))).toBe(true)
    expect(state.hour, 'the sun is at 99:00').toBeLessThanOrEqual(23)
  })
})

// Ninety seconds is the whole of the elicitation promise: the call parks on a human decision, and
// nobody being there is answered as "nobody answered", never as a refusal. Nothing pinned the
// duration — shortening it to ninety MILLISECONDS passed the entire suite, because every test answers
// within a few. On a real page every question would have timed out before anyone could read it, and
// the blocking-confirm feature would have been dead with all tests green.
describe('how long the page waits for a person', () => {
  it('waits a minute and a half, not a moment', async () => {
    vi.useFakeTimers()
    try {
      set({ notes: [] })
      let answer: string | undefined
      const asked = confirm('Delete the plant?', 'plant').then(a => { answer = a })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(answer, 'it gave up while the human was still reading the question').toBeUndefined()
      await vi.advanceTimersByTimeAsync(29_000)
      expect(answer, 'it gave up before ninety seconds').toBeUndefined()
      await vi.advanceTimersByTimeAsync(2_000)
      // deliberately not awaiting the promise: if the page waits longer than this, awaiting it hangs
      // until vitest's own timeout and the failure says nothing about what went wrong
      expect(answer, 'ninety seconds of nobody there did not answer as nobody answering').toBe('no answer')
      await asked
    } finally { vi.useRealTimers() }
  })
})

// Violations are sorted errors-first, and every reply then truncates the list — base() sends the
// first 8 and counts the rest as more_violations. The sort is what makes that truncation safe: drop
// it and open-plan under accessibility reports 8 of its 17 problems with some of its 8 errors left
// out of the reply entirely, counted but never named. The agent would be shown things to tidy while
// the things it must fix sat in a number.
describe('the problems an agent is shown first', () => {
  it('errors come before warnings, in every scene that has both', () => {
    for (const [preset, profile] of [['open-plan', 'accessibility'], ['studio-tight', 'accessibility'],
      ['living-pile', 'accessibility'], ['open-plan', 'general']] as const) {
      const p = PRESETS.find(x => x.id === preset)!
      const v = check(p.room, p.items, profile)
      const errs = v.filter(x => x.severity === 'error').length
      expect(errs, `${preset}/${profile} has no errors, so this proves nothing`).toBeGreaterThan(0)
      expect(v.length, `${preset}/${profile} no longer overflows the 8 a reply carries`).toBeGreaterThan(8)
      const firstWarn = v.findIndex(x => x.severity === 'warn')
      const lastError = v.map(x => x.severity).lastIndexOf('error')
      expect(lastError, `${preset}/${profile}: a warning is listed above an error`).toBeLessThan(firstWarn < 0 ? v.length : firstWarn)
    }
  })

  it('a truncated reply still names every error', async () => {
    loadPreset('open-plan')
    await wrap(TOOLS.find(t => t.name === 'set_profile')!).execute({ profile: 'accessibility' })
    const out = JSON.parse((await wrap(TOOLS.find(t => t.name === 'get_room')!).execute({})).content[0].text)
    const all = violations()
    expect(all.length, 'this scene stopped overflowing').toBeGreaterThan(out.violations.length)
    const shown = out.violations.filter((v: { severity: string }) => v.severity === 'error').length
    expect(shown, `${all.filter(v => v.severity === 'error').length} errors, and the reply names ${shown}`)
      .toBe(all.filter(v => v.severity === 'error').length)
  })
})

// The rooms of a home are laid out by the page, not by the agent, and nothing checked the geometry it
// produces: that no two rooms sit on top of each other, that every one is inside the footprint the
// page reports, and that the walls between them are real. A constant in that layout could be changed
// with the whole suite green.
describe('the shape of a home', () => {
  const box = (r: { x: number; y: number; room: { w: number; h: number } }) =>
    ({ x: r.x, y: r.y, w: r.room.w, h: r.room.h })
  const hits = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

  it('no two rooms occupy the same floor, in any home the page builds', () => {
    for (const [bedrooms, people, extras] of [[1, 2, []], [2, 4, []], [3, 5, ['study']],
      [3, 6, ['study', 'balcony']], [2, 3, ['balcony']]] as const) {
      const f = buildFlat(bedrooms, people, extras as never)
      expect(f.rooms.length, `${bedrooms}BHK built no rooms`).toBeGreaterThan(bedrooms)
      const size = flatSize(f)
      for (const r of f.rooms) {
        const b = box(r as never)
        expect(b.x, `${bedrooms}BHK: ${r.name} starts left of the home`).toBeGreaterThanOrEqual(0)
        expect(b.y, `${bedrooms}BHK: ${r.name} starts above the home`).toBeGreaterThanOrEqual(0)
        expect(b.x + b.w, `${bedrooms}BHK: ${r.name} runs past the right edge (${size.w}cm)`).toBeLessThanOrEqual(size.w)
        expect(b.y + b.h, `${bedrooms}BHK: ${r.name} runs past the bottom edge (${size.h}cm)`).toBeLessThanOrEqual(size.h)
      }
      for (let i = 0; i < f.rooms.length; i++) for (let j = i + 1; j < f.rooms.length; j++)
        expect(hits(box(f.rooms[i] as never), box(f.rooms[j] as never)),
          `${bedrooms}BHK: ${f.rooms[i].name} and ${f.rooms[j].name} are the same floor`).toBe(false)
    }
  })

  it('everyone who lives there has a bed to go to', () => {
    for (const [bedrooms, people] of [[1, 2], [2, 4], [3, 5], [3, 6], [2, 3]] as const) {
      const f = buildFlat(bedrooms, people, [])
      const beds = f.rooms.filter(r => r.kind === 'bedroom')
      expect(beds.length, `${bedrooms}BHK built ${beds.length} bedrooms`).toBe(bedrooms)
      expect(beds.reduce((t, r) => t + (r.people ?? 0), 0), `${people} people, and the bedrooms sleep fewer`).toBe(people)
    }
  })

  it('a home never has two rooms answering to the same name', () => {
    // define_flat, a ?home= URL and a share link all let extras repeat, and three studies all took
    // the id "study" — so enter_room reached the first and the other two could not be addressed
    for (const extras of [['study', 'study', 'balcony', 'study'], ['balcony', 'balcony'], ['study', 'balcony']] as const) {
      const f = buildFlat(2, 4, extras as never)
      const ids = f.rooms.map(r => r.id)
      expect(ids.filter((x, i) => ids.indexOf(x) !== i), `asked for ${extras.join('+')} and got ${ids.join(' ')}`).toEqual([])
      const names = f.rooms.map(r => r.name)
      expect(names.filter((x, i) => names.indexOf(x) !== i), `two rooms called the same thing: ${names.join(', ')}`).toEqual([])
    }
    // and asking once still gets you one
    expect(buildFlat(2, 4, ['study'] as never).rooms.some(r => r.kind === 'study'), 'the study went missing').toBe(true)
  })

  it('the URL cannot ask for a home the tool would not build', () => {
    const viaUrl = homeFromParam('2b4p-study-study-study')!
    expect(viaUrl, 'the URL stopped building homes').toBeTruthy()
    expect(viaUrl.rooms.filter(r => r.kind === 'study'), 'the URL still builds three studies').toHaveLength(1)
  })
})

// The page had two numbers for the same question. The bed_clearance RULE asks for bedSide(profile) —
// 60, or 90 where the room is judged on accessibility — and bedside_check asked for a flat 75 of its
// own. So a bed with 70cm each side passed the rules and was called "boxed in — nobody can get out of
// bed without climbing over the end" by the tool in the same breath, and an accessible bedroom was
// audited against a number lower than the one it is judged by.
describe('the rule and the tool agree about a bed', () => {
  it('at every clearance, under both goals', async () => {
    const w = CATALOG.bed_double.w, h = CATALOG.bed_double.h
    let flagged = 0
    for (const profile of ['bedroom', 'accessibility'] as const)
      for (const side of [55, 70, 80, 95]) {
        set({ presetId: 'blank', profile, hour: 9, brief: null,
          room: { w: w + side * 2, h: h + 160, doors: [{ id: 'door', wall: 'S', pos: 20, width: 80 }], windows: [], outlets: [] } as never,
          items: [{ id: 'bed', type: 'bed_double', x: side, y: 0, rot: 0, w, h }] as never,
          notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
        const rule = violations().some(v => v.rule === 'bed_clearance')
        const out = JSON.parse((await wrap(TOOLS.find(t => t.name === 'bedside_check')!).execute({})).content[0].text)
        const verdict = out.beds?.[0]?.verdict ?? ''
        const boxed = /boxed in|climbing over/.test(verdict)
        expect(boxed, `${profile} with ${side}cm each side: the rule says ${rule ? 'too tight' : 'fine'} and the tool says ${boxed ? 'boxed in' : 'fine'}`).toBe(rule)
        // the geometry was moved onto bedSide and the sentence was not: the verdict went on saying
        // "the 75cm to get out of" under a rule that asks 60, and 90 in an accessible room. This test
        // agreed with it, because it only ever read the flag and never the number beside it.
        for (const n of verdict.match(/\d+cm/g) ?? [])
          expect(n, `${profile}: the verdict says ${n} where the rule asks ${bedSide(profile)}cm`).toBe(`${bedSide(profile)}cm`)
        if (rule) flagged++
      }
    // and the cases are not all one way, or agreeing proves nothing
    expect(flagged, 'no clearance was tight enough to flag').toBeGreaterThan(2)
    expect(flagged, 'every clearance was flagged').toBeLessThan(8)

    // Every bed above is centred, so it has 0 or 2 ways out and the one-sided verdict — the branch
    // that carried the wrong number — never ran. Restoring the 75 left this test green.
    let oneSided = 0
    for (const profile of ['bedroom', 'accessibility'] as const)
      for (const side of [70, 95]) {
        set({ presetId: 'blank', profile, hour: 9, brief: null,
          room: { w: w + side, h: h + 160, doors: [{ id: 'door', wall: 'S', pos: 20, width: 80 }], windows: [], outlets: [] } as never,
          items: [{ id: 'bed', type: 'bed_double', x: 0, y: 0, rot: 0, w, h }] as never,
          notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
        const v = JSON.parse((await wrap(TOOLS.find(t => t.name === 'bedside_check')!).execute({})).content[0].text).beds?.[0]?.verdict ?? ''
        if (/only 1 side/.test(v)) oneSided++
        for (const n of v.match(/\d+cm/g) ?? [])
          expect(n, `${profile}: the verdict says ${n} where the rule asks ${bedSide(profile)}cm`).toBe(`${bedSide(profile)}cm`)
      }
    expect(oneSided, 'no bed ended up with exactly one way out, so the sentence under test never ran').toBeGreaterThan(0)
  }, 30_000)
})

// Two more places where the page held its own copy of a number another part of it owns.
describe('one number, one owner', () => {
  const call = async (n: string, a: unknown = {}) =>
    JSON.parse((await wrap(TOOLS.find(x => x.name === n)!).execute(a)).content[0].text)

  it('a room you can be sent is a room you can make', async () => {
    // set_room refused anything over 1000 while the store clamped to 2000 and a shared link accepted
    // 2000 — so a link could arrive carrying a room the agent was then told it may not create, and a
    // human dragging the size fields could make one too
    loadPreset('blank')
    const big = await call('set_room', { w: ROOM_MAX, h: ROOM_MAX })
    expect(big.error, `set_room refuses ${ROOM_MAX}cm, which the store and a share link both allow`).toBeUndefined()
    expect(state.room.w).toBe(ROOM_MAX)
    const tooBig = await call('set_room', { w: ROOM_MAX + 10, h: 400 })
    expect(tooBig.error, 'nothing is too big any more').toBeTruthy()
    // and a link cannot smuggle in what set_room would refuse
    expect(loadShare(btoa(unescape(encodeURIComponent(JSON.stringify(
      { r: { w: ROOM_MAX * 3, h: 400, doors: [], windows: [], outlets: [] }, i: [] })))))).toBe(true)
    expect(state.room.w, 'a link made a room bigger than set_room allows').toBeLessThanOrEqual(ROOM_MAX)
  })

  it('sense_room reads a group by the same number the rules do', async () => {
    // sense_room had its own rounded copy of the rule's far end — 300 against 305 — so there was a
    // five centimetre band where the two disagreed about whether two chairs are a group. Measured
    // centre to centre, which is what both of them use, and straight at the threshold rather than
    // through the conversation rule, which only looks at seats that face each other.
    const w = CATALOG.armchair.w, h = CATALOG.armchair.h
    for (const [centres, want] of [[CHAT_MAX - 5, true], [CHAT_MAX + 5, false]] as const) {
      set({ presetId: 'blank', profile: 'general', hour: 9, brief: null,
        room: { w: centres + w + 200, h: 400, doors: [{ id: 'door', wall: 'S', pos: 20, width: 80 }], windows: [], outlets: [] } as never,
        items: [{ id: 'a', type: 'armchair', x: 50, y: 100, rot: 90, w, h },
                { id: 'b', type: 'armchair', x: 50 + centres, y: 100, rot: 270, w, h }] as never,
        notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
      const sense = await call('sense_room')
      const reads = !/too far apart to talk/.test(JSON.stringify(sense.problems ?? []))
      expect(reads, `${centres}cm centre to centre, and the rules' band ends at ${CHAT_MAX}`).toBe(want)
    }
  })

  // Five faults found by furnishing every room of a home the way an agent would and reading what came
  // back. Every one of them looked like the agent placing things stupidly, and every one was the page.
  const kitchen = (w = 260, h = 220) => set({ presetId: 'custom', profile: 'general', hour: 9, brief: null,
    items: [], notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null,
    room: { w, h, doors: [{ id: 'door', wall: 'S', pos: 90, width: 80 }], windows: [{ id: 'west window', wall: 'W', pos: 60, width: 120 }], outlets: [{ x: w, y: 60 }, { x: 0, y: 160 }] } as never })

  it('a fixture that needs a pipe is not left in the middle of the floor', async () => {
    // An agent stood the toilet in the centre of the bathroom and the page said nothing, because
    // nothing in it knew that a soil pipe runs in a wall. This is not taste, which is why it is an
    // error: what was drawn cannot be installed.
    kitchen(300, 300); set({ profile: 'accessibility' })
    await call('add_item', { type: 'toilet', x: 120, y: 120 })
    const v = violations() as any[]
    const plumb = v.find(x => x.rule === 'plumbing')
    expect(plumb, 'a toilet in the middle of the room raised nothing').toBeTruthy()
    expect(plumb.severity, 'unplumbable reads as a matter of taste').toBe('error')
    expect(plumb.msg, 'it does not say what the fixture needs').toMatch(/soil pipe/)
    // and against a wall it is fine
    await call('move_items', { id: state.items[0].id, x: 0, y: 120, force: true })
    expect((violations() as any[]).some(x => x.rule === 'plumbing'), 'it complains about a toilet on the wall').toBe(false)
    // an island and a freestanding fridge are real rooms, so they are not held to this
    kitchen(300, 300); await call('add_item', { type: 'counter', x: 120, y: 120 })
    expect((violations() as any[]).some(x => x.rule === 'plumbing'), 'a kitchen island is now illegal').toBe(false)
  })

  it('the page does not dock a chair inside the bed', async () => {
    // The dock knows where a chair belongs relative to its desk. It did not know what else was
    // standing there, so add_item put the chair inside the bed and handed back an overlap error the
    // agent never made.
    set({ presetId: 'custom', profile: 'bedroom', hour: 9, brief: null, items: [], notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null,
      room: { w: 380, h: 340, doors: [{ id: 'door', wall: 'S', pos: 40, width: 80 }], windows: [], outlets: [{ x: 380, y: 60 }] } as never })
    for (const type of ['bed_double', 'wardrobe', 'desk', 'chair']) await call('add_item', { type })
    const errs = (violations() as any[]).filter(x => x.severity === 'error')
    expect(errs.map(e => e.msg), 'the page placed a piece on top of another and called it done').toEqual([])
  })

  it('a spot that breaks a piece already standing there is not a spot', async () => {
    // Walkways had a "do not make it worse" guard and nothing else did, so find_space would take the
    // turning circle away from a fixture that already had one. A 12m² bathroom failed for this, and
    // it read as the room being too small.
    // A small bathroom, because that is where it bites: the shipped one is now big enough that the
    // search finds a legal spot anyway, and a user can set_room to anything. Refusing to place the
    // shower is the right answer here; placing it on top of the toilet's turning circle is not.
    set({ presetId: 'custom', profile: 'accessibility', hour: 9, brief: null, items: [], notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null,
      room: { w: 260, h: 260, doors: [{ id: 'door', wall: 'S', pos: 50, width: 75 }], windows: [{ id: 'north window', wall: 'N', pos: 60, width: 60 }], outlets: [{ x: 260, y: 40 }] } as never })
    await call('add_item', { type: 'toilet', prefer: 'wall' })
    const clean = (violations() as any[]).filter(x => x.severity === 'error').length
    expect(clean, 'the room starts broken, so nothing here is about making it worse').toBe(0)
    for (const type of ['basin', 'shower']) await call('add_item', { type })
    expect(state.items.length, 'nothing at all went in, so no spot was chosen to judge').toBeGreaterThan(1)
    expect((violations() as any[]).filter(x => x.severity === 'error').map(e => e.msg),
      'furnishing the room took away a clearance that was there before').toEqual([])
  })

  it('it does not say there is nowhere until it has looked', async () => {
    // "no legal 60×60cm spot exists — the room is too full", about a room with a free wall in it. The
    // window wall was taken, so all 40 spots in the budget failed, and the legal one was ranked 41st
    // because it was the furthest thing from the window. A preference orders the candidates; it does
    // not make the ones it likes legal.
    kitchen()
    await call('add_item', { type: 'counter', prefer: 'wall' })
    const near = await call('find_space', { type: 'sink', prefer: 'near_window' })
    const anywhere = await call('find_space', { type: 'sink', prefer: 'wall' })
    expect(anywhere.candidates.length, 'there is genuinely nowhere, so this proves nothing').toBeGreaterThan(0)
    expect(near.candidates.length, 'it refused while a legal spot was sitting further down its own list').toBeGreaterThan(0)
  })

  it('a score about one piece does not read as a finished room', async () => {
    // A bathroom holding one toilet came back "100/100 · all rules pass". An agent reading that has
    // been told it is finished. The score is computed over what is IN the room and says nothing at
    // all about what is not.
    kitchen(300, 300)
    expect((await call('get_room')).status, 'an empty room reads as a perfect one').toMatch(/nothing in this room yet/)
    await call('add_item', { type: 'counter', prefer: 'wall' })
    expect((await call('get_room')).status, 'one piece and a clean sheet reads as a finished room').toMatch(/about very little/)
    for (const type of ['sink', 'hob', 'fridge']) await call('add_item', { type })
    expect((await call('get_room')).status, 'it still hedges a room that is actually furnished').not.toMatch(/very little|nothing in this room/)
  })

  // The same sweep, run over the presets instead of the flat: furnish nothing, just ask the page to
  // re-place what is already standing there, and let its own arranger loose on each scene.
  it('every piece in every scene has somewhere it could go', async () => {
    // A rug lies UNDER the furniture — that is what the pairing rule asks of it. The search tested it
    // for collisions like a wardrobe, so it produced ZERO candidates for the rug in the demo's own
    // room and answered "no legal 230×160cm spot exists — the room is too full".
    for (const p of PRESETS) {
      loadPreset(p.id)
      for (const i of state.items.filter(x => !x.parked)) {
        const r = await call('find_space', { id: i.id, ignore: [i.id] })
        expect(r.candidates?.length, `${p.id}: nowhere legal for the ${i.type} that is already standing there`).toBeGreaterThan(0)
      }
    }
  })

  it('the page can carry out the fix it prints on its own violation', async () => {
    // The pairing violation's fix text names this exact call. dockPosition centred the rug on the
    // sofa, which put it 5cm past the south wall, so fits() refused it — six times, since `under`
    // ignores the retry index. The page told the agent to make a call it would then turn down.
    loadPreset('dad-visits')
    const pair = (violations() as any[]).find(v => v.rule === 'pairing')
    expect(pair?.fix, 'the rug is no longer adrift here, so there is no fix to carry out').toMatch(/dock_item/)
    const before = score(violations() as never)
    const out = await call('dock_item', { id: 'rug', to: 'sofa' })
    expect(out.error, `the page refused its own advice: ${out.error}`).toBeUndefined()
    const rug = state.items.find(i => i.id === 'rug')!
    expect(rug.x >= 0 && rug.y >= 0 && rug.x + rug.w <= state.room.w && rug.y + rug.h <= state.room.h,
      `the rug was docked to ${rug.x},${rug.y}, partly outside a ${state.room.w}×${state.room.h} room`).toBe(true)
    expect((violations() as any[]).some(v => v.rule === 'pairing'), 'doing what it said left the complaint standing').toBe(false)
    expect(score(violations() as never), 'the fix it recommended did not improve the room').toBeGreaterThan(before)
  })

  it('the page\'s own arranger never leaves a scene with an error in it', async () => {
    // "ran the page's greedy baseline → 69/100 (the number to beat)" — with a floor lamp standing in
    // the doorway. Both places that dock a piece ask fits(), and fits() knew about walls and about
    // furniture and not about the door swing, which is neither.
    for (const p of PRESETS) {
      loadPreset(p.id)
      await call('baseline')
      expect((violations() as any[]).filter(v => v.severity === 'error').map(v => v.msg),
        `${p.id}: the page's own arranger left an error behind`).toEqual([])
    }
  })

  it('a baseline that lost does not call its own number the target', async () => {
    // The tool tells the agent "it is WORSE than what was here — beating 95 is the real bar", and the
    // line the human reads went on calling the lower number the one to beat.
    loadPreset('dad-visits'); await call('dock_item', { id: 'rug', to: 'sofa' })
    const was = score(violations() as never)
    set({ feed: [] })
    const out = await call('baseline')
    expect(out.baseline_score, 'greedy did not lose here, so this proves nothing').toBeLessThan(was)
    const line = state.feed.at(-1)?.text ?? ''
    expect(line, `the transcript offered ${out.baseline_score} as the target after dropping from ${was}`).not.toMatch(/the number to beat/)
    expect(line, 'it does not say the bar is still the old score').toContain(String(was))
  })

  it('emptying the room is never the highest-scoring way to fix it', async () => {
    // Watched a real agent do this. Asked to make dad-visits work for a wheelchair, it set the two
    // armchairs, the bookshelf and the rug aside and reported success — and it was right, by the
    // page's own arithmetic. Parking any number of pieces cost ONE warning, 5 points; leaving those
    // four in a room that could not hold them cost four errors, 44. So the best-scoring layout the
    // page offered was the emptiest one, and the model optimised exactly what it was given.
    loadPreset('dad-visits'); set({ profile: 'accessibility' })
    const asIs = score(violations() as never)
    const all = state.items.map(i => i.id)
    set({ items: state.items.map(i => ['chair_a', 'chair_b', 'shelf', 'rug'].includes(i.id) ? { ...i, parked: true as const } : i) })
    const emptied = score(violations() as never)
    // the page's own arranger keeps every piece, so a solved layout demonstrably exists
    loadPreset('dad-visits'); set({ profile: 'accessibility' })
    await call('baseline')
    const solved = score(violations() as never)
    expect(state.items.filter(i => i.parked), 'the arranger set something aside, so there is no all-in layout to compare').toEqual([])
    expect(state.items.map(i => i.id).sort(), 'the arranger lost a piece').toEqual(all.sort())
    expect(solved, `emptying the room scores ${emptied} and solving it ${solved} — an agent will empty it`).toBeGreaterThan(emptied)
    expect(emptied, 'throwing four pieces out no longer costs anything at all').toBeLessThan(100)
    expect(asIs).toBeLessThan(solved)
  })

  it('a piece set aside is named, one problem each, not lumped into one', async () => {
    loadPreset('dad-visits')
    set({ items: state.items.map(i => ['chair_a', 'shelf'].includes(i.id) ? { ...i, parked: true as const } : i) })
    const v = (violations() as any[]).filter(x => x.rule === 'doesnt_fit')
    expect(v.length, 'two pieces are out of the room and it raised one complaint for both').toBe(2)
    expect(v.map(x => x.items[0]).sort(), 'it does not say which pieces').toEqual(['chair_a', 'shelf'])
    for (const x of v) expect(x.fix, 'it does not say how to bring the piece back').toMatch(/move_items/)
  })

  it('the refusal that says do not invent coordinates can count', async () => {
    // "considered: 59, rejected: {error: 40, walkway: 0, overlap: 0}". 40 + 0 + 0 is not 59, and the
    // 19 missing were never looked at — `considered` counted the cheap pass, the tally counted the
    // rule-checked slice of it. The two zeroes could not have been anything else: a walkway rejection
    // returns through `fallback`, and nothing can overlap a verified candidate when there are none.
    // A reply that opens "Do NOT invent coordinates" is the last one allowed to be vague about its
    // own arithmetic.
    loadPreset('dad-visits'); set({ profile: 'accessibility' })
    const r = await call('find_space', { id: 'sofa' })
    expect(r.candidates, 'a legal spot turned up — this case no longer tests a refusal').toHaveLength(0)
    expect(r.least_bad?.length, 'no fallbacks to negotiate with').toBeGreaterThan(0)
    expect(r.considered, 'it looked at nothing and still refused').toBeGreaterThan(0)
    expect(r.considered, 'it claims to have rule-checked more spots than the shape pass produced').toBeLessThanOrEqual(r.of_possible ?? r.considered)
    // every count still in the reply has to be one the page could have arrived at
    for (const [k, v] of Object.entries(r)) if (typeof v === 'object' && v && !Array.isArray(v))
      expect(Object.values(v).some(n => n !== 0), `${k} is a breakdown of nothing but zeroes`).toBe(true)
    expect(JSON.stringify(r), 'the tally that did not add up is back').not.toMatch(/"walkway":0|"overlap":0/)
  })

  it('the balance point stays inside the room', async () => {
    // "everything sits on one side (280cm off centre)" in a 420cm room. The centre is 277cm from the
    // furthest corner, so 280 was not a place — the sum ran over every item while the divisor counted
    // only the solid ones, and the rug it had just ignored pushed the answer out through the wall.
    // Checked against every preset, because one rug was enough to break it.
    for (const p of PRESETS) {
      loadPreset(p.id)
      if (!state.items.length) continue
      const s = await call('sense_room')
      const off = s.aesthetic.visual_weight_offset_cm
      const furthest = Math.hypot(state.room.w / 2, state.room.h / 2)
      expect(off, `${p.id}: the balance point sits ${off}cm from the centre of a ${state.room.w}x${state.room.h} room — further than its own corner`)
        .toBeLessThanOrEqual(Math.round(furthest))
      // and the sentence the agent reads has to agree with the number beside it
      if (/leans east|sits east/.test(s.aesthetic.balance)) expect(off, `${p.id}: says east`).toBeGreaterThan(0)
    }
    // a rug alone used to divide by 1 instead of by its own area
    set({ presetId: 'blank', profile: 'general', hour: 9, brief: null,
      room: { w: 400, h: 400, doors: [{ id: 'door', wall: 'S', pos: 20, width: 80 }], windows: [], outlets: [] } as never,
      items: [{ id: 'r', type: 'rug', x: 0, y: 0, rot: 0, w: CATALOG.rug.w, h: CATALOG.rug.h }] as never,
      notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
    expect((await call('sense_room')).aesthetic.visual_weight_offset_cm, 'a room holding nothing solid has no lopsided half').toBe(0)
  })

  it('a door is the same door however the room arrives', async () => {
    // set_room and a share link both rebuild the openings, through two functions that take the width
    // and the minimum in opposite orders. They agreed by luck; now they agree by name.
    loadPreset('blank')
    await call('set_room', { w: 500, h: 400, doors: [{ wall: 'S', pos: 100 }], windows: [{ wall: 'N', pos: 100 }] })
    const made = { door: state.room.doors[0], window: state.room.windows[0] }
    expect(made.door, 'set_room built no door').toBeTruthy()
    expect(made.door.width, `a door defaults to ${DOOR.wide}cm`).toBe(DOOR.wide)
    expect(made.window.width, `a window defaults to ${WINDOW.wide}cm`).toBe(WINDOW.wide)

    expect(loadShare(encodeShare())).toBe(true)
    expect(state.room.doors[0].width, 'the door changed width in transit').toBe(made.door.width)
    expect(state.room.windows[0].width, 'the window changed width in transit').toBe(made.window.width)

    // and a link asking for a sliver gets the minimum, not a sliver
    expect(loadShare(btoa(unescape(encodeURIComponent(JSON.stringify({
      r: { w: 500, h: 400, doors: [{ wall: 'S', pos: 100, width: 5 }], windows: [{ wall: 'N', pos: 100, width: 5 }], outlets: [] }, i: [] })))))).toBe(true)
    expect(state.room.doors[0].width, 'a 5cm door got through').toBeGreaterThanOrEqual(DOOR.min)
    expect(state.room.windows[0].width, 'a 5cm window got through').toBeGreaterThanOrEqual(WINDOW.min)
  })

  it('a window is named the same way whoever builds the room', async () => {
    // set_room and the share loader each had their own copy of the wall names — and I added the second
    // one this morning while fixing the consequence of not having it. Five messages read a window's
    // name out loud, so the two must agree.
    loadPreset('blank')
    await call('set_room', { w: 500, h: 400, doors: [{ wall: 'S', pos: 100 }],
      windows: [{ wall: 'N', pos: 100 }, { wall: 'E', pos: 100 }] })
    const made = state.room.windows.map(w => w.id)
    expect(made, 'set_room stopped naming windows after their wall').toEqual(['north window', 'east window'])
    expect(loadShare(encodeShare())).toBe(true)
    expect(state.room.windows.map(w => w.id), 'a shared room names its windows differently').toEqual(made)
    for (const [wall, name] of Object.entries(WALL_NAME))
      expect(name, `${wall} has no name`).toMatch(/^(north|south|east|west)$/)
  })

  it('the biggest room the page allows is still quick to judge', () => {
    // check() runs on every change to the room and its cost follows the FREE floor — a flood fill over
    // a 10cm grid — so the room bound is a performance decision as much as a modelling one. Measured
    // on this machine: 0.14ms at 400x400 and 2.4ms at 1000x1000, which is why ROOM_MAX is 1000.
    //
    // The number below is deliberately enormous, and it is worth saying why rather than leaving a
    // mystery. Under v8 coverage the same call takes 21ms — instrumentation costs more per grid cell
    // than per call, so neither the time nor even the ratio between two sizes is stable between
    // `npm test` and `npm run coverage`. An earlier version of this asserted 15ms, passed normally and
    // failed under coverage, which is worse than no test: it teaches you to ignore a red run. So this
    // catches a catastrophe — a rule gone quadratic, seconds not milliseconds — and nothing finer.
    // The real guard on this is ROOM_MAX itself.
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    const room = { ...p.room, w: ROOM_MAX, h: ROOM_MAX }, items = p.items.map(i => ({ ...i }))
    for (let i = 0; i < 5; i++) check(room as never, items as never, 'accessibility')   // warm first, or
    const t0 = performance.now()                                                        // the first call pays for the compile
    for (let i = 0; i < 10; i++) check(room as never, items as never, 'accessibility')
    const ms = (performance.now() - t0) / 10
    expect(ms, `${ms.toFixed(1)}ms to judge a ${ROOM_MAX}x${ROOM_MAX} room — it was 2.4, or 21 under coverage`).toBeLessThan(300)
  })
})



// Everything in the address bar is somebody else's typing: a stale link, a mistyped scene, a hash
// pasted badly. main.tsx acts on all of it before React renders, so anything that throws there is a
// blank page rather than a bad scene — and the error boundary cannot help, because it is not mounted
// yet. They all decline quietly today; this is what says so.
describe('what the address bar can ask for', () => {
  it('an unknown scene leaves the page where it was, and does not throw', () => {
    loadPreset('dad-visits')
    const was = { id: state.presetId, items: state.items.length }
    for (const id of ['nonsense', '', '../../etc/passwd', '<script>alert(1)</script>', 'flat', 'ﬀ'])
      expect(loadPreset(id), `preset=${id} was accepted`).toBe(false)
    expect(state.presetId, 'a bad scene name changed the room').toBe(was.id)
    expect(state.items.length, 'a bad scene name changed the furniture').toBe(was.items)
  })

  it('an unknown home is declined, not half-built', () => {
    loadPreset('dad-visits')
    for (const h of ['nonsense', '', '9', '2b4', 'study', '2b4p-kitchen'])
      expect(loadHome(h), `home=${h} was accepted`).toBe(false)
    expect(state.flat, 'a bad home address built half a home').toBeNull()
    expect(loadHome('2b4p'), 'a good home address stopped working').toBe(true)
  })

  it('a hash that is not a plan is refused without a fuss', () => {
    for (const h of ['', 'not-base64!!', btoa('{}'), btoa('null'), btoa('[1,2,3]'), btoa('{"r":null,"i":[]}')])
      expect(loadShare(h), `a link containing ${JSON.stringify(h).slice(0, 20)} was accepted`).toBe(false)
  })

  it('a link somebody sent wins over whatever else is in the URL', () => {
    loadPreset('living-pile')
    const link = encodeShare()                      // a plan of living-pile
    loadPreset('dad-visits')
    // the same URL asks for three things at once: a shared plan, a home, and a scene
    expect(openFrom('?preset=dad-visits&home=2b4p', `#l=${link}`), 'nothing opened').toBe(true)
    expect(state.flat, 'the home won over the link somebody sent').toBeNull()
    expect(state.presetId, 'the scene won over the link somebody sent').toBe('shared')
  })

  it('a home address wins over a scene, and a broken link does not win at all', () => {
    loadPreset('dad-visits')
    expect(openFrom('?preset=dad-visits&home=2b4p', ''), 'nothing opened').toBe(true)
    expect(state.flat?.rooms.length, 'the scene won over the home address').toBe(5)

    // a hash that is not a plan must fall through to the rest of the URL rather than winning and
    // leaving the page on nothing
    loadPreset('dad-visits')
    expect(openFrom('?preset=living-pile', '#l=not-a-plan'), 'a broken link swallowed the scene').toBe(true)
    expect(state.presetId, 'a broken link swallowed the scene').toBe('living-pile')
  })

  it('an empty URL opens nothing, so the landing page is always the first thing you see', () => {
    loadPreset('dad-visits')
    const was = state.presetId
    expect(openFrom('', ''), 'an empty URL opened something').toBe(false)
    expect(state.presetId, 'an empty URL changed the room').toBe(was)
  })
})

// Tool descriptions make promises in prose, and an agent takes them literally. Nothing held them:
// they are strings, so nothing fails when the behaviour behind one moves. These are the three
// behavioural claims in the whole tool surface that a test can settle.
describe('what the descriptions promise an agent', () => {
  const call = async (n: string, a: unknown = {}) =>
    JSON.parse((await wrap(TOOLS.find(x => x.name === n)!).execute(a)).content[0].text)

  it('find_space returns "up to 5" spots, and never a sixth', async () => {
    const said = Number(TOOLS.find(t => t.name === 'find_space')!.description.match(/up to (\d+) positions/)?.[1])
    expect(said, 'find_space stopped saying how many spots it returns').toBeTruthy()
    for (const [preset, args] of [['blank', { type: 'lamp' }], ['dad-visits', { type: 'lamp' }],
      ['open-plan', { type: 'chair' }], ['living-pile', { id: 'sofa' }]] as const) {
      loadPreset(preset)
      const n = (await call('find_space', args)).candidates?.length ?? 0
      expect(n, `${preset} came back with ${n} spots and the description promises up to ${said}`).toBeLessThanOrEqual(said)
    }
  })

  it('a piece set aside comes back when it is moved somewhere legal', async () => {
    const said = TOOLS.find(t => t.name === 'move_items')!.description
    expect(said, 'move_items stopped promising to bring a set-aside piece back').toMatch(/set aside comes back/i)
    loadPreset('dad-visits')
    expect((await call('remove_item', { id: 'plant', keep: true })).set_aside, 'nothing was set aside').toBe('plant')
    expect(state.items.find(i => i.id === 'plant')?.parked, 'the plant is not actually parked').toBe(true)

    const spot = (await call('find_space', { id: 'plant' })).candidates?.[0]
    expect(spot, 'there is nowhere legal to put it back, so this proves nothing').toBeTruthy()
    const mv = await call('move_items', { id: 'plant', x: spot.x, y: spot.y })
    expect(mv.moved, 'it did not move').toBe(1)
    expect(state.items.find(i => i.id === 'plant')?.parked, 'it came back to the room still set aside').toBeFalsy()
    expect(mv.status, 'the status still counts it as set aside').not.toMatch(/set aside/)
  })

  it('a refused move leaves it exactly where it was, still set aside', async () => {
    loadPreset('dad-visits')
    await call('remove_item', { id: 'plant', keep: true })
    const was = JSON.stringify(state.items.find(i => i.id === 'plant'))
    const mv = await call('move_items', { id: 'plant', x: 160, y: 260 })   // on top of the sofa
    expect(mv.refused, 'that spot stopped being refused, so this proves nothing').toBe(true)
    expect(JSON.stringify(state.items.find(i => i.id === 'plant')), 'a refused move unparked it anyway').toBe(was)
  })

  it('items you do not list stay put', async () => {
    const said = TOOLS.find(t => t.name === 'move_items')!.description
    expect(said, 'move_items stopped promising the others stay put').toMatch(/stay put/i)
    loadPreset('dad-visits')
    const others = () => state.items.filter(i => i.id !== 'plant').map(i => `${i.id}@${i.x},${i.y},${i.rot}`).join(' ')
    const was = others()
    await call('move_items', { id: 'plant', x: 300, y: 300, force: true })
    expect(others(), 'moving one piece moved another').toBe(was)
  })
})
