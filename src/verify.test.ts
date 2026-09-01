import { describe, expect, it } from 'vitest'
import { verify } from './verify'
import { set } from './store'
import type { Claim } from './store'

// verify() is the page's answer to the one thing an agent can always do: say a number that sounds
// right. The video stops on it — "the agent said a number out loud and the page checked it against
// its own geometry, in front of me". Coverage said 66%: `gap` was exercised and the other three
// kinds' arithmetic never ran, so the page could have been contradicting a correct agent, or
// endorsing a wrong one, in three of the four ways it offers to check.
//
// A room with two pieces whose every measurement can be worked out by hand.
//   sofa  x100 y300 200x90  rot 0   → centre (200, 345), faces south
//   tv    x150 y20  120x40  rot 180 → centre (210, 40),  faces north, ie. away from the sofa
const room = () => set({ presetId: 'blank', hour: 12, profile: 'general',
  room: { w: 500, h: 400, doors: [], windows: [], outlets: [], north: 0, season: 'summer' },
  items: [{ id: 'sofa', type: 'sofa', x: 100, y: 300, w: 200, h: 90, rot: 0 },
          { id: 'tv', type: 'tv_unit', x: 150, y: 20, w: 120, h: 40, rot: 180 }] as never,
  notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })

const v = (c: Partial<Claim>) => verify(c as Claim) as { ok: boolean; actual: number; said: number; text: string }

describe('the numbers verify actually computes', () => {
  it('measures all four kinds against geometry a person can check', () => {
    room()
    // centre to centre: hypot(10, 305)
    expect(v({ kind: 'distance', a: 'sofa', b: 'tv', value: 305 }).actual).toBe(305)
    // edge to edge: the sofa's top at y300, the tv's bottom at y60
    expect(v({ kind: 'gap', a: 'sofa', b: 'tv', value: 240 }).actual).toBe(240)
    // nearest wall: 400 - 300 - 90 = 10 to the south, closer than 100 to the west
    expect(v({ kind: 'clear', a: 'sofa', value: 10 }).actual).toBe(10)
    // the sofa faces south, the tv is due north of it — very nearly the opposite way
    expect(v({ kind: 'angle', a: 'sofa', b: 'tv', value: 178 }).actual).toBe(178)
    // and the tv at rot 180 faces the wall behind it, not the sofa in front
    expect(v({ kind: 'angle', a: 'tv', b: 'sofa', value: 178 }).actual).toBe(178)
  })

  it('says yes to a true claim and no to a false one, in every kind', () => {
    room()
    for (const [kind, a, b, right, wrong] of [
      ['distance', 'sofa', 'tv', 305, 120],
      ['gap', 'sofa', 'tv', 240, 60],
      ['clear', 'sofa', undefined, 10, 200],
      ['angle', 'sofa', 'tv', 178, 10],
    ] as const) {
      expect(v({ kind, a, b, value: right }).ok, `${kind}: the page contradicted a correct agent`).toBe(true)
      expect(v({ kind, a, b, value: wrong }).ok, `${kind}: the page endorsed a wrong number`).toBe(false)
    }
  })

  it('reads the units an agent writes, and never converts degrees', () => {
    room()
    expect(v({ kind: 'gap', a: 'sofa', b: 'tv', value: 2.4, unit: 'm' }).ok, '2.4m is 240cm').toBe(true)
    expect(v({ kind: 'gap', a: 'sofa', b: 'tv', value: 2400, unit: 'mm' }).ok, '2400mm is 240cm').toBe(true)
    // no unit and a small number: nobody means 2.4 centimetres
    expect(v({ kind: 'gap', a: 'sofa', b: 'tv', value: 2.4 }).ok, 'a bare 2.4 should read as metres').toBe(true)
    // and the same heuristic must not touch an angle: 10 degrees is 10 degrees
    const angle = v({ kind: 'angle', a: 'sofa', b: 'tv', value: 10 })
    expect(angle.said, '10° was multiplied by a hundred').toBe(10)
    expect(angle.text).toContain('°')
  })

  it('refuses a claim with no number instead of printing NaN at the human', () => {
    room()
    for (const bad of [{ kind: 'gap', a: 'sofa', b: 'tv' }, { kind: 'gap', a: 'sofa', b: 'tv', value: 'wide' },
                       { kind: 'gap', a: 'sofa', b: 'tv', value: NaN }] as never[])
      expect((verify(bad) as { error: string }).error, 'an unchecked value reached the sentence').toMatch(/numeric/)
  })

  it('will not check a claim about a piece that is not there', () => {
    room()
    expect((verify({ kind: 'gap', a: 'ghost', b: 'tv', value: 10 } as Claim) as { error: string }).error).toMatch(/ghost/)
    expect((verify({ kind: 'gap', a: 'sofa', value: 10 } as Claim) as { error: string }).error, 'measured a gap to nothing').toMatch(/two items/)
  })
})
