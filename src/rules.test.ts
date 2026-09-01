import { describe, expect, it, vi } from 'vitest'
import { TURN, TOUCHING, TABLE, bedSide, pullOut, check, clusters, hasTwin, idIsName, REACH, roomPasses, footprint, hits, score, turningCircles, walkGrid } from './rules'
import { PRESETS } from './presets'
import { findSpace, imperial } from './space'
import { wrap, coerce, TOOLS, inferClaim, loadShare, plain, resetSent } from './tools'
import { planSheet } from './sheet'
import { buildFlat, flatSize, homeFromParam, homeParam, sleepers } from './flat'
import { demoFor } from './demo'
import { Glyph } from './glyphs'
import { describePlan } from './Plan'
import toolsSourceRaw from './tools.ts?raw'
import planSource from './Plan.tsx?raw'
import appSource from './App.tsx?raw'
import panelSource from './Panel.tsx?raw'
import flatPlanSource from './FlatPlan.tsx?raw'
import sceneSource from './Scene3D.tsx?raw'
import { verify } from './verify'
import { learn, loadLearned, leaveRoom, deleteSave, rejectProposal, humanEvent, updateItem, atWholeHome, forgetSession, getItem, lastSession, listSaves, loadSave, onWall, openings, rememberSession, resizeRoom, restore, saveRoom, set, settle, state } from './store'
import type { Brief, Item, Room } from './store'
import { CATALOG, CATALOG_TYPES } from './catalog'

/** define_flat asks before it builds a home over furniture somebody has arranged — the same question
 *  preset and set_room ask. Every test here wants a FRESH home, and a fresh one has nothing to lose,
 *  so clear the floor first rather than teach the tests to click through a dialog. */
const freshFlat = async (a: Record<string, unknown>) => {
  set({ items: [], flat: null, here: null, proposals: [], history: [] })
  return TOOLS.find(t => t.name === 'define_flat')!.run(a) as any
}

const room: Room = { w: 400, h: 400, doors: [{ id: 'd', wall: 'S', pos: 150, width: 90 }], windows: [{ id: 'w', wall: 'N', pos: 100, width: 150 }], outlets: [{ x: 0, y: 200 }] }
const it_ = (id: string, type: keyof typeof CATALOG, x: number, y: number, rot: 0 | 90 | 180 | 270 = 0): Item => ({ id, type, x, y, rot, w: CATALOG[type].w, h: CATALOG[type].h })
const rules = (v: ReturnType<typeof check>) => v.map(x => x.rule)
const toolsSrc = (name: string) =>
  toolsSourceRaw.split(/^tool\(/m).find(b => b.startsWith(`'${name}'`)) ?? ''

describe('rules', () => {
  it('overlap + out of bounds', () => {
    expect(rules(check(room, [it_('a', 'sofa', 0, 0), it_('b', 'armchair', 50, 50)], 'general'))).toContain('overlap')
    expect(rules(check(room, [it_('a', 'sofa', 300, 0)], 'general'))).toContain('out_of_bounds')
    expect(rules(check(room, [it_('a', 'rug', 0, 0), it_('b', 'sofa', 0, 0)], 'general'))).not.toContain('overlap')
  })
  it('door clearance, bigger for accessibility', () => {
    const v = check(room, [it_('a', 'plant', 160, 350)], 'general')
    expect(rules(v)).toContain('door_blocked')
    expect(rules(check(room, [it_('a', 'plant', 160, 230)], 'general'))).not.toContain('door_blocked')
    expect(rules(check(room, [it_('a', 'plant', 160, 230)], 'accessibility'))).toContain('door_blocked')
  })
  it('walkway: sofa walled off by wardrobes is unreachable', () => {
    const wall = [it_('w1', 'wardrobe', 0, 200, 0), it_('w2', 'wardrobe', 120, 200), it_('w3', 'wardrobe', 240, 200), it_('w4', 'wardrobe', 340, 200)]
    const v = check(room, [it_('s', 'sofa', 100, 20), ...wall], 'general')
    expect(v.filter(x => x.rule === 'walkway').map(x => x.items[0])).toContain('s')
    expect(rules(check(room, [it_('s', 'sofa', 100, 20)], 'general'))).not.toContain('walkway')
  })
  it('viewing distance + glare only in theater', () => {
    const items = [it_('tv', 'tv_unit', 130, 0), it_('sofa', 'sofa', 100, 60, 180)]
    expect(rules(check(room, items, 'general'))).not.toContain('viewing_distance')
    const v = rules(check(room, items, 'theater'))
    expect(v).toContain('viewing_distance')
    expect(v).not.toContain('glare') // north windows never get direct sun
  })
  it('outlet + bed clearance + window', () => {
    expect(rules(check(room, [it_('d', 'desk', 250, 300)], 'office'))).toContain('outlet')
    expect(rules(check(room, [it_('b', 'bed_double', 0, 0), it_('w', 'wardrobe', 160, 20, 90)], 'bedroom'))).toContain('bed_clearance')
    expect(rules(check(room, [it_('b', 'bed_double', 0, 0)], 'bedroom'))).not.toContain('bed_clearance')
    expect(rules(check(room, [it_('s', 'bookshelf', 120, 0)], 'general'))).toContain('window_blocked')
  })
  it('presets start broken (except dad-visits in general) and grid has reachable cells', () => {
    for (const p of PRESETS.filter(p => p.items.length)) {
      const v = check(p.room, p.items, p.profile)
      if (p.id !== 'dad-visits') expect(v.length, p.id).toBeGreaterThan(0)
      const g = walkGrid(p.room, p.items, 60)
      // studio-tight was excluded here with nothing asserted in its place — and a sealed door is that
      // scene's entire premise ("Bed blocks the door. Fit bed, desk and sofa."), so it is the one
      // preset worth being sure about. Nudge the bed in the fixture and this now says so.
      expect(Array.from(g.reach).some(Boolean), `${p.id}: reachable from the door`).toBe(p.id !== 'studio-tight')
    }
    const dad = PRESETS.find(p => p.id === 'dad-visits')!
    expect(check(dad.room, dad.items, 'general').filter(v => v.severity === 'error')).toHaveLength(0)
    expect(check(dad.room, dad.items, 'accessibility').length).toBeGreaterThan(0)
  })
})

import { walkPath, sunlit } from './rules'
describe('walk + daylight', () => {
  it('walkPath reaches a sofa across an open room and fails when walled off', () => {
    const sofa = it_('s', 'sofa', 100, 20)
    const p = walkPath(room, [sofa], sofa, 60)
    expect(p && p.length).toBeGreaterThan(200)
    const wall = [it_('w1', 'wardrobe', 0, 200), it_('w2', 'wardrobe', 120, 200), it_('w3', 'wardrobe', 240, 200), it_('w4', 'wardrobe', 340, 200)]
    expect(walkPath(room, [sofa, ...wall], sofa, 60)).toBeNull()
  })
  it('glare depends on the hour', () => {
    expect(sunlit('E', 9)).toBe(true); expect(sunlit('E', 15)).toBe(false); expect(sunlit('N', 12)).toBe(false)
    const tv = it_('tv', 'tv_unit', 130, 100, 180) // faces the north window
    expect(rules(check(room, [tv], 'theater', undefined, 9))).not.toContain('glare')
    const r2: Room = { ...room, windows: [{ id: 'e', wall: 'E', pos: 100, width: 150 }] }
    const tv2 = it_('tv', 'tv_unit', 200, 150, 270) // faces east
    expect(rules(check(r2, [tv2], 'theater', undefined, 9))).toContain('glare')
    expect(rules(check(r2, [tv2], 'theater', undefined, 20))).not.toContain('glare')
  })
})

import { PROFILE_RULES } from './rules'
describe('tool arg handling + profiles', () => {
  it('every profile has its rules and accessibility is the strictest walkway', () => {
    for (const p of Object.keys(PROFILE_RULES) as (keyof typeof PROFILE_RULES)[]) expect(PROFILE_RULES[p].length).toBeGreaterThan(3)
    expect(minWalk('accessibility')).toBeGreaterThan(minWalk('general'))
  })
})
import { minWalk } from './rules'

import { CATALOG as CAT } from './catalog'
describe('lighting', () => {
  const seat = it_('s', 'sofa', 100, 100)
  it('warns when nothing lights the room and clears with a ceiling light', () => {
    expect(rules(check(room, [seat], 'general'))).toContain('lighting')
    const lit: Item = { id: 'c', type: 'ceiling_light', x: 120, y: 120, rot: 0, w: CAT.ceiling_light.w, h: CAT.ceiling_light.h }
    expect(rules(check(room, [seat, lit], 'general'))).not.toContain('lighting')
    const far: Item = { ...lit, x: 390, y: 390 } // beyond the ceiling light's 300cm reach
    expect(rules(check(room, [seat, far], 'general'))).toContain('lighting')
  })
  it('ceiling fixtures never block walkways or overlap', () => {
    const lit: Item = { id: 'c', type: 'ceiling_light', x: 100, y: 100, rot: 0, w: 50, h: 50 }
    const v = check(room, [seat, lit], 'general')
    expect(v.filter(x => x.items.includes('c') && (x.rule === 'overlap' || x.rule === 'walkway'))).toHaveLength(0)
  })
})

import { lightReport } from './light'
describe('lighting model', () => {
  const desk = it_('d', 'desk', 100, 100)
  const item = (id: string, type: keyof typeof CAT, x: number, y: number): Item => ({ id, type, x, y, rot: 0, w: CAT[type].w, h: CAT[type].h })
  it('overhead-only desk is flagged; a pendant fixes it', () => {
    const ceil = item('c', 'ceiling_light', 100, 100)
    expect(rules(check(room, [desk, ceil], 'office'))).toContain('lighting')
    const pend = item('p', 'pendant', 110, 110)
    expect(rules(check(room, [desk, ceil, pend], 'office'))).not.toContain('lighting')
  })
  it('report names layers, mood and mixed colour temperature', () => {
    const r = lightReport(room, [desk, item('c', 'cove_strip', 100, 20), item('d2', 'downlights', 150, 150)])
    expect(r.layers.mood).toBe(1); expect(r.layers.ambient).toBe(1)
    expect(r.mood).toMatch(/warm|cosy|neutral/)
    expect(r.advice.join(' ')).toMatch(/task light/)
    const cold = lightReport(room, [item('a', 'ceiling_light', 100, 100), item('b', 'cove_strip', 100, 20)])
    expect(cold.advice.join(' ')).toMatch(/colour temperature/)
  })
})

describe('situational rules', () => {
  const mk = (id: string, type: keyof typeof CAT, x: number, y: number, rot: 0 | 90 | 180 | 270 = 0): Item => ({ id, type, x, y, rot, w: CAT[type].w, h: CAT[type].h })
  it('viewing angle flags a seat far off the screen axis', () => {
    const tv = mk('tv', 'tv_unit', 150, 0)                        // faces S
    const onAxis = mk('s', 'sofa', 110, 260, 180)                 // dead ahead
    const offAxis = mk('s', 'sofa', 300, 40, 180)                 // beside the screen
    expect(rules(check(room, [tv, onAxis], 'theater'))).not.toContain('viewing_angle')
    expect(rules(check(room, [tv, offAxis], 'theater'))).toContain('viewing_angle')
  })
  it('back_to_door only fires when the seat actually faces away from the door', () => {
    const away = mk('d', 'desk', 150, 100, 0)   // faces S, door is S -> facing it
    const toward = mk('d', 'desk', 150, 100, 180) // faces N, back to the S door
    expect(rules(check(room, [away], 'office'))).not.toContain('back_to_door')
    expect(rules(check(room, [toward], 'office'))).toContain('back_to_door')
  })
  it('bed under window, rug floating, dining pull-out', () => {
    expect(rules(check(room, [mk('b', 'bed_double', 110, 0)], 'bedroom'))).toContain('bed_under_window')
    expect(rules(check(room, [mk('b', 'bed_double', 110, 200)], 'bedroom'))).not.toContain('bed_under_window')
    const sofa = mk('s', 'sofa', 100, 100)
    expect(rules(check(room, [sofa, mk('r', 'rug', 100, 300)], 'theater'))).toContain('rug_anchor')
    expect(rules(check(room, [sofa, mk('r', 'rug', 90, 160)], 'theater'))).not.toContain('rug_anchor')
    expect(rules(check(room, [mk('t', 'dining_table', 10, 150)], 'general'))).toContain('dining_pullout')
    expect(rules(check(room, [mk('t', 'dining_table', 130, 150)], 'general'))).not.toContain('dining_pullout')
  })
  it('traffic_crosses fires when the door sits beside the screen-to-seat line', () => {
    // door is on the S wall at x 150-240; a seat on the E side puts the entry path across the view
    const tv = mk('tv', 'tv_unit', 0, 150, 270), sofa = mk('s', 'sofa', 300, 150, 90)
    expect(rules(check(room, [tv, sofa], 'theater'))).toContain('traffic_crosses')
    // move the group north, away from the door, and the path no longer cuts it
    const tv2 = mk('tv', 'tv_unit', 0, 40, 270), sofa2 = mk('s', 'sofa', 300, 40, 90)
    expect(rules(check(room, [tv2, sofa2], 'theater'))).not.toContain('traffic_crosses')
  })
})

import { dockPosition, isDocked } from './dock'
describe('docking', () => {
  const mk2 = (id: string, type: keyof typeof CAT, x: number, y: number, rot: 0 | 90 | 180 | 270 = 0): Item => ({ id, type, x, y, rot, w: CAT[type].w, h: CAT[type].h })
  it('a chair docks in front of the desk, facing it', () => {
    const desk = mk2('d', 'desk', 100, 50)        // faces S
    const p = dockPosition('chair', desk, CAT.chair.w, CAT.chair.h)!
    expect(p.rot).toBe(180)                        // chair looks back north at the desk
    expect(p.y).toBeGreaterThan(desk.y + CAT.desk.h) // sits south of it
    expect(isDocked({ ...mk2('c', 'chair', p.x, p.y, p.rot) }, desk)).toBe(true)
    expect(isDocked(mk2('c', 'chair', 350, 350), desk)).toBe(false)
  })
  it('coffee table lands 45cm in front of the sofa and rug lands under it', () => {
    const sofa = mk2('s', 'sofa', 100, 100)
    const t = dockPosition('coffee_table', sofa, CAT.coffee_table.w, CAT.coffee_table.h)!
    expect(t.y - (sofa.y + CAT.sofa.h)).toBeGreaterThanOrEqual(40) // 45cm, snapped to the 10cm grid
    const r = dockPosition('rug', sofa, CAT.rug.w, CAT.rug.h)!
    expect(r.x + CAT.rug.w / 2).toBeCloseTo(sofa.x + CAT.sofa.w / 2, -1)
  })
  it('pairing rule flags an adrift chair', () => {
    const desk = mk2('d', 'desk', 100, 50)
    expect(rules(check(room, [desk, mk2('c', 'chair', 350, 350)], 'office'))).toContain('pairing')
    const p = dockPosition('chair', desk, CAT.chair.w, CAT.chair.h)!
    expect(rules(check(room, [desk, mk2('c', 'chair', p.x, p.y, p.rot)], 'office'))).not.toContain('pairing')
  })
})

import { sunAt, windowSun, beamReach } from './sun'
describe('sun', () => {
  const R = { w: 500, h: 400, doors: [], windows: [], outlets: [] }
  it('rises in the east, peaks south, sets west', () => {
    expect(sunAt(7).azimuth).toBeLessThan(120)          // east-ish
    expect(sunAt(12).azimuth).toBe(180)                 // due south at noon
    expect(sunAt(17).azimuth).toBeGreaterThan(240)      // west-ish
    expect(sunAt(23).up).toBe(false)
    expect(sunAt(12, 'summer').altitude).toBeGreaterThan(sunAt(12, 'winter').altitude)
  })
  it('a window is lit only when the sun is on its side', () => {
    expect(windowSun('E', 8, R)).toBeGreaterThan(0.2)
    expect(windowSun('E', 17, R)).toBe(0)
    expect(windowSun('W', 17, R)).toBeGreaterThan(0.2)
    expect(windowSun('N', 12, R)).toBe(0)
    expect(windowSun('S', 12, R)).toBeGreaterThan(0.2)
  })
  it('rotating the room moves the sun with it', () => {
    const turned = { ...R, north: 90 }                  // top wall now faces east
    expect(windowSun('N', 8, turned)).toBeGreaterThan(0.2) // the top wall now catches the morning sun
    expect(windowSun('N', 8, R)).toBe(0)
  })
  it('a low sun throws a longer beam than a high one', () => {
    expect(beamReach(7, R)).toBeGreaterThan(beamReach(12, R))
  })
})

describe('edge cases', () => {
  const empty: Room = { w: 400, h: 400, doors: [{ id: 'd', wall: 'S', pos: 150, width: 90 }], windows: [], outlets: [] }
  it('an empty room breaks nothing', () => {
    for (const p of ['general', 'theater', 'office', 'bedroom', 'accessibility'] as const)
      expect(check(empty, [], p), p).toHaveLength(0)
  })
  it('a room with only ceiling fixtures breaks nothing', () => {
    const lit: Item = { id: 'c', type: 'ceiling_light', x: 180, y: 180, rot: 0, w: 50, h: 50 }
    expect(check(empty, [lit], 'general')).toHaveLength(0)
  })
  it('parked items break no geometry rule but are reported once', () => {
    const parked: Item = { id: 'p', type: 'sofa', x: 0, y: 0, rot: 0, w: 210, h: 90, parked: true }
    const onDoor: Item = { ...parked, id: 'q', x: 150, y: 350 }
    expect(check(empty, [parked], 'general').map(v => v.rule)).toEqual(['doesnt_fit'])
    // the same item unparked WOULD block the door — proving parking is what silences it
    expect(check(empty, [{ ...onDoor, parked: undefined }], 'general').map(v => v.rule)).toContain('door_blocked')
  })
  it('a room with no doors does not crash the walkway rule', () => {
    const noDoor: Room = { ...empty, doors: [] }
    expect(() => check(noDoor, [{ id: 's', type: 'sofa', x: 10, y: 10, rot: 0, w: 210, h: 90 }], 'general')).not.toThrow()
  })
  it('rotation is stable and out-of-range rotations are normalised', () => {
    expect(normRot(45)).toBe(90); expect(normRot(360)).toBe(0); expect(normRot(-90)).toBe(270); expect(normRot(NaN)).toBe(0)
  })
})
import { normRot } from './rules'

describe('accessibility', () => {
  const big: Room = { w: 500, h: 500, doors: [{ id: 'd', wall: 'S', pos: 200, width: 90 }], windows: [], outlets: [{ x: 0, y: 250 }] }
  const tight: Room = { w: 260, h: 260, doors: [{ id: 'd', wall: 'S', pos: 80, width: 90 }], windows: [], outlets: [] }

  it('a sofa in a big empty room has room to turn beside it', () => {
    const c = turningCircles(big, [it_('sofa', 'sofa', 150, 40)])
    expect(c).toHaveLength(1)
    expect(c[0].ok).toBe(true)
    // the circle the page reports must actually be a 150cm circle inside the room
    expect(c[0].x - TURN / 2).toBeGreaterThanOrEqual(0)
    expect(c[0].y - TURN / 2).toBeGreaterThanOrEqual(0)
    expect(c[0].x + TURN / 2).toBeLessThanOrEqual(big.w)
    expect(c[0].y + TURN / 2).toBeLessThanOrEqual(big.h)
  })

  it('boxing the sofa in removes the turning circle and raises an error', () => {
    // 260cm room, sofa across the top, wardrobes down both sides: no 150 square is left
    const items = [it_('sofa', 'sofa', 20, 10), it_('wa', 'wardrobe', 0, 120, 90), it_('wb', 'wardrobe', 200, 120, 90)]
    expect(turningCircles(tight, items)[0].ok).toBe(false)
    const v = check(tight, items, 'accessibility')
    expect(rules(v)).toContain('turning_circle')
    expect(v.find(x => x.rule === 'turning_circle')!.severity).toBe('error')
  })

  it('turning circles are an accessibility rule only', () => {
    const items = [it_('sofa', 'sofa', 20, 10), it_('wa', 'wardrobe', 0, 120, 90), it_('wb', 'wardrobe', 200, 120, 90)]
    expect(rules(check(tight, items, 'general'))).not.toContain('turning_circle')
  })

  it('a bed needs 90cm of transfer space, not 60', () => {
    // bed against the west wall with a 70cm gap on its open side: fine normally, not for a wheelchair
    const r: Room = { w: 400, h: 400, doors: [{ id: 'd', wall: 'S', pos: 150, width: 90 }], windows: [], outlets: [] }
    const items = [it_('bed', 'bed_double', 0, 100), it_('wd', 'wardrobe', 230, 100, 90)]
    expect(rules(check(r, items, 'bedroom'))).not.toContain('bed_clearance')
    expect(rules(check(r, items, 'accessibility'))).toContain('bed_clearance')
  })

  it('furniture parked in front of a socket is out of reach', () => {
    const r: Room = { w: 400, h: 400, doors: [{ id: 'd', wall: 'S', pos: 150, width: 90 }], windows: [], outlets: [{ x: 0, y: 200 }] }
    const clear = check(r, [it_('sofa', 'sofa', 150, 150)], 'accessibility')
    expect(rules(clear)).not.toContain('reach_range')
    const covered = check(r, [it_('sh', 'bookshelf', 0, 180, 90)], 'accessibility')
    expect(rules(covered)).toContain('reach_range')
  })

  it('an empty accessible room is still 100/100', () => {
    const v = check(big, [], 'accessibility')
    expect(v).toEqual([])
    expect(score(v)).toBe(100)
  })
})

describe('find_space', () => {
  const r: Room = { w: 600, h: 450, doors: [{ id: 'd', wall: 'S', pos: 260, width: 90 }], windows: [], outlets: [{ x: 0, y: 200 }] }
  const rect = (c: { x: number; y: number; rot: number }, w: number, h: number) => ({ x: c.x, y: c.y, w: c.rot % 180 ? h : w, h: c.rot % 180 ? w : h })

  it('two searches made before applying do not return overlapping spots', () => {
    set({ room: r, items: [], profile: 'general', hour: 9 })
    const a = findSpace(210, 90, 'sofa').candidates[0]
    expect(a).toBeTruthy()
    // the agent has decided on `a` but has not applied it yet — tell the page
    const b = findSpace(210, 90, 'sofa', 'any', undefined, undefined, [{ type: 'sofa', x: a.x, y: a.y, rot: a.rot as 0 }]).candidates[0]
    expect(b).toBeTruthy()
    expect(hits(rect(a, 210, 90), rect(b, 210, 90))).toBe(false)
  })

  it('an item bigger than the room says so, instead of returning an empty list', () => {
    const tiny: Room = { w: 200, h: 200, doors: [{ id: 'd', wall: 'S', pos: 50, width: 90 }], windows: [], outlets: [] }
    set({ room: tiny, items: [], profile: 'general', hour: 9 })
    const res = findSpace(210, 90, 'sofa')
    expect(res.candidates).toHaveLength(0)
    expect(res.note).toMatch(/bigger than the room/)
  })

  it('a room with no legal spot still hands back real coordinates, never nothing', () => {
    const packed: Room = { w: 220, h: 220, doors: [{ id: 'd', wall: 'S', pos: 60, width: 90 }], windows: [], outlets: [] }
    set({ room: packed, items: [it_('bed', 'bed_double', 10, 10)], profile: 'general', hour: 9 })
    const res = findSpace(110, 60, 'coffee_table')
    expect(res.candidates).toHaveLength(0)
    expect(res.note).toMatch(/Do NOT invent coordinates/)
    expect(res.least_bad!.length).toBeGreaterThan(0)
    expect(res.least_bad![0].why).toMatch(/clash|rule/)
  })
})

describe('turning circles connect through a normal doorway', () => {
  // regression: flood-filling at 150cm meant a 90cm door had no 150 block at the threshold, so EVERY
  // circle in the room failed. A chair travels a 90cm corridor and turns where there is room.
  const r: Room = { w: 600, h: 450, doors: [{ id: 'd', wall: 'S', pos: 260, width: 90 }], windows: [], outlets: [] }
  it('an open room reachable through a 90cm door has turning space at the sofa', () => {
    const c = turningCircles(r, [it_('sofa', 'sofa', 20, 20), it_('tv', 'tv_unit', 230, 0)])
    expect(c.every(x => x.ok)).toBe(true)
  })
  it('the circle it reports is genuinely clear of the furniture', () => {
    const items = [it_('sofa', 'sofa', 20, 20)]
    const c = turningCircles(r, items)[0]
    const circle = { x: c.x - TURN / 2, y: c.y - TURN / 2, w: TURN, h: TURN }
    expect(hits(circle, { x: 20, y: 20, w: 210, h: 90 })).toBe(false)
  })
})

describe('find_space can re-plan a full room', () => {
  // the failure an agent actually hit: "automated search is producing messy overlaps ...
  // placing everything by exact coordinates instead". Judged against the un-cleared room,
  // every candidate is blocked, so the agent abandons the tool and guesses.
  const r: Room = { w: 420, h: 360, doors: [{ id: 'd', wall: 'W', pos: 30, width: 90 }], windows: [], outlets: [] }
  const messy = [it_('sofa', 'sofa', 110, 240, 180), it_('chair_a', 'armchair', 330, 40, 90), it_('tv', 'tv_unit', 160, 0)]

  const sofaRect = { x: 110, y: 240, w: 210, h: 90 }
  const rectOf = (c: { x: number; y: number; rot: number }) => ({ x: c.x, y: c.y, w: c.rot % 180 ? 90 : 210, h: c.rot % 180 ? 210 : 90 })

  it('the space the old sofa occupies is off limits until you say it is moving', () => {
    set({ room: r, items: messy, profile: 'general', hour: 9 })
    const before = findSpace(210, 90, 'sofa').candidates
    expect(before.every(c => !hits(rectOf(c), sofaRect))).toBe(true)
    const after = findSpace(210, 90, 'sofa', 'any', undefined, undefined, [], ['sofa']).candidates
    expect(after.some(c => hits(rectOf(c), sofaRect))).toBe(true)
  })

  it('the real demo scene yields nothing until the movers are ignored', () => {
    // dad-visits in accessibility mode: judged as-is, there is no legal sofa spot at all, which is
    // exactly when an agent gives up on the tool and starts inventing coordinates.
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ room: p.room, items: p.items.map(i => ({ ...i })), profile: 'accessibility', hour: 9 })
    expect(findSpace(210, 90, 'sofa').candidates).toHaveLength(0)
    const movers = p.items.filter(i => i.type !== 'ceiling_light').map(i => i.id)
    expect(findSpace(210, 90, 'sofa', 'any', undefined, undefined, [], movers).candidates.length).toBeGreaterThan(0)
  })

  it('id infers the footprint and ignores where the item currently sits', () => {
    set({ room: r, items: messy, profile: 'general', hour: 9 })
    const byId = findSpace(210, 90, 'sofa', 'any', undefined, undefined, [], ['sofa'])
    expect(byId.candidates.length).toBeGreaterThan(0)
    // the winner must not sit on anything that stayed put
    const c = byId.candidates[0], f = { x: c.x, y: c.y, w: c.rot % 180 ? 90 : 210, h: c.rot % 180 ? 210 : 90 }
    expect(hits(f, { x: 330, y: 40, w: 85, h: 85 })).toBe(false)
    expect(hits(f, { x: 160, y: 0, w: 140, h: 40 })).toBe(false)
  })
})

describe('claims inferred from prose', () => {
  it('"2.2 m from the TV" becomes a distance claim against the tv', () => {
    set({ room: { w: 600, h: 450, doors: [{ id: 'd', wall: 'S', pos: 260, width: 90 }], windows: [], outlets: [] }, items: [it_('sofa', 'sofa', 200, 300), it_('tv', 'tv_unit', 230, 0)], profile: 'general', hour: 9 })
    expect(inferClaim('Faces the TV at 2.2 m — the sweet spot', 'sofa')).toEqual({ kind: 'distance', a: 'sofa', b: 'tv', value: 2.2, unit: 'm' })
    expect(inferClaim('leaves a 90cm gap to the bookshelf', 'tv')).toBeNull() // no bookshelf in the room
    expect(inferClaim('40cm clear to the wall', 'sofa')).toEqual({ kind: 'clear', a: 'sofa', value: 40, unit: 'cm' })
    expect(inferClaim('looks great here', 'sofa')).toBeNull()
  })
})

describe('shared links', () => {
  it('a malformed shared plan is rejected, a damaged one is cleaned, never a crash', () => {
    expect(loadShare('not-base64!!')).toBe(false)
    const b64 = (o: unknown) => btoa(JSON.stringify(o))
    expect(loadShare(b64({ r: { w: 400, h: 400, doors: [], windows: [], outlets: [] }, i: [{ id: 'x', x: 0, y: 0 }, { id: 'ok', type: 'sofa', x: 10, y: 10, rot: 45 }] }))).toBe(true)
    expect(state.items).toHaveLength(1)
    expect(state.items[0].rot).toBe(90)
    expect(() => check(state.room, state.items, state.profile)).not.toThrow()
  })
})

// Every tool call writes one line into the visible transcript. A slip there used to read as
// "looked for a spot for undefined×undefined" in front of the human, so drive every tool the way
// an agent actually would and assert the line is clean.
describe('transcript lines', () => {
  // share and preset write to the URL; node has no location
  Object.assign(globalThis, {
    location: { search: '', origin: 'https://room.test', href: 'https://room.test/', hash: '' },
    history: { replaceState: () => {} },
  })

  const ARGS: Record<string, any> = {
    get_room: {}, sense_room: {}, access_check: {}, undo: {}, share: {}, baseline: {}, saves: { action: 'list' }, plan_sheet: {}, define_flat: { bedrooms: 2, people: 4 }, rooms: {}, enter_room: { id: 'kitchen' }, bedside_check: {}, work_triangle: {},
    find_space: { id: 'sofa', facing: 'tv', near: 'rug' },
    measure: { a: 'sofa', b: 'tv' },
    move_items: { items: [{ id: 'sofa', x: 100, y: 100 }] },
    dock_item: { id: 'rug' },
    add_item: { type: 'lamp', x: 50, y: 50 },
    remove_item: { id: 'plant', keep: true },
    say: { item: 'sofa', text: 'this seat has the view', options: ['ok'] },
    show: { highlight: 'sofa', route_to: 'sofa', view: '3d', eye: 'chair_a' },   // highlight as a bare string, on purpose
    set_profile: { profile: 'accessibility' },
    sun: { hour: 14 },
    layouts: { save: 'plan A' },
    set_room: { w: 421, h: 359 },                                 // odd numbers: the room snaps them
    preset: { id: 'dad-visits' },
    read_message_from_human: {},
    brief: { people: 5, activity: 'study', who: 'kids' },
    arrange: { items: ['chair_a', 'chair_b'], as: 'row', gap: 25, facing: 'tv' },
  }

  it('covers every tool', () => {
    expect(TOOLS.map(t => t.name).filter(n => !(n in ARGS))).toEqual([])
  })

  // The four that legitimately say nothing in this scene: three cannot run here at all (no bed, no
  // kitchen, no window.open in node) and dock_item has nowhere to put the rug. Anything else going
  // quiet is a tool that stopped narrating itself.
  const SILENT_HERE = ['dock_item', 'bedside_check', 'work_triangle', 'plan_sheet']
  for (const t of TOOLS) {
    it(`${t.name} reads as English`, async () => {
      const p = PRESETS.find(x => x.id === 'dad-visits')!
      set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {} })
      const a = ARGS[t.name]
      if (t.name === 'define_flat') set({ items: [], flat: null, here: null })
      const out = await t.run(a)
      const line = plain(t.name, a, out)
      // plain() answers null for any call that errored — a failed call did nothing, and "added a
      // shower" for a shower that would not fit is how somebody ends up buying a shower. But that
      // made this a test you could pass by erroring, and add_item did: its argument here named
      // "floor_lamp", which is not in the catalogue, so the line it exists to check never ran.
      if (line === null) {
        expect(SILENT_HERE, `${t.name} wrote no transcript line — it errored on ${JSON.stringify(a)}`).toContain(t.name)
        return
      }
      expect(line).not.toMatch(/undefined|NaN|\[object Object\]/)
      // "measured the sofa (sofa) to the rug (rug)" — the id only earns its place when it is not
      // already what the thing is called
      expect(line.length).toBeGreaterThan(3)
    })
  }
})

// An agent guessing {id, to:{x,y}} — a shape half the schemas in the world use — was told "moved: 1"
// about furniture that had not stirred.
// The ✓/✗ on the plan is the human's veto and the page's whole argument about who decides. It was an
// SVG shape with an onClick: no keyboard could reach it and no screen reader could name it, while the
// README promised every control tabs.
// The 2D plan describes itself to a screen reader. The 3D view is the same room from another angle
// and was an empty div, so switching to it made the whole room disappear.
describe('both views say what is in the room', () => {
  it('the 3D view carries the same description as the plan', () => {
    expect(sceneSource, '3D view has no accessible name').toMatch(/role="img" aria-label=/)
    expect(sceneSource).toMatch(/describePlan\(state\.room, state\.items, V, 'Three-dimensional view of the room'\)/)
  })
})

describe('the veto on the plan is a real control', () => {
  const src = planSource + flatPlanSource
  it('every clickable group in the drawings announces itself and takes a key', () => {
    const clickable = [...src.matchAll(/<g[^>]*onClick=/g)]
    expect(clickable, 'a group with a bare onClick and no keyboard path').toEqual([])
    // and the helper that replaced them does all three things
    expect(src).toMatch(/role: 'button', tabIndex: 0, 'aria-label'/)
    expect(src).toMatch(/e\.key === 'Enter' \|\| e\.key === ' '/)
  })
})

describe('what a piece would clash with is named', () => {
  it('names the furniture rather than listing ids', () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, flat: null, here: null })
    const r = findSpace(290, 210, 'sofa')
    const why = (r.least_bad ?? [])[0]?.why ?? ''
    expect(why, 'no blocked spot to explain').toBeTruthy()
    expect(why).toMatch(/would clash with the /)
    expect(why, 'read its ids out to a person').not.toMatch(/with sofa,|with table,/)
  })
})

// `saves` takes {action, name}. An agent that tries the same shape on `layouts` — its neighbour in
// the tool list, doing the same job for a different shelf — used to get the LIST back, silently,
// instead of the option it asked for.
// Chrome's guidance is to validate loosely in the schema and strictly in code. Strictly has to mean
// saying what was corrected: people:"many" silently became a room for one person.
// "somewhere near the sofa", with the id mistyped, came back as spots near nothing at all — dressed
// up as answers to the question that was asked.
// add_item({x: 99999}) landed the lamp at 390 and said nothing about it. The page choosing a spot
// announces itself; the page overruling the spot it was given should too.
// An id from a shared link is drawn on the plan, printed on the sheet, and travels to another origin
// inside find_space's answer. It is a name, so it is held to one.
// Everything a person reads on this page is built from text the agent or the human typed. Escaping
// one character into an innerHTML template is a rule somebody has to keep remembering.
// The legend under the ASCII map is read on every get_room — the most-read text the page produces —
// and it said "Rug rug at (110,140)".
// "Every violation carries its fix, so a rule you cannot satisfy is treated as a bug." That is a
// claim in the submission, and nothing checked it across every scene and every goal.
describe('every problem the page reports comes with its fix', () => {
  it('across every scene and every goal', () => {
    const profiles = ['general', 'theater', 'office', 'bedroom', 'accessibility'] as const
    const seen = new Set<string>()
    const bare: string[] = []
    for (const p of PRESETS) for (const profile of profiles) {
      for (const hour of [9, 21]) {
        for (const v of check(p.room, p.items, profile, undefined, hour)) {
          seen.add(v.rule)
          if (!v.fix || !String(v.fix).trim()) bare.push(`${p.id}/${profile}: ${v.rule} — ${v.msg.slice(0, 60)}`)
        }
      }
    }
    expect(bare.slice(0, 5), 'a problem with no way out of it').toEqual([])
    // and the sweep has to be wide enough to mean something
    // measured: 18 of the 28 rules fire somewhere across the scenes and goals. A floor of 17 lets one
    // stop firing without a false alarm and still catches the sweep quietly collapsing to a handful.
    expect(seen.size, `only ${seen.size} rules ever fired`).toBeGreaterThan(16)
  })
})

describe('the legend names a thing once', () => {
  it('drops an id that is already the name, keeps one that is not', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, flat: null, here: null })
    const legend = Object.values((TOOLS.find(t => t.name === 'get_room')!.run({}) as any).legend as Record<string, string>)
    for (const said of ['Rug at', 'Sofa at', 'Plant at'])
      expect(legend.some(l => l.startsWith(said)), `legend should say "${said} …"`).toBe(true)
    for (const kept of ['Armchair chair_a at', 'Coffee table table at', 'TV unit tv at'])
      expect(legend.some(l => l.startsWith(kept)), `legend should keep the id in "${kept} …"`).toBe(true)
  })
})

describe('nothing is rendered by pasting a string into HTML', () => {
  it('the 3D bubbles are built from nodes', () => {
    expect(sceneSource, 'a bubble still assembles HTML from a template').not.toMatch(/innerHTML/)
    expect(sceneSource).toMatch(/createTextNode\(n\.text\)/)
    expect(sceneSource).toMatch(/v\.textContent = /)
  })
})

describe('an id that arrives in a link is a name, not markup', () => {
  it('strips anything that is not a name', () => {
    const plan = { r: { w: 400, h: 300 }, i: [{ id: '<img src=x onerror=1>', type: 'sofa', x: 10, y: 10 }] }
    const hash = btoa(unescape(encodeURIComponent(JSON.stringify(plan))))
    expect(loadShare(hash)).toBe(true)
    const id = state.items[0].id
    expect(id, 'markup arrived intact from a link').not.toMatch(/[<>="'\s]/)
    expect(id).toBe('imgsrcxonerror1')
  })
})

describe('a coordinate the room overrules is reported back', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9,
      notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null }) }

  it('says so when it pulls a piece back inside the room', async () => {
    scene()
    const r = await run('add_item', { type: 'lamp', x: 99999, y: -500 })
    expect(r.item.x).toBeLessThanOrEqual(state.room.w)
    expect(r.moved_to_fit, 'clamped in silence').toMatch(/x 99999 →/)
    expect(r.moved_to_fit).toMatch(/y -500 →/)
  })

  it('does not call the 10cm grid a clamp', async () => {
    scene()
    const r = await run('add_item', { type: 'lamp', x: 104, y: 96 })
    expect(r.item.x).toBe(100)
    expect(r.moved_to_fit, 'snapping to the grid is not overruling anybody').toBeUndefined()
  })
})

describe('a request the page cannot honour is not answered anyway', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9,
      notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null }) }

  it('will not find a spot near something that is not there', async () => {
    scene()
    const r = await run('find_space', { w: 100, h: 60, near: 'no_such_sofa' })
    expect(r.candidates, 'answered as if the anchor existed').toBeUndefined()
    expect(r.error).toMatch(/near: no item called no_such_sofa/)
    expect(r.ids).toContain('sofa')
    // the words the page understands are still words, not ids
    expect((await run('find_space', { w: 100, h: 60, facing: 'window' })).error).toBeUndefined()
  })

  it('says which ids it could not highlight, and takes a bare one', async () => {
    scene()
    expect((await run('show', { highlight: 'sofa' })).highlight, 'a single id has to work').toEqual(['sofa'])
    const some = await run('show', { highlight: ['sofa', 'ghost'] })
    expect(some.highlight).toEqual({ highlighted: ['sofa'], ignored: ['ghost'], why: 'not in this room' })
    expect((await run('show', { highlight: 'ghost' })).highlight.error).toMatch(/no item called ghost/)
  })
})

describe('a clamp that changes the meaning says so', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('names what it threw away instead of quietly building a room for one', async () => {
    const r = await run('brief', { people: 'many', activity: 'vibing' })
    expect(r.brief.people, 'still clamps, as the schema promises').toBe(1)
    expect(r.corrected.join(' '), 'clamped in silence').toMatch(/people: ignored "many"/)
    expect(r.corrected.join(' ')).toMatch(/activity: ignored "vibing"/)
  })

  it('says nothing about corrections when there is nothing to correct', async () => {
    const r = await run('brief', { people: 4, activity: 'watch' })
    expect(r.corrected).toBeUndefined()
    expect(r.brief).toEqual({ people: 4, activity: 'watch' })
  })

  it('will not measure a thing against itself', async () => {
    const r = await run('measure', { a: 'sofa', b: 'sofa' })
    expect(r.edge_to_edge, 'answered 0cm, which reads like a measurement').toBeUndefined()
    expect(r.error).toMatch(/not two things/)
  })
})

describe('the two shelves answer to the same shape', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9,
      notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null }) }

  it('saves and loads an option however the agent phrases it', async () => {
    scene()
    expect((await run('layouts', { action: 'save', name: 'A' })).saved).toBe('A')
    await run('move_items', { id: 'plant', x: 20, y: 20, force: true })
    expect(state.items.find(i => i.id === 'plant')!.x).toBe(20)
    expect((await run('layouts', { action: 'load', name: 'A' })).loaded, 'silently listed instead of loading').toBe('A')
    expect(state.items.find(i => i.id === 'plant')!.x).not.toBe(20)
  })

  it('says which name it wanted rather than listing at you', async () => {
    scene()
    expect((await run('layouts', { action: 'load' })).error).toMatch(/give a name to load/)
    expect((await run('layouts', { action: 'load', name: 'never saved' })).error).toMatch(/unknown layout/)
  })

  it('does not let an undo with nothing to undo look like an undo', async () => {
    scene()
    expect((await run('undo', {})).undone, 'reported an undo it did not do').toBe(false)
    await run('move_items', { id: 'plant', x: 20, y: 20, force: true })
    expect((await run('undo', {})).undone).toBe(true)
  })
})

describe('a move is only a move if something moved', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9,
      notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null }) }

  it('says what it expected when the call carries no position at all', async () => {
    scene()
    const before = state.items.find(i => i.id === 'sofa')!
    const r = await run('move_items', { id: 'sofa', to: { x: 0, y: 30 } })
    expect(r.moved, 'reported a move it did not make').toBeUndefined()
    expect(r.error).toMatch(/give x and y/)
    expect(r.expected).toMatch(/\{id, x, y, rot\}/)
    const after = state.items.find(i => i.id === 'sofa')!
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y })
  })

  it('does not count a piece that was already where it was asked to go', async () => {
    scene()
    const it = state.items.find(i => i.id === 'sofa')!
    const r = await run('move_items', { id: 'sofa', x: it.x, y: it.y })
    expect(r.moved).toBe(0)
    expect(r.already_there).toEqual(['sofa'])
  })
})

// Agents send the wrong shape all the time: a bare string where an array belongs, an id that does
// not exist, nothing at all. A tool may refuse, but it must never throw.
// "Sofa (sofa) overlaps Coffee table (table)": the first id is the name said twice, the second is
// what the agent calls it. Only one of them is worth a reader's attention.
describe('a message names a thing once', () => {
  const room = { w: 400, h: 300, doors: [], windows: [], outlets: [] }
  const at = (id: string, type: 'sofa' | 'coffee_table', x: number, y: number) =>
    ({ id, type, x, y, rot: 0 as const, w: CATALOG[type].w, h: CATALOG[type].h })

  it('drops an id that is already the name, and keeps one that is not', () => {
    const v = check(room, [at('sofa', 'sofa', 100, 100), at('table', 'coffee_table', 120, 120)] as never, 'general')
    const msg = v.find(x => x.rule === 'overlap')!.msg
    expect(msg).toContain('Sofa overlaps')
    expect(msg, 'said "Sofa (sofa)"').not.toContain('(sofa)')
    expect(msg, 'dropped an id the agent actually uses').toContain('(table)')
  })
})

describe('junk arguments', () => {
  const JUNK = [
    {},
    { id: 'no_such_item', a: 'no_such_item', b: 'no_such_item', type: 'no_such_type', profile: 'nonsense' },
    { items: 'sofa', highlight: 'sofa', ignore: 'tv', plan: 'later', options: 'yes', hour: 99, w: -5, h: 'wide' },
  ]
  for (const t of TOOLS) for (const [n, a] of JUNK.entries()) {
    it(`${t.name} survives junk #${n}`, async () => {
      const p = PRESETS.find(x => x.id === 'dad-visits')!
      set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {} })
      if (t.name === 'define_flat') set({ items: [], flat: null, here: null })   // it asks first when there is work to lose
      const out = await t.run(a)
      expect(out, `${t.name} returned nothing`).toBeTruthy()
      let line: string | null = null
      expect(() => { line = plain(t.name, a, out) }).not.toThrow()
      if (line) expect(line, `${t.name} on junk: ${line}`).not.toMatch(/undefined|NaN|\[object Object\]/)
    })
  }
})

// A socket is screwed to a wall and a door is a hole in one. Agents, shared links and resizes all
// hand us raw numbers, so every path that builds a room has to enforce that.
describe('room physics', () => {
  const R = { w: 400, h: 300 }
  const isOnWall = (o: { x: number; y: number }) => o.x === 0 || o.y === 0 || o.x === R.w || o.y === R.h

  it('pulls a floating socket onto the nearest wall', () => {
    expect(onWall({ x: 200, y: 40 }, R.w, R.h)).toEqual({ x: 200, y: 0 })    // nearest is north
    expect(onWall({ x: 380, y: 150 }, R.w, R.h)).toEqual({ x: 400, y: 150 }) // nearest is east
    expect(onWall({ x: 200, y: 150 }, R.w, R.h)).toSatisfy(isOnWall)         // dead centre still lands
  })

  it('clamps sockets that sit outside the room, and survives junk', () => {
    expect(onWall({ x: -50, y: 9999 }, R.w, R.h)).toSatisfy(isOnWall)
    expect(onWall({ x: NaN, y: undefined as any }, R.w, R.h)).toSatisfy(isOnWall)
    expect(onWall(null, R.w, R.h)).toSatisfy(isOnWall)
  })

  it('keeps a door inside its own wall', () => {
    const [d] = openings([{ wall: 'N', pos: 5000, width: 90 }], R.w, R.h, 90)
    expect(d.pos + d.width).toBeLessThanOrEqual(R.w)
    const [wide] = openings([{ wall: 'E', pos: 0, width: 9999 }], R.w, R.h, 90)
    expect(wide.width).toBeLessThanOrEqual(R.h)   // east wall is only 300 long
  })

  it('refuses two openings cut from the same bricks', () => {
    expect(openings([{ wall: 'N', pos: 0, width: 100 }, { wall: 'N', pos: 50, width: 100 }], R.w, R.h, 90)).toHaveLength(1)
    expect(openings([{ wall: 'N', pos: 0, width: 100 }, { wall: 'S', pos: 50, width: 100 }], R.w, R.h, 90)).toHaveLength(2)
    expect(openings([{ wall: 'N', pos: 0, width: 100 }, { wall: 'N', pos: 100, width: 100 }], R.w, R.h, 90)).toHaveLength(2) // touching is fine
  })

  it('drops openings on a wall that does not exist', () => {
    expect(openings([{ wall: 'X', pos: 0, width: 90 }, 'door', null, { pos: 10 }], R.w, R.h, 90)).toEqual([])
  })

  it('keeps sockets on walls when the room is resized', () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ room: { ...p.room }, items: [] })
    resizeRoom(800, 600)
    for (const o of state.room.outlets)
      expect(o.x === 0 || o.y === 0 || o.x === state.room.w || o.y === state.room.h, `socket ${o.x},${o.y} is floating`).toBe(true)
    for (const d of [...state.room.doors, ...state.room.windows])
      expect(d.pos + d.width).toBeLessThanOrEqual(d.wall === 'N' || d.wall === 'S' ? state.room.w : state.room.h)
  })

  it('every shipped preset is already physical', () => {
    for (const p of PRESETS) {
      for (const o of p.room.outlets)
        expect(o.x === 0 || o.y === 0 || o.x === p.room.w || o.y === p.room.h, `${p.id}: socket ${o.x},${o.y} floats`).toBe(true)
      for (const d of [...p.room.doors, ...p.room.windows])
        expect(d.pos + d.width, `${p.id}: ${d.id} runs past the end of wall ${d.wall}`)
          .toBeLessThanOrEqual(d.wall === 'N' || d.wall === 'S' ? p.room.w : p.room.h)
    }
  })
})

// Loopholes an agent can walk through: coordinates that are not numbers, rotations off the grid,
// filling the room until the page dies, and throwing away the human's work without asking.
describe('agent cannot break the room', () => {
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: { ...p.room }, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {} }) }
  const run = (n: string, a: any) => TOOLS.find(t => t.name === n)!.run(a) as any
  const broken = () => state.items.filter(i => !isFinite(i.x) || !isFinite(i.y) || !isFinite(i.w) || !isFinite(i.h) || ![0, 90, 180, 270].includes(i.rot))

  it.each([
    ['a coordinate that is not a number', { type: 'sofa', x: 'abc', y: 5 }],
    ['NaN coordinates', { type: 'sofa', x: NaN, y: NaN }],
    ['coordinates in the millions', { type: 'sofa', x: 1e9, y: -1e9 }],
    ['a 45° rotation', { type: 'sofa', x: 10, y: 10, rot: 45 }],
  ])('add_item survives %s', async (_, a) => {
    scene(); await run('add_item', a)
    expect(broken().map(i => `${i.id} x=${i.x} y=${i.y} rot=${i.rot}`)).toEqual([])
  })

  it('add_item stops before the room becomes unusable', async () => {
    scene()
    let last: any
    for (let k = 0; k < 80; k++) last = await run('add_item', { type: 'plant', x: 10, y: 10 })
    expect(state.items.length).toBeLessThanOrEqual(60)
    expect(last.error).toMatch(/60 pieces/)
  })

  it('preset asks before throwing away a room with furniture in it', async () => {
    scene()
    const before = state.items.length
    const call = run('preset', { id: 'blank' })
    const asked = state.notes.at(-1)!
    expect(asked.text).toContain('Allow?')
    settle(asked.id, '✗ refuse')
    expect((await call).refused).toBe(true)
    expect(state.items).toHaveLength(before)     // the human's room is still there
  })

  it('preset loads freely when there is nothing to lose', async () => {
    set({ presetId: null, items: [], notes: [] })
    expect((await run('preset', { id: 'blank' })).refused).toBeUndefined()
  })
})

describe('more loopholes', () => {
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: { ...p.room }, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {} }) }
  const run = (n: string, a: any) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('two fixtures cannot hang from the same ceiling point', async () => {
    scene()
    await run('add_item', { type: 'chandelier', x: 100, y: 100 })
    await run('add_item', { type: 'chandelier', x: 100, y: 100 })
    expect(check(state.room, state.items, 'general').filter(v => v.rule === 'overlap')).not.toHaveLength(0)
  })

  it('a crafted link cannot smuggle in two items with the same id', () => {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
      r: { w: 400, h: 400, doors: [], windows: [], outlets: [] },
      i: [{ id: 'sofa', type: 'sofa', x: 0, y: 0, rot: 0, w: 210, h: 90 },
          { id: 'sofa', type: 'plant', x: 100, y: 100, rot: 0, w: 40, h: 40 }],
      p: 'general', h: 9, n: [] }))))
    expect(loadShare(payload)).toBe(true)
    expect(new Set(state.items.map(i => i.id)).size).toBe(state.items.length)
  })

  it('loading a saved option says what it brings back', async () => {
    scene()
    await run('layouts', { save: 'A' })
    set({ items: state.items.filter(i => i.id !== 'sofa') })
    expect((await run('layouts', { load: 'A' })).brought_back).toContain('sofa')
  })
})

describe('nothing lands where the human cannot reach it', () => {
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: { ...p.room }, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {} }) }
  const run = (n: string, a: any) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('a move to x:5000 is pulled back inside the walls and reported', async () => {
    scene()
    const r = await run('move_items', { items: [{ id: 'plant', x: 5000, y: 5000 }] })
    const p = state.items.find(i => i.id === 'plant')!
    expect(p.x).toBeLessThanOrEqual(state.room.w)
    expect(p.y).toBeLessThanOrEqual(state.room.h)
    expect(r.clamped).toContain('plant')
  })

  it('an ordinary move is not reported as clamped', async () => {
    scene()
    expect((await run('move_items', { items: [{ id: 'plant', x: 200, y: 200 }] })).clamped).toBeUndefined()
    expect((await run('move_items', { items: [{ id: 'plant', x: 203, y: 207 }] })).clamped).toBeUndefined()  // snapping is not clamping
  })

  it('find_space does not freeze on a runaway plan', async () => {
    scene()
    const t0 = Date.now()
    await run('find_space', { type: 'plant', plan: Array.from({ length: 5000 }, (_, k) => ({ x: k % 400, y: k % 300, w: 40, h: 40 })) })
    // measured at 33ms. 2000 was "not frozen for fifteen seconds", which is what this was written
    // for — but it let a sixtyfold regression through in silence. 400 is still a dozen times the real
    // cost, so a slow machine will not cry wolf.
    expect(Date.now() - t0).toBeLessThan(400)
  })
})

// The complaint that started this: "make a study room for 5 kids" and the agent welded all the
// desks into one slab. Legal geometry, wrong room.
describe('who the room is for', () => {
  const room: Room = { w: 500, h: 400, doors: [{ id: 'door', wall: 'S', pos: 200, width: 90 }], windows: [], outlets: [{ x: 0, y: 200 }] }
  const desks = (n: number, gap: number) => Array.from({ length: n }, (_, k) => it_(`desk_${k}`, 'desk', 10 + k * (140 + gap), 100))
  const brief: Brief = { people: 5, activity: 'study', who: 'kids' }
  const per = (items: Item[], b: Brief | null = brief) => check(room, items, 'office', undefined, 9, b).filter(v => v.rule === 'per_person')

  it('says nothing until somebody says who the room is for', () => {
    expect(check(room, desks(5, 0), 'office', undefined, 9, null).filter(v => v.rule === 'per_person')).toHaveLength(0)
  })

  it('catches five desks welded into one run', () => {
    const v = per(desks(5, 0))
    expect(v.map(x => x.msg).join(' ')).toMatch(/pushed together into one \d+cm run — that reads as a single shared table, not 5 places to work/)
    expect(v.find(x => /pushed together/.test(x.msg))!.items).toHaveLength(5)
  })

  it('is happy once each kid has their own desk with a gap', () => {
    expect(per(desks(3, 30)).filter(v => /pushed together/.test(v.msg))).toHaveLength(0)
  })

  it('counts places against the actual people', () => {
    expect(per([it_('desk_0', 'desk', 10, 100)]).find(v => v.severity === 'error')!.msg).toBe('5 kids need 5 places to study — this room offers 1')
    expect(per([]).find(v => v.severity === 'error')!.fix).toBe('add 5 desks — add_item({type}) lets the page choose where')
  })

  it('counts chairs', () => {
    expect(per(desks(5, 30)).map(v => v.msg).join(' ')).toMatch(/5 kids but 0 chairs/)
  })

  it('reads a shared table as enough places for a meal, but not for homework', () => {
    const table = [it_('t', 'dining_table', 100, 100)]
    expect(per(table, { people: 5, activity: 'dine', who: 'guests' }).filter(v => v.severity === 'error')).toHaveLength(0)
    expect(per(table, brief).filter(v => v.severity === 'error')).toHaveLength(0) // 6 places is enough on paper
  })

  it('clusters things that touch into one object', () => {
    expect(clusters(desks(3, 0))).toHaveLength(1)
    expect(clusters(desks(3, 40))).toHaveLength(3)
  })
})

// "Can it align multiple things at once" — one call, the page does the arithmetic, so the agent
// never hand-computes five coordinates and never leaves 20cm here and 35cm there.
describe('arrange', () => {
  const run = (n: string, a: any) => TOOLS.find(t => t.name === n)!.run(a) as any
  const blank = () => set({ presetId: 'custom', room: { w: 600, h: 500, doors: [{ id: 'door', wall: 'S', pos: 250, width: 90 }], windows: [], outlets: [{ x: 0, y: 200 }] },
    items: [], profile: 'general', brief: null, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {} })
  const desks = async (n: number) => { for (let k = 0; k < n; k++) await run('add_item', { type: 'desk', x: 10 + k * 100, y: 200 })
    return state.items.filter(i => i.type === 'desk').map(i => i.id) }
  const box = (id: string) => footprint(getItem(id)!)

  it('lays a grid with an exact, even pitch', async () => {
    blank(); const ids = await desks(5)
    await run('arrange', { items: ids, as: 'grid', cols: 3, gap: 30, centre: 'room' })
    const b = ids.map(box)
    expect(b[1].x - (b[0].x + b[0].w)).toBe(30)          // the gap is the gap you asked for
    expect(b[2].x - (b[1].x + b[1].w)).toBe(30)          // ...and it is the same one twice
    expect(b[3].y - (b[0].y + b[0].h)).toBe(30)
    expect(new Set(b.slice(0, 3).map(r => r.y)).size).toBe(1)  // a row is a row
  })

  it('turns a composed group as one thing, not piece by piece', async () => {
    blank()
    const tv = (await run('add_item', { type: 'tv_unit', x: 230, y: 0 })).item.id
    const ids = await desks(5)
    await run('arrange', { items: ids, as: 'grid', cols: 3, gap: 30, centre: 'room', facing: tv })
    expect(new Set(ids.map(id => getItem(id)!.rot)).size, 'one desk ended up facing a different way').toBe(1)
    expect(getItem(ids[0])!.rot).toBe(180)               // the TV is north of them
  })

  it('faces each piece individually when it is not re-laying them', async () => {
    blank()
    const table = (await run('add_item', { type: 'dining_table', x: 230, y: 200 })).item.id
    await run('add_item', { type: 'chair', x: 100, y: 220 })
    await run('add_item', { type: 'chair', x: 450, y: 220 })
    const chairs = state.items.filter(i => i.type === 'chair').map(i => i.id)
    await run('arrange', { items: chairs, facing: table })
    expect(new Set(chairs.map(id => getItem(id)!.rot)).size, 'chairs round a table face inward, not all the same way').toBe(2)
  })

  it('aligns without moving things along the other axis', async () => {
    blank(); const ids = await desks(3)
    const xs = ids.map(id => box(id).x)
    await run('arrange', { items: ids, align: 'top' })
    expect(new Set(ids.map(id => box(id).y)).size).toBe(1)
    expect(ids.map(id => box(id).x)).toEqual(xs)
  })

  it('re-spaces where they stand when given only a gap', async () => {
    blank(); const ids = await desks(3)
    await run('arrange', { items: ids, gap: 40 })
    const b = ids.map(box).sort((p, q) => p.x - q.x)
    expect(b[1].x - (b[0].x + b[0].w)).toBe(40)
    expect(b[2].x - (b[1].x + b[1].w)).toBe(40)
  })

  it('proposes without moving anything', async () => {
    blank(); const ids = await desks(3)
    const before = ids.map(id => box(id).x)
    const r = await run('arrange', { items: ids, as: 'row', gap: 20, propose: true })
    expect(ids.map(id => box(id).x)).toEqual(before)
    expect(r.proposed).toHaveLength(3)
    expect(state.proposals).toHaveLength(3)
  })

  it('refuses an empty instruction rather than guessing', async () => {
    blank(); const ids = await desks(2)
    expect((await run('arrange', { items: ids })).error).toMatch(/say what to do/)
    expect((await run('arrange', { items: ['only_one'] })).error).toMatch(/at least 2/)
    expect((await run('arrange', { items: ids, facing: 'nope' })).error).toMatch(/unknown id/)
  })
})

// Numbers designers actually work to, which the geometry rules had no opinion about.
describe('designer measurements', () => {
  const R: Room = { w: 600, h: 500, doors: [{ id: 'door', wall: 'S', pos: 250, width: 90 }], windows: [], outlets: [{ x: 0, y: 200 }] }
  const only = (items: Item[], rule: string) => check(R, items, 'general').filter(v => v.rule === rule)

  it('flags seats that face each other from too far to talk', () => {
    // 3.5-10ft is the band; these two are 4m apart
    const far = [it_('a', 'armchair', 20, 200, 270), it_('b', 'armchair', 460, 200, 90)]
    expect(only(far, 'conversation')[0].msg).toMatch(/too far to talk/)
    const ok = [it_('a', 'armchair', 200, 200, 270), it_('b', 'armchair', 400, 200, 90)]
    expect(only(ok, 'conversation')).toHaveLength(0)
    const knees = [it_('a', 'armchair', 250, 200, 270), it_('b', 'armchair', 340, 200, 90)]
    expect(only(knees, 'conversation')[0].msg).toMatch(/knee to knee/)
  })

  it('ignores seats that are not addressing each other', () => {
    const sideBySide = [it_('a', 'armchair', 200, 200), it_('b', 'armchair', 400, 200)]  // both face south
    expect(only(sideBySide, 'conversation')).toHaveLength(0)
  })

  it('flags walking in behind the sofa', () => {
    const back = [it_('s', 'sofa', 190, 330, 180)]   // south door, sofa facing north = its back to you
    expect(only(back, 'entry_view')[0].msg).toMatch(/meet the back of/)
    expect(only([it_('s', 'sofa', 190, 330, 0)], 'entry_view')).toHaveLength(0)
  })

  it('keeps a coffee table between half and two-thirds of its sofa', () => {
    const sofa = it_('sofa', 'sofa', 100, 100)                       // 210 long
    expect(only([sofa, { ...it_('t', 'coffee_table', 100, 250), w: 110 }], 'proportion')).toHaveLength(0)
    expect(only([sofa, { ...it_('t', 'coffee_table', 100, 250), w: 60 }], 'proportion')[0].msg).toMatch(/afterthought/)
    expect(only([sofa, { ...it_('t', 'coffee_table', 100, 250), w: 200 }], 'proportion')[0].msg).toMatch(/swamps/)
  })
})

// An agent got stuck on a five-desk study room and reported three dead ends. It was right about all
// three, and a rule you cannot satisfy is a bug, not a challenge.
describe('the room the agent got stuck in', () => {
  const run = (n: string, a: any) => TOOLS.find(t => t.name === n)!.run(a) as any
  const R: Room = { w: 600, h: 500, doors: [{ id: 'door', wall: 'S', pos: 250, width: 90 }],
    windows: [{ id: 'east window', wall: 'E', pos: 100, width: 150 }], outlets: [{ x: 0, y: 200 }] }

  const room = async () => {
    set({ presetId: 'custom', room: { ...R }, items: [], profile: 'office', brief: null, hour: 9,
      notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {} })
    const desks: string[] = [], chairs: string[] = []
    for (let k = 0; k < 5; k++) desks.push((await run('add_item', { type: 'desk', x: 40 + (k % 3) * 180, y: 60 + Math.floor(k / 3) * 200 })).item.id)
    for (let k = 0; k < 5; k++) chairs.push((await run('add_item', { type: 'chair', x: 40, y: 400 })).item.id)
    return { desks, chairs }
  }

  it('five chairs docked to five desks read as five pairs, not five adrift from desk_1', async () => {
    const { desks, chairs } = await room()
    for (let k = 0; k < 5; k++) await run('dock_item', { id: chairs[k], to: desks[k] })
    expect(check(state.room, state.items, 'office').filter(v => v.rule === 'pairing')).toHaveLength(0)
  })

  it('dock_item picks the nearest free desk when not told which', async () => {
    const { chairs } = await room()
    for (const c of chairs) await run('dock_item', { id: c })
    // a chair with no pairing complaint has been docked to some desk; which one is checked below
    const hosts = new Set(chairs.filter(c => !check(state.room, state.items, 'office').some(v => v.rule === 'pairing' && v.items.includes(c))))
    expect(check(state.room, state.items, 'office').filter(v => v.rule === 'pairing').length).toBeLessThan(5)   // measured 4
    expect(hosts.size).toBeGreaterThan(0)
  })

  it('glare can actually be fixed — there is a blind and a way to hang it', async () => {
    await room()
    set({ hour: 9 })
    const before = check(state.room, state.items, 'office', undefined, 9).filter(v => v.rule === 'glare')
    expect(before.length, 'the east window should glare at 9:00').toBeGreaterThan(0)
    expect(before[0].fix).toMatch(/blind over the east window/)
    const blind = (await run('add_item', { type: 'blind', x: 0, y: 0 })).item.id
    await run('dock_item', { id: blind, to: 'east window' })
    expect(check(state.room, state.items, 'office', undefined, 9).filter(v => v.rule === 'glare')).toHaveLength(0)
  })

  it('the greedy baseline does not stack every chair on one desk', async () => {
    const { desks } = await room()
    await run('baseline', {})
    const chairs = state.items.filter(i => i.type === 'chair')
    const nearest = chairs.map(c => desks
      .map(d => ({ d, gap: Math.hypot(getItem(d)!.x - c.x, getItem(d)!.y - c.y) }))
      .sort((a, b) => a.gap - b.gap)[0].d)
    expect(new Set(nearest).size, 'every chair ended up at the same desk').toBeGreaterThan(2)
  })
})

// Saved rooms live in this browser and nowhere else, and the human owns the delete key.
describe('saving locally', () => {
  const mem = new Map<string, string>()
  Object.assign(globalThis, { localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
  } })
  const scene = (n: number) => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: { ...p.room }, items: p.items.slice(0, n).map(i => ({ ...i })), profile: p.profile, hour: 9,
      brief: { people: 2, activity: 'watch' }, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {} }) }

  it('saves, lists, reopens and deletes', () => {
    mem.clear()
    scene(3); expect(saveRoom('Blue room')).toBe('ok')
    scene(6); expect(saveRoom('Green room')).toBe('ok')
    expect(listSaves().map(v => v.name)).toEqual(['Green room', 'Blue room'])

    scene(1)                                   // wander off
    expect(loadSave('Blue room')).toBe(true)
    expect(state.items).toHaveLength(3)
    expect(state.brief).toEqual({ people: 2, activity: 'watch' })

    deleteSave('Blue room')
    expect(listSaves().map(v => v.name)).toEqual(['Green room'])
    expect(loadSave('Blue room')).toBe(false)  // gone means gone
  })

  it('overwrites a name instead of piling up duplicates', () => {
    mem.clear()
    scene(3); saveRoom('Same')
    scene(6); saveRoom('Same')
    expect(listSaves()).toHaveLength(1)
    loadSave('Same'); expect(state.items).toHaveLength(6)
  })

  it('stops at twelve rather than filling the browser', () => {
    mem.clear(); scene(3)
    for (let k = 0; k < 12; k++) expect(saveRoom(`room ${k}`)).toBe('ok')
    expect(saveRoom('one too many')).toBe('full')
    expect(listSaves()).toHaveLength(12)
  })

  it('survives junk in storage rather than white-screening', () => {
    mem.clear(); mem.set('room.saves', '{ not json')
    expect(listSaves()).toEqual([])
    mem.set('room.saves', JSON.stringify([{ name: 'ok', room: null }, 'nonsense', null]))
    expect(listSaves()).toEqual([])
    expect(restore(null)).toBe(false)
    expect(restore({ room: undefined, items: [] } as any)).toBe(false)
  })

  // Loading a save left the old URL in place, so a reload took you back to whatever had been open
  // BEFORE — a scene when you had just restored a home, or a home when you had restored a scene.
  describe('and the address bar keeps up', () => {
    const at = (href: string) => {
      let here = new URL(href)
      Object.defineProperty(globalThis, 'location', { value: here, configurable: true })
      Object.defineProperty(globalThis, 'history', { configurable: true, value: {
        replaceState: (_s: unknown, _t: string, next: string) => {
          here = new URL(next, here.origin)
          Object.defineProperty(globalThis, 'location', { value: here, configurable: true })
        } } })
      return () => globalThis.location.search
    }
    // the stub the transcript tests installed has to go back, or every later test that writes to the
    // URL starts throwing
    const g = globalThis as never as Record<string, unknown>
    const was = { location: g.location, history: g.history }
    const clear = () => { Object.defineProperty(globalThis, 'location', { value: was.location, configurable: true }); g.history = was.history }

    it('says home when you restore a home, and scene when you restore a scene', () => {
      mem.clear()
      const search = at('https://room.test/?preset=dad-visits')
      try {
        restore({ room: { w: 400, h: 300, doors: [], windows: [], outlets: [] }, items: [], presetId: 'flat', flat: buildFlat(2, 4) })
        expect(search()).toBe('?home=2b4p')
        restore({ room: { w: 400, h: 300, doors: [], windows: [], outlets: [] }, items: [], presetId: 'dad-visits' })
        expect(search()).toBe('?preset=dad-visits')
      } finally { clear() }
    })

    it('offers no address at all for a room nobody can rebuild from one', () => {
      mem.clear()
      const search = at('https://room.test/?home=2b4p')
      try {
        restore({ room: { w: 400, h: 300, doors: [], windows: [], outlets: [] }, items: [], presetId: 'custom' })
        expect(search()).toBe('')   // a misleading address is worse than none
      } finally { clear() }
    })
  })

  it('remembers and forgets the last session', () => {
    mem.clear(); scene(4)
    rememberSession()
    expect(lastSession()!.items).toHaveLength(4)
    forgetSession()
    expect(lastSession()).toBe(null)
  })
})

// A plan is an argument about a room. Sitting in it is the room. Only the page can do this, so the
// agent gets to ask for it.
describe('eye level', () => {
  const run = (n: string, a: any) => TOOLS.find(t => t.name === n)!.run(a) as any
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: { ...p.room }, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9, eye: null, view: '2d',
      brief: null, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {} }) }

  it('sits in a seat, at seated height, and switches to 3D', async () => {
    scene()
    const r = await run('show', { eye: 'chair_a' })
    expect(r.eye).toMatchObject({ sitting_in: 'chair_a', height_cm: 120 })
    expect(state.eye).toMatchObject({ id: 'chair_a', cm: 120 })
    expect(state.view).toBe('3d')
  })

  it('takes a height when told one, and stands back up', async () => {
    scene()
    await run('show', { eye: 'chair_a', eye_height: 115 })   // wheelchair
    expect(state.eye!.cm).toBe(115)
    await run('show', { eye: 'off' })
    expect(state.eye).toBe(null)
  })

  it('refuses a seat that does not exist, and ignores a silly height', async () => {
    scene()
    expect((await run('show', { eye: 'nobody' })).eye).toEqual({ error: 'unknown id' })
    expect(state.eye).toBe(null)
    await run('show', { eye: 'sofa', eye_height: 9999 })
    expect(state.eye!.cm).toBe(120)                          // falls back rather than putting you in the ceiling
  })
})

// "Mixing measurement units produces silent errors" is the most common way a plan is quietly wrong.
describe('units', () => {
  const run = (n: string, a: any) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('takes a room in feet without anybody converting in their head', async () => {
    set({ presetId: 'custom', items: [], notes: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {} })
    await run('set_room', { w: 12, h: 14, units: 'ft' })
    expect(state.room.w).toBe(370)      // 12ft = 365.76, snapped to the 10cm grid
    expect(state.room.h).toBe(430)
  })

  it('takes metres and inches too, and refuses a unit it does not know', async () => {
    set({ presetId: 'custom', items: [] })
    await run('set_room', { w: 4.2, h: 3.6, units: 'm' })
    expect([state.room.w, state.room.h]).toEqual([420, 360])
    expect((await run('set_room', { w: 100, h: 100, units: 'cubits' })).error).toMatch(/units must be/)
  })

  it('says every distance in both, so nobody has to convert', () => {
    expect(imperial(214)).toBe("7'")
    expect(imperial(45)).toBe('18"')
    expect(imperial(0)).toBe('0"')
  })

  it('warns that catalogue sizes are not the human\'s furniture', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: { ...p.room }, items: p.items.map(i => ({ ...i })), profile: p.profile })
    resetSent()
    const r = await run('get_room', {})
    expect(r.catalog_note).toMatch(/NOT the human's furniture/)
    expect(r.room.also_in_feet).toMatch(/^\d+'( \d+")? × \d+'( \d+")?$/)
  })
})

// Chrome publishes budgets for what an agent can actually read without drowning:
// 30 chars per name, 500 per description, 150 per parameter description, 1.5K per tool output.
// https://developer.chrome.com/docs/ai/webmcp/secure-tools
describe('tools fit the budget agents actually read', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('every name, description and parameter is inside Chrome\'s budget', () => {
    for (const t of TOOLS) {
      expect(t.name.length, t.name).toBeLessThanOrEqual(30)
      expect(t.description.length, `${t.name} description`).toBeLessThanOrEqual(500)
      const props = (t.inputSchema as any).properties ?? {}
      for (const [k, v] of Object.entries<any>(props)) {
        expect(k.length, `${t.name}.${k}`).toBeLessThanOrEqual(30)
        expect((v?.description ?? '').length, `${t.name}.${k} description`).toBeLessThanOrEqual(150)
      }
    }
  })

  // Chrome also suggests ~1.5K per tool output. A real room's contents legitimately exceed that, and
  // truncating them would only make the agent guess — the thing this page exists to stop. What must
  // not grow is the fixed overhead wrapped around the data: prose, glossaries, catalogue, rule list.
  // So the guard is that a repeat call carries none of it.
  it('a repeat call costs less than the first, because the reference is not resent', async () => {
    resetSent()
    for (const n of ['get_room', 'sense_room'] as const) {
      const first = JSON.stringify(await run(n)).length
      const repeat = JSON.stringify(await run(n)).length
      expect(repeat, `${n} repeat`).toBeLessThan(first)
    }
  })

  it('the static reference is taught once, not on every call', async () => {
    resetSent()
    expect((await run('get_room')).catalog).toBeTruthy()
    expect((await run('get_room')).catalog).toBeUndefined()
    expect((await run('sense_room')).fixture_guide).toBeTruthy()
    expect((await run('sense_room')).fixture_guide).toBeUndefined()
  })
})

describe('the agent can reach everything a human can', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('saves, lists, reopens and deletes a room on this device', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: { ...p.room }, items: p.items.map(i => ({ ...i })), profile: p.profile })
    expect((await run('saves', { action: 'save', name: 'option A' })).saved).toBe('option A')
    expect((await run('saves', { action: 'list' })).saves.map((v: any) => v.name)).toContain('option A')

    await run('remove_item', { id: 'plant', keep: true })          // change the room
    const reopening = run('saves', { action: 'load', name: 'option A' })
    await new Promise(r => setTimeout(r, 0))
    expect(state.notes.at(-1)!.text, 'reopened over their room without asking').toMatch(/goes, and cannot be undone/)
    settle(state.notes.at(-1)!.id, '✓')
    const back = await reopening
    expect(back.items.some((i: any) => i.id === 'plant')).toBe(true) // the save brought it back

    expect((await run('saves', { action: 'delete', name: 'option A' })).deleted).toBe('option A')
    expect((await run('saves', { action: 'list' })).saves.map((v: any) => v.name)).not.toContain('option A')
  })

  it('names the save it could not make rather than failing silently', async () => {
    expect((await run('saves', { action: 'save' })).error).toMatch(/give a name/)
    expect((await run('saves', { action: 'load', name: 'nope' })).error).toMatch(/no save called/)
  })

  it('can fold the panel away, the last control that was human-only', async () => {
    expect((await run('show', { panel: 'hide' })).panel).toMatch(/whole screen/)
    expect(state.panelHidden).toBe(true)
    await run('show', { panel: 'show' })
    expect(state.panelHidden).toBe(false)
  })
})

// The scripted sessions are the only thing a judge without a WebMCP agent ever sees run. A step that
// names a tool that does not exist, or an id that is not in that scene, would be worse than no demo.
describe('every scripted session is a real session', () => {
  it('every scene has one', () => {
    expect(PRESETS.filter(p => !p.demo?.length).map(p => p.id)).toEqual([])
  })

  for (const p of PRESETS) {
    it(`${p.id} runs end to end`, async () => {
      set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
        hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, brief: null, eye: null })
      let last = ''
      for (const [name, args, note] of p.demo!) {
        const tool = TOOLS.find(t => t.name === name)
        expect(tool, `${p.id}: no tool called ${name}`).toBeTruthy()
        expect(note.length, `${p.id}/${name}: needs a caption`).toBeGreaterThan(10)
        const filled = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v === '$last' ? last : v]))
        const out: any = await tool!.run(filled)
        expect(out?.error, `${p.id}/${name} errored: ${out?.error}`).toBeUndefined()
        expect(state.notes.some(n => n.options?.includes('✓ allow') && !n.answered),
          `${p.id}/${name} stopped to ask the human — a scripted session has nobody to answer`).toBe(false)
        if (out?.item?.id) last = out.item.id
      }
    })
  }
})

describe('the transcript never hides the units', () => {
  const run = (n: string, a: any) => TOOLS.find(t => t.name === n)!.run(a) as any
  it('a room given in feet is narrated in feet AND centimetres', async () => {
    set({ items: [] })            // a room with furniture in it stops to ask the human first
    const a = { w: 14, h: 12, units: 'ft', doors: [{ wall: 'S', pos: 150, width: 90 }] }
    const line = plain('set_room', a, await run('set_room', a))
    expect(line).toMatch(/14×12ft/)
    expect(line).toMatch(/\d+×\d+cm/)     // and what the page actually built, so nobody is guessing
  })
})

// The title of this project is "a web page that argues back". Reporting a broken layout after
// making it is not arguing back — it is complying and complaining. These pin the actual refusal.
describe('the page refuses a move that breaks a hard rule', () => {
  const run = (n: string, a: any) => TOOLS.find(t => t.name === n)!.run(a) as any
  const load = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, brief: null }) }

  it('will not put the sofa across the only door, and the room is unchanged', async () => {
    load()
    const was = getItem('sofa')!, at = { x: was.x, y: was.y }
    const r = await run('move_items', { id: 'sofa', x: 0, y: 40, rot: 90 })
    expect(r.refused).toBe(true)
    expect(r.moved).toBe(0)
    expect(r.because.join(' ')).toMatch(/door|overlaps/)
    expect({ x: getItem('sofa')!.x, y: getItem('sofa')!.y }).toEqual(at)   // put back, not left broken
  })

  it('offers somewhere that does work instead of just saying no', async () => {
    load()
    const r = await run('move_items', { id: 'sofa', x: 0, y: 40, rot: 90 })
    expect(Array.isArray(r.instead) && r.instead.length).toBeTruthy()
  })

  it('the human still gets the last word, through force', async () => {
    load()
    const r = await run('move_items', { id: 'sofa', x: 0, y: 40, rot: 90, force: true })
    expect(r.refused).toBeUndefined()
    expect(r.moved).toBe(1)
    expect(r.moved_ok).toBe(false)          // done, and still honest that it is wrong
  })

  it('a room that is already broken can still be worked on', async () => {
    load()
    await run('move_items', { id: 'sofa', x: 0, y: 40, rot: 90, force: true })   // break it
    const spot = (await run('find_space', { id: 'plant', ignore: ['plant'] })).candidates[0]
    const r = await run('move_items', { id: 'plant', x: spot.x, y: spot.y })     // an unrelated legal move
    expect(r.refused).toBeUndefined()
    expect(r.moved).toBe(1)
  })
})

// The printable plan is the one artefact that leaves the browser and gets handed to another person,
// so what it says has to be right without the app around it to explain.
describe('the printable plan stands on its own', () => {
  const load = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
      profile: p.profile, hour: 9, brief: null, notes: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null }) }

  it('carries both unit systems, every piece, and the problems still open', () => {
    load()
    const v = check(state.room, state.items, state.profile, undefined, state.hour, state.brief)
    const html = planSheet('Living room — option A', v)
    expect(html).toContain('Living room — option A')
    expect(html).toMatch(/420cm \/ 13' 9"/)                       // metric AND imperial, side by side
    for (const it of state.items) expect(html, `${it.id} missing from the schedule`).toContain(it.id)
    expect(html).toMatch(/viewBox="-70 -70 560 500"/)             // drawn to the room, not to a page
    expect(html).toMatch(/Catalogue sizes are typical, not measured/)   // the honesty travels with it
  })

  /** where a ref is written on the drawing, and how wide its text is */
  const labels = (html: string) => {
    const drawing = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'))
    return [...drawing.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" font-size="([\d.]+)"(?: text-anchor="(\w+)")?[^>]*>([\w]+)</g)]
      .map(m => ({ x: +m[1], y: +m[2], fs: +m[3], anchor: m[4] ?? 'middle', id: m[5] }))
  }

  it('gives every row of the schedule a ref you can find on the drawing', () => {
    load()
    const html = planSheet('x', [])
    const drawn = labels(html)
    // a schedule naming something the drawing does not is a reader sent looking for nothing. The
    // ceiling light was in the schedule and nowhere on the plan.
    for (const it of state.items.filter(i => !i.parked)) {
      expect(html, `${it.id} missing from the schedule`).toContain(`<td>${it.id}</td>`)
      expect(drawn.filter(l => l.id === it.id).length, `${it.id} on the drawing`).toBe(1)
    }
    expect(html).toMatch(/stroke-dasharray="9 7"/)   // overhead, drawn the way a plan draws overhead
  })

  it('does not write two labels over the same spot', () => {
    load()
    // the ceiling light sits directly on the coffee table in this scene, and both names landed there
    const [ceil, table] = ['ceil', 'table'].map(id => labels(planSheet('x', [])).find(l => l.id === id)!)
    expect(Math.hypot(ceil.x - table.x, ceil.y - table.y)).toBeGreaterThan(20)
  })

  it('keeps a label on a piece against the wall inside the room', () => {
    load()
    // the bookshelf is 28cm wide and hard against the east wall, so its name ran out over the wall
    for (const l of labels(planSheet('x', []))) {
      const half = l.id.length * l.fs * 0.29
      const left = l.anchor === 'middle' ? l.x - half : l.anchor === 'end' ? l.x - half * 2 : l.x
      expect(left, `${l.id} starts outside the room`).toBeGreaterThanOrEqual(0)
      expect(left + half * 2, `${l.id} runs past the far wall`).toBeLessThanOrEqual(state.room.w)
    }
  })

  it('says so plainly when nothing is wrong', () => {
    load()
    expect(planSheet('Clean', [])).toContain('every rule in force passes')
  })

  it('escapes anything the agent titled it, because this is a document', () => {
    load()
    expect(planSheet('<script>alert(1)</script>', [])).not.toContain('<script>alert(1)</script>')
  })
})

// "A planner is a long conversation, and anything resent every turn is paid for every turn." The
// catalogue, the rule list and the fixture guide do not change, so they are taught once. Nothing
// measured whether they actually stop arriving.
// Asked to cover the south window, it covered the north one and said so in a field nobody reads. The
// room changed, and the agent had every reason to think it had done what it asked.
// The README offers `facing: 'window'` as ITS example of natural language over ids, and it did
// nothing: no item is called 'window', so the constraint was dropped and you got the same answer as
// asking for nothing at all.
// The page quoted two different minimums for the same strip of floor beside a bed — 75cm in
// bedside_check, 60cm (90 accessible) in the bed_clearance rule — without saying they answer
// different questions. A judge comparing them sees the page contradicting itself.
// The brief told the agent to leave 90cm beside a bed in a bedroom the rules judge at 60 — a third
// number for the same strip of floor, and the one an agent would actually design to.
// The advice said "leave at least 20cm" while the check fired below 15, so a layout could satisfy
// the rule and still be told to fix itself — and an agent following the advice was designing to a
// number the page did not use.
// The rule fires outside 45-72% but the advice quotes 50-66%. Both are deliberate — one is the
// tolerance, one is the aim — and saying so is the difference between a margin and a discrepancy.
// "It ships its own arranger for the agent to beat." A baseline that leaves the room worse than it
// found it is not a bar, it is an embarrassment — and every scene invites the agent to run it.
// Shrinking the room pushed the sofa and the rug off the floor and answered "kept: 9" — true of the
// item list, and not what the agent asked about.
// remove_item, preset and set_room all ask before throwing work away. define_flat throws away more
// than any of them — the room on screen and every room of any home already built — and asked nothing.
// Reopening a save replaces the room AND clears the undo history with it, so what was on screen is
// gone for good — the one destructive path that was still silent.
// Nobody answering is not the same as somebody saying no. Both stopped the action, and the agent was
// told the same thing about both — so it would report to the human a decision they never made.
// Every tool that asks can also be refused, and the transcript line for that path was never driven.
// define_flat's said "laid out a undefined — undefined rooms" at the human.
// say({}) drew an empty bubble and the transcript read: said: \u201cundefined\u201d. The junk sweep
// proved the line did not THROW; it never looked at what the line said.
// The human drags a chair while the agent is thinking. Every tool result carries what they did since
// the last call, so the agent is never planning against a room that moved under it. Nothing tested it.
// Clients pass arguments in whatever shape they like: an object, a JSON string, or a bare value for a
// tool with one parameter. Nothing tested the layer that sorts that out, and it dropped one case.
// The README promises isError on failed results per the MCP convention, and that every failure ALSO
// carries a plain {error} because Chrome 152 flattens the result and loses the flag. Neither was
// tested, and a tool that throws had no test at all.
// A tool that rearranges somebody's room owes them one of two things: a way back, or a question
// first. Nothing checked which tools offered which — I found the ones that offered neither by hand.
// readOnlyHint is not a comment. A client may skip its confirmation prompt on the strength of it, so
// a read-only tool that moves something is a lie told where it costs the most.
// destructiveHint tells a client "this is not an additive update" — it is how a well-behaved one
// decides to prompt. preset replaced an entire room and layouts replaced every item in it, and
// neither said so.
// untrustedContentHint means "what comes back may not be content this site authored". brief.who is a
// word the HUMAN typed for the people who use the room — "kids", "my dad" — and it rides along in
// snapshot(), which six tools hand back. One of the six said so.
// The eight lent tools run on this page at another origin's request. Read-only is necessary and not
// sufficient: a tool that only reads the room and then opens a window, writes to this device, or
// hands back a link is still something a stranger should not be able to make happen.
// A planner is a long conversation and every result is paid for in every later turn. A tool whose
// answer grows without limit with the size of the room is a context leak nobody sees until the
// twentieth call.
// A planner is a long conversation and every result is paid for in every later turn. The risk is not
// that a big room answers with a lot — it is an answer that grows FASTER than the room does, which
// nobody notices until the twentieth call.
// The plan turns its walls green on it and a banner says it in words, from two different files. They
// agreed by coincidence, and a room saying two things about itself is the confusion this project
// exists to prevent.
// Eleven places asked "am I looking at the whole home or standing in one of its rooms?" by spelling
// it out, and the answer decides what the entire screen is.
// Whether an id earns its place on a label is decided in the plan and again in the 3D view. They had
// drifted once already — the plan learned that "sofa · sofa" says nothing and the 3D view did not.
// uid() counts every object the page has ever made, so the first wardrobe added to a room could come
// out as wardrobe_7 — a number meaning nothing, printed on a plan somebody hands a joiner.
// "added a bed double" — the type with its underscore swapped for a space, in front of the human.
// "3 of 5 destinations have no room to turn — sofa, armchair, bookshelf". With two armchairs in the
// room that reads as "armchair, armchair", and the human cannot tell which one to move.
// Seven pieces heaped in a corner produced eight near-identical lines, one per PAIR, which filled
// the panel and pushed every other rule out of the twelve an agent is shown.
// One blocked doorway strands everything behind it, and the room said so once per stranded piece —
// four identical sentences straight after the line explaining why.
// "TV unit is 186cm from the nearest outlet" is a fact, not a problem — a reader has to already know
// the limit to see why it is on the list. Every other message here states the limit and the
// consequence; this one kept both in the fix, where the panel does not show them.
// Read as a set, every message on the list ends in what goes wrong — "chairs cannot pull out", "it
// can topple", "you would work in your own shadow". Two did not: one recited the sun's bearing, the
// other quoted a range after a semicolon.
// The other half of every problem. Read as a set they should all be instructions a person or an
// agent can act on — "add a desk" when three are needed is neither.
// The brief is what an agent designs to, so anything it asks for has to be something the rules will
// actually check — and two activities judged by the same rule have to ask for the same thing.
// Read as a set, an error either names the value it rejected and what it wanted, or it leaves the
// agent to guess. "unknown type" and "bad profile" left it guessing.
// The submission says nothing on this page arranges itself for the human — if the agent is not
// working, nothing moves. Two development buttons do exactly that, and they are gated on ?dev.
// "move the clutter it names first (or accept the caveat)" — nothing named anything, and the caveat
// referred to itself. It is read by somebody who cannot see the candidates it was pointing at.
// Capturing the pointer keeps a drag alive past the edge of the shape. Selecting the piece is not
// optional, and it happened after the capture on the same line in both views — so a browser that
// refused the capture left the plan unselectable rather than merely harder to drag on.
describe('selecting a piece does not depend on the browser granting a capture', () => {
  for (const [file, src] of [['Plan.tsx', planSource], ['Scene3D.tsx', sceneSource]] as const)
    it(`${file} guards its capture`, () => {
      const at = src.indexOf('setPointerCapture')
      expect(at, `${file} no longer captures the pointer`).toBeGreaterThan(0)
      expect(src.slice(Math.max(0, at - 120), at), `${file} captures without a guard`).toMatch(/try \{/)
    })
})

describe('the caveat names what is in the way', () => {
  it('says which pieces the spot would squeeze past', () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, brief: null, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    const r = findSpace(220, 95, 'sofa')
    expect(r.caveat, 'no spot narrows a walkway here, so this proves nothing').toBeTruthy()
    expect(r.caveat, 'still points at something it never names').not.toMatch(/it names/)
    expect(r.caveat, 'still defines the caveat as the caveat').not.toMatch(/accept the caveat/)
    expect(r.caveat).toMatch(/narrows the way to \w+|no way through/)
    // and names them the way the rest of the page does, not by id
    for (const named of ['tv unit', 'armchair', 'bookshelf'])
      expect(r.caveat, `named a piece by id instead of calling it a ${named}`).toContain(named)
  })
})

describe('nothing arranges itself unless a developer asked for it', () => {
  it('every button that acts for the human is behind ?dev', () => {
    const acts = [...panelSource.matchAll(/<button[^>]*onClick=\{\(\) => \{? ?(autoLayout|fixOne)\(/g)]
    expect(acts.length, 'the automation buttons have gone, or been renamed').toBeGreaterThan(0)
    for (const m of acts) {
      const before = panelSource.slice(Math.max(0, m.index! - 200), m.index!)
      expect(before, `an automation button that is not behind DEV: ${m[1]}`).toMatch(/DEV &&/)
    }
  })

  it('and the flag is off unless the URL says so', () => {
    expect(panelSource).toMatch(/const DEV = new URLSearchParams\(location\.search\)\.has\('dev'\)/)
  })
})

describe('an error names what it rejected', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('says what it got and what it wanted', async () => {
    set({ presetId: 'blank', room: { w: 600, h: 500, doors: [], windows: [], outlets: [] }, items: [],
      profile: 'general', notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    const t = await run('add_item', { type: 'hovercraft' })
    expect(t.error, 'never said what it was given').toContain('hovercraft')
    const g = await run('set_profile', { profile: 'vibes' })
    expect(g.error).toContain('vibes')
    expect(g.expected, 'rejected a goal without naming the goals').toContain('accessibility')
    const p = await run('preset', { id: 'nowhere' })
    expect(p.error).toContain('nowhere')
    expect(p.scenes, 'rejected a scene without listing the scenes').toContain('dad-visits')
  })

  it('and survives being given nothing at all', async () => {
    for (const [n, a] of [['add_item', {}], ['set_profile', {}], ['preset', { id: 123 }]] as const) {
      const r = await run(n, a)
      expect(String(r.error ?? ''), `${n} printed undefined at the agent`).not.toMatch(/undefined/)
    }
  })
})

describe('what the brief asks for is what the room is judged on', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const asks = async (activity: string, profile: 'general' | 'accessibility' | 'office' = 'general') => {
    set({ presetId: 'blank', room: { w: 700, h: 500, doors: [], windows: [], outlets: [] }, items: [], profile,
      hour: 9, brief: null, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    return ((await run('brief', { people: 3, activity })).requires as string[]).join(' | ')
  }

  it('study and work are judged the same, so they ask the same', async () => {
    for (const a of ['study', 'work'])
      expect(await asks(a), `${a} never mentions the run of desks the rules will flag`).toContain(`${TOUCHING}cm apart`)
  })

  it('the pull-out it asks for is the one in force', async () => {
    expect(await asks('dine')).toContain(`${pullOut('general')}cm behind each chair`)
    expect(await asks('dine', 'accessibility')).toContain(`${pullOut('accessibility')}cm behind each chair`)
  })

  it('and every number it quotes comes from a rule', async () => {
    const all = (await Promise.all(['study', 'work', 'dine', 'watch', 'talk', 'sleep'].map(a => asks(a)))).join(' | ')
    const known = new Set([TOUCHING, REACH, pullOut('general'), bedSide('general'), 3].map(String))
    for (const n of all.match(/\d+/g) ?? [])
      expect(known.has(n), `the brief quotes ${n}cm and no rule uses it`).toBe(true)
  })
})

describe('every fix tells you what to do', () => {
  it('across every scene, goal and hour', () => {
    const seen = new Map<string, string>()
    for (const p of PRESETS) for (const pr of ['general', 'theater', 'office', 'bedroom', 'accessibility'] as const)
      for (const h of [9, 21])
        for (const v of check(p.room, p.items, pr, undefined, h, { people: 3, activity: 'work' }))
          if (!seen.has(v.rule)) seen.set(v.rule, String(v.fix ?? ''))
    expect(seen.size, 'the sweep is too narrow to mean anything').toBeGreaterThan(16)
    for (const [rule, fix] of seen) {
      expect(fix.length, `${rule} has no fix`).toBeGreaterThan(8)
      // an instruction starts with a verb, not with the reason it is being given
      expect(fix, `${rule}'s fix opens with an explanation: ${fix}`)
        .toMatch(/^(add|move|open|put|leave|bring|clear|dock|turn|slide|swing|shift|pull|find_space|dock_item|make|drop|they need)/)
    }
  })

  it('and says how many, when the number is the point', () => {
    const room2: Room = { w: 700, h: 500, doors: [{ id: 'd', wall: 'S', pos: 300, width: 90 }], windows: [], outlets: [{ x: 0, y: 250 }] }
    const v = check(room2, [], 'office', undefined, 9, { people: 3, activity: 'work' }).find(x => x.rule === 'per_person')!
    expect(v.msg).toContain('3 people need 3 places')
    expect(v.fix, 'told them to add one desk for three people').toContain('add 3 desks')
  })
})

describe('every problem says what goes wrong', () => {
  it('across every scene, goal and hour', () => {
    const seen = new Map<string, string>()
    for (const p of PRESETS) for (const pr of ['general', 'theater', 'office', 'bedroom', 'accessibility'] as const)
      for (const h of [9, 21])
        for (const v of check(p.room, p.items, pr, undefined, h, { people: 3, activity: 'work' }))
          if (!seen.has(v.rule)) seen.set(v.rule, v.msg)
    expect(seen.size, 'the sweep is too narrow to mean anything').toBeGreaterThan(16)
    // a bare measurement is a fact; a problem says what it costs. Every message either explains
    // itself after a dash, or is a plain statement of something being blocked or missing.
    const bare = [...seen.entries()].filter(([, m]) =>
      !/—/.test(m) && !/\b(blocks|cannot|can't|floats|needs|offers|covers|only has|sits under|has its back|are on top of|nothing in this room)\b/.test(m))
    expect(bare.map(([r, m]) => `${r}: ${m}`), 'reads as a measurement, not a problem').toEqual([])
  })
})

describe('a distance on the list says why it is a problem', () => {
  it('names the reach, in the message', () => {
    const p = PRESETS.find(x => x.id === 'open-plan')!
    const v = check(p.room, p.items, p.profile).find(x => x.rule === 'outlet')!
    expect(v.msg).toMatch(new RegExp(`further than the ${REACH}cm a flex reaches`))
    expect(v.fix).toMatch(/add one with set_room/)
  })

  it('and the brief asks for the same number', async () => {
    set({ presetId: 'blank', room: { w: 600, h: 500, doors: [], windows: [], outlets: [] }, items: [],
      profile: 'office', hour: 9, brief: null, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    const r = await (TOOLS.find(t => t.name === 'brief')!.run({ people: 2, activity: 'work' }) as any)
    expect((r.requires as string[]).join(' ')).toContain(`within ${REACH}cm of each desk`)
  })
})

describe('a blocked doorway is one problem, not one per stranded piece', () => {
  const scene = () => { const p = PRESETS.find(x => x.id === 'studio-tight')!
    return check(p.room, p.items, p.profile).filter(v => v.rule === 'walkway') }

  it('says it once, and names everything cut off', () => {
    const v = scene()
    expect(v, 'one line per stranded piece again').toHaveLength(1)
    expect(v[0].items.length, 'named only one of them').toBeGreaterThan(2)
    expect(v[0].msg).toMatch(/reached with a 60cm-wide path from the door/)
    expect(v[0].fix, 'told them to open a corridor to each in turn').toMatch(/move whatever is standing in it/)
  })

  it('and says so plainly when it is the whole room', () => {
    expect(scene()[0].msg).toMatch(/^nothing in this room can be reached/)
  })

  it('one stranded piece still reads as one piece', () => {
    const room3: Room = { w: 700, h: 500, doors: [{ id: 'd', wall: 'S', pos: 300, width: 90 }], windows: [], outlets: [] }
    const v = check(room3, [
      it_('bed', 'bed_single', 0, 0),                                        // sealed into the corner
      it_('w1', 'wardrobe', 90, 0, 90), it_('w2', 'wardrobe', 90, 120, 90),  // a wall down its side
      it_('w3', 'wardrobe', 0, 200),                                         // and one across the foot
      it_('sofa', 'sofa', 400, 350),                                         // out in the open
    ], 'general').filter(x => x.rule === 'walkway')
    expect(v, 'nothing was stranded, so this proves nothing').toHaveLength(1)
    expect(v[0].items, 'grouped a lone stranded piece as though it were several').toEqual(['bed'])
    expect(v[0].msg).toMatch(/^Single bed \(bed\) can't be reached/)
    expect(v[0].fix).toBe('open a 60cm corridor to it')
  })
})

describe('a heap of furniture is one problem, not one per pair', () => {
  const room2: Room = { w: 600, h: 500, doors: [{ id: 'd', wall: 'S', pos: 250, width: 90 }], windows: [], outlets: [{ x: 0, y: 250 }] }
  const overlaps = (items: Item[]) => check(room2, items, 'general').filter(v => v.rule === 'overlap')

  it('two pieces still read as two pieces', () => {
    const v = overlaps([it_('sofa', 'sofa', 100, 100), it_('plant', 'plant', 150, 120)])
    expect(v).toHaveLength(1)
    expect(v[0].msg).toBe('Sofa overlaps Plant')
    expect(v[0].items).toEqual(['sofa', 'plant'])
  })

  it('a heap is named once, with everything in it', () => {
    const v = overlaps([it_('sofa', 'sofa', 100, 100), it_('plant', 'plant', 150, 120),
      it_('chair_a', 'armchair', 170, 110), it_('table', 'coffee_table', 200, 130)])
    expect(v, 'one line per pair again').toHaveLength(1)
    expect(v[0].items).toHaveLength(4)
    expect(v[0].msg).toMatch(/and .+ are on top of each other/)
    expect(v[0].fix, 'told them to move one of four').toMatch(/pull them apart/)
  })

  it('two separate heaps are two problems', () => {
    const v = overlaps([it_('sofa', 'sofa', 20, 20), it_('plant', 'plant', 40, 30),
      it_('chair_a', 'armchair', 400, 300), it_('table', 'coffee_table', 420, 320)])
    expect(v).toHaveLength(2)
  })

  it('and the other rules are no longer crowded out', () => {
    const p = PRESETS.find(x => x.id === 'living-pile')!
    const v = check(p.room, p.items, p.profile)
    expect(v.filter(x => x.rule === 'overlap'), 'the pile is one heap').toHaveLength(1)
    expect(new Set(v.slice(0, 12).map(x => x.rule)).size,
      'the first twelve problems are all the same kind again').toBeGreaterThan(3)
  })
})

describe('the wheelchair audit says which armchair', () => {
  it('names a destination the way everything else does', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: 'accessibility',
      hour: 9, brief: null, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    const v = (await (TOOLS.find(t => t.name === 'access_check')!.run({}) as any)).verdict as string
    expect(v, 'nothing fails to reach or to turn here, so this proves nothing').toMatch(/no room to turn|not turned in/)
    expect(v, 'no armchair fails here, so this proves nothing about telling two apart').toMatch(/armchair/)
    // every piece the verdict counts is a piece it names: the clause that used to read "some
    // destinations cannot be reached at all" named nobody, while the clause above it named them all
    for (const n of v.match(/(\d+) (?:of \d+ )?(?:destinations|more)/g) ?? [])
      expect(v.split('—').length - 1, `"${n}" is counted and nothing after it is named`).toBeGreaterThanOrEqual(v.split(';').length - 1 + 1)
    expect(v, 'two armchairs in this room and no way to tell which one').toMatch(/armchair \(chair_[ab]\)/)
    expect(v, 'named one thing twice').not.toMatch(/\bsofa \(sofa\)/)
    // and it leads with the worse fact. This room has two destinations no wheelchair can reach at
    // all, and the verdict used to report only that three of them had no room to turn — testing the
    // lesser problem first, so the worse one never reached the line the transcript prints.
    const out = await (TOOLS.find(t => t.name === 'access_check')!.run({}) as any)
    expect(out.unreachable.length, 'nothing is unreachable here, so the ordering is untested').toBeGreaterThan(0)
    const turn = Math.max(v.indexOf('not turned in'), v.indexOf('no room to turn'))
    expect(v.indexOf('cannot be reached'), 'the verdict does not mention what cannot be reached at all').toBeGreaterThanOrEqual(0)
    expect(v.indexOf('cannot be reached') < turn || turn < 0, 'it reports the lesser problem first').toBe(true)
    for (const id of out.unreachable) expect(v, `${id} cannot be reached and the verdict does not say so`).toContain(id)
  })
})

describe('the transcript calls furniture what the catalogue calls it', () => {
  it('reads as English, not as a type name', () => {
    set({ presetId: 'blank', room: { w: 600, h: 500, doors: [], windows: [], outlets: [] }, items: [], notes: [], flat: null, here: null })
    expect(plain('add_item', { type: 'bed_double' }, { item: {} })).toBe('added a double bed')
    expect(plain('add_item', { type: 'coffee_table' }, { item: {} })).toBe('added a coffee table')
    expect(plain('add_item', { type: 'sofa' }, { item: {} })).toBe('added a sofa')
  })
})

describe('a new piece is named the way a person would name it', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const empty = () => set({ presetId: 'blank', room: { w: 600, h: 500, doors: [{ id: 'd', wall: 'S', pos: 250, width: 90 }], windows: [], outlets: [{ x: 0, y: 250 }] },
    items: [], profile: 'general', hour: 9, brief: null, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })

  it('the first of a kind is just its kind', async () => {
    empty()
    expect((await run('add_item', { type: 'wardrobe' })).item.id).toBe('wardrobe')
    expect((await run('add_item', { type: 'wardrobe' })).item.id).toBe('wardrobe_2')
    expect((await run('add_item', { type: 'wardrobe' })).item.id).toBe('wardrobe_3')
    expect((await run('add_item', { type: 'lamp' })).item.id, 'a lamp counts lamps, not everything').toBe('lamp')
  })

  it('and never takes a name the room is already using', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, brief: null, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    const added = (await run('add_item', { type: 'plant' })).item.id
    expect(added, 'took the name of the plant that was already there').not.toBe('plant')
    expect(state.items.filter(i => i.id === added)).toHaveLength(1)
  })

  it('so a lone piece needs no id on its label', async () => {
    empty()
    const it = (await run('add_item', { type: 'wardrobe' })).item
    expect(idIsName(state.items.find(i => i.id === it.id)!), 'the label will say "wardrobe · wardrobe_7"').toBe(true)
  })
})

describe('an id earns its place the same way in both views', () => {
  const sofa = it_('sofa', 'sofa', 0, 0)
  const chairA = it_('chair_a', 'armchair', 200, 0)
  const chairB = it_('chair_b', 'armchair', 300, 0)

  it('two of a kind, and only two of a kind', () => {
    const room2 = [sofa, chairA, chairB]
    expect(hasTwin(room2, chairA), 'two armchairs and you cannot tell which').toBe(true)
    expect(hasTwin(room2, sofa), 'the only sofa needs no id').toBe(false)
    expect(hasTwin([sofa, chairA, { ...chairB, parked: true as const }], chairA),
      'the twin is in the tray, so there is only one in the room').toBe(false)
  })

  it('and neither view counts them for itself', () => {
    for (const [file, src] of [['Plan.tsx', planSource], ['Scene3D.tsx', sceneSource]] as const)
      expect(src, `${file} counts twins by hand`).not.toMatch(/o\.type === it\.type && !o\.parked/)
  })
})

describe('standing back at the home, or standing in a room', () => {
  it('is one question with one answer', () => {
    const flat = buildFlat(2, 4)
    expect(atWholeHome({ flat, here: null })).toBe(true)
    expect(atWholeHome({ flat, here: 'kitchen' })).toBe(false)
    expect(atWholeHome({ flat: null, here: null }), 'a single scene is not a home').toBe(false)
  })

  it('and neither view works it out for itself', () => {
    for (const [file, src] of [['App.tsx', appSource], ['Panel.tsx', panelSource]] as const)
      expect(src, `${file} spells the condition out instead of asking`).not.toMatch(/flat && !\s*(s\.)?here/)
  })
})

describe('the room passes, or it does not', () => {
  const one = [{ id: 'a', parked: undefined }] as any[]
  it('needs both no problems and something in the room', () => {
    expect(roomPasses([], one), 'a furnished room with no problems does not pass').toBe(true)
    expect(roomPasses([{ severity: 'warn' }], one), 'a warning is still a problem').toBe(false)
    expect(roomPasses([], []), 'an empty room is not a success — there is nothing to judge').toBe(false)
    expect(roomPasses([], [{ parked: true }] as any[]), 'everything set aside is still an empty room').toBe(false)
  })

  it('is asked once, by both the plan and the banner', () => {
    expect(planSource, 'the plan works it out for itself again').toContain('roomPasses(V, items)')
    expect(appSource, 'the banner works it out for itself again').toContain('roomPasses(V, s.items)')
    for (const src of [planSource, appSource])
      expect(src, 'somebody has spelled the condition out by hand again').not.toMatch(/V\.length === 0 && [a-z.]*items\.length > 0/)
  })
})

describe('no answer grows faster than the room', () => {
  const roomWith = (n: number) => {
    set({ presetId: 'blank', room: { w: 1000, h: 1000, doors: [{ id: 'd', wall: 'S', pos: 400, width: 90 }], windows: [], outlets: [{ x: 0, y: 500 }] },
      items: Array.from({ length: n }, (_, i) => it_(`chair_${i}`, 'chair', 20 + (i % 10) * 95, 20 + Math.floor(i / 10) * 95)),
      profile: 'general', hour: 9, brief: { people: 8, activity: 'work' }, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    resetSent()
  }
  const size = async (name: string, args: any) => {
    const out = await (TOOLS.find(t => t.name === name)!.run(args) as any)
    return JSON.stringify(out).length
  }

  for (const [name, args] of [['get_room', {}], ['sense_room', {}], ['find_space', { type: 'sofa' }]] as const) {
    it(`${name}: five times the furniture is not twenty-five times the answer`, async () => {
      roomWith(10); const small = await size(name, args)
      roomWith(50); const large = await size(name, args)
      expect(large, `${name}: ${small} → ${large} characters for 5x the furniture`).toBeLessThan(small * 3)
    })
  }

  it('a home with eight rooms summarises them rather than sending them all', async () => {
    set({ items: [], flat: null, here: null, notes: [], presetId: 'blank' })
    await (TOOLS.find(t => t.name === 'define_flat')!.run({ bedrooms: 4, people: 8, extras: ['study', 'balcony'] }) as any)
    const out = await (TOOLS.find(t => t.name === 'rooms')!.run({}) as any)
    expect(JSON.stringify(out).length, `rooms answered with ${JSON.stringify(out).length} characters for 8 rooms`).toBeLessThan(2000)   // measured 1218
  })
})

describe('anything carrying words a person typed says so', () => {
  it('every tool that returns the brief is annotated', () => {
    const carries = TOOLS.filter(t => /\.\.\.snapshot\(\)/.test(toolsSrc(t.name)))
    expect(carries.length, 'nothing returns the brief any more').toBeGreaterThan(3)
    for (const t of carries)
      expect((t as any).untrusted, `${t.name} hands back brief.who and does not flag it`).toBe(true)
  })

  it('and nothing else claims to', () => {
    for (const t of TOOLS.filter(x => (x as any).untrusted))
      expect(/\.\.\.snapshot\(\)|state\.learned|notes/.test(toolsSrc(t.name)),
        `${t.name} is flagged untrusted and returns nothing a person typed`).toBe(true)
  })
})

describe('a tool that replaces rather than adds says so', () => {
  // the whole question, written down: does running this leave things the agent never named changed?
  const REPLACES = ['remove_item', 'set_room', 'define_flat', 'saves', 'preset', 'layouts', 'baseline']
  const ADDS = ['move_items', 'arrange', 'add_item', 'dock_item', 'undo', 'say', 'show', 'brief', 'set_profile', 'sun', 'enter_room']

  it('every tool that can replace what is there is annotated', () => {
    for (const n of REPLACES)
      expect((TOOLS.find(t => t.name === n) as any)?.destructive, `${n} replaces things and does not say so`).toBe(true)
  })

  it('and the ones that only add are not', () => {
    for (const n of ADDS)
      expect((TOOLS.find(t => t.name === n) as any)?.destructive, `${n} is additive and claims to be destructive`).toBeUndefined()
  })

  it('leaves no tool unaccounted for', () => {
    const judged = new Set([...REPLACES, ...ADDS])
    expect(TOOLS.map(t => t.name).filter(n => !judged.has(n) && !(TOOLS.find(t => t.name === n) as any).readOnly),
      'a tool that changes the room and nobody decided which kind it is').toEqual([])
  })
})

describe('a tool that says it only reads, only reads', () => {
  const ARGS: Record<string, any> = {
    get_room: {}, sense_room: {}, find_space: { type: 'sofa' }, measure: { a: 'sofa', b: 'tv' },
    access_check: {}, rooms: {}, share: {}, plan_sheet: {}, bedside_check: {}, work_triangle: {},
  }
  const snapshot = () => JSON.stringify({
    items: state.items, room: state.room, profile: state.profile, hour: state.hour,
    brief: state.brief, layouts: state.layouts, flat: state.flat, here: state.here,
  })

  for (const t of TOOLS.filter(x => (x as any).readOnly)) {
    it(`${t.name} changes nothing`, async () => {
      const p = PRESETS.find(x => x.id === 'dad-visits')!
      set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
        hour: 9, brief: null, notes: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
      expect(ARGS[t.name], `${t.name} is read-only and this test does not drive it`).toBeTruthy()
      const before = snapshot()
      await (t.run(ARGS[t.name]) as any)
      expect(snapshot(), `${t.name} says readOnly and changed the room`).toBe(before)
      expect(state.history, `${t.name} pushed an undo step, so it changed something`).toHaveLength(0)
    })
  }
})

describe('every change is either undoable or was agreed to', () => {
  const shape = () => `${state.room.w}x${state.room.h}|` + state.items.map(i => `${i.id}@${i.x},${i.y},${i.rot},${i.parked ? 'aside' : 'in'}`).join('|')
  const CHANGERS: [string, any][] = [
    ['move_items', { id: 'plant', x: 20, y: 20, force: true }],
    ['arrange', { items: ['chair_a', 'chair_b'], as: 'row', gap: 30, force: true }],
    ['add_item', { type: 'lamp' }],
    ['dock_item', { id: 'table', to: 'sofa' }],
    ['baseline', {}],
    ['set_room', { w: 500, h: 420 }],
  ]

  for (const [name, args] of CHANGERS) {
    it(`${name} can be taken back`, async () => {
      const p = PRESETS.find(x => x.id === 'dad-visits')!
      set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
        hour: 9, brief: null, notes: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
      const before = shape()
      await (TOOLS.find(t => t.name === name)!.run(args) as any)
      expect(shape(), `${name} changed nothing, so there was nothing to take back`).not.toBe(before)
      expect(state.notes.some(n => n.options?.includes('✓ allow')),
        `${name} rearranged the room without asking`).toBe(false)
      const u = await (TOOLS.find(t => t.name === 'undo')!.run({}) as any)
      expect(u.undone, `${name} left nothing on the undo stack`).toBe(true)
      expect(shape(), `undo did not put the room back after ${name}`).toBe(before)
    })
  }
})

describe('a failure looks like a failure', () => {
  const tool = (n: string) => TOOLS.find(t => t.name === n)!
  const raw = (n: string, a: unknown) => wrap(tool(n)).execute(a)

  it('flags an error both ways, because the flag does not survive the trip', async () => {
    set({ presetId: 'blank', room: { w: 400, h: 400, doors: [], windows: [], outlets: [] }, items: [], notes: [], flat: null, here: null })
    const r: any = await raw('add_item', { type: 'hovercraft' })
    expect(r.isError, 'no isError on a failed call').toBe(true)
    expect(JSON.parse(r.content[0].text).error, 'the flag is all there is, and Chrome drops it').toMatch(/no such piece/)
  })

  it('does not flag a refusal as an error — it is an outcome', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    const r: any = await raw('move_items', { id: 'sofa', x: 0, y: 30, rot: 90 })
    const out = JSON.parse(r.content[0].text)
    expect(out.refused, 'this move should have been refused').toBe(true)
    expect(r.isError, 'a refusal is the page working, not failing').toBeUndefined()
  })

  it('turns a thrown error into an answer rather than losing the call', async () => {
    const boom = { ...tool('get_room'), run: () => { throw new TypeError('the floor fell off') } }
    const r: any = await wrap(boom as never).execute({})
    expect(r.isError).toBe(true)
    expect(JSON.parse(r.content[0].text).error).toMatch(/the floor fell off/)
  })

  it('and a call that throws still leaves the transcript alone', async () => {
    const before = state.feed.length
    const boom = { ...tool('get_room'), name: 'get_room', run: () => { throw new Error('nope') } }
    await wrap(boom as never).execute({})
    expect(state.feed.length, 'narrated a call that never happened').toBe(before)
  })
})

describe('however the arguments arrive', () => {
  const tool = (n: string) => TOOLS.find(t => t.name === n)!
  const call = async (n: string, a: unknown) =>
    JSON.parse((await wrap(tool(n)).execute(a)).content[0].text)

  it('takes a bare value for a one-argument tool, quoted or not', async () => {
    set({ presetId: 'blank', room: { w: 400, h: 400, doors: [], windows: [], outlets: [] }, items: [], profile: 'general', notes: [], flat: null, here: null })
    for (const shape of ['theater', '"theater"', { profile: 'theater' }, '{"profile":"theater"}']) {
      set({ profile: 'general' })
      await call('set_profile', shape)
      expect(state.profile, `set_profile(${JSON.stringify(shape)}) did nothing`).toBe('theater')
    }
  })

  it('does not mistake a parsed scalar for an arguments object', () => {
    expect(coerce(tool('set_profile'), '"theater"')).toEqual({ profile: 'theater' })
    expect(coerce(tool('sun'), '14')).toEqual({ hour: 14 })
    expect(coerce(tool('set_profile'), 'theater')).toEqual({ profile: 'theater' })
    expect(coerce(tool('get_room'), null)).toEqual({})
    expect(coerce(tool('move_items'), { id: 'sofa', x: 1 })).toEqual({ id: 'sofa', x: 1 })
  })
})

describe('what the human did reaches the agent', () => {
  const run = async (n: string, a: any = {}) =>
    JSON.parse((await wrap(TOOLS.find(t => t.name === n)!).execute(a)).content[0].text)
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, notes: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
  }

  it('the next call carries it, and only the next one', async () => {
    scene()
    await run('get_room')                                   // agent looks
    const it = getItem('plant')!
    updateItem('plant', { x: it.x - 40 })                   // the human drags it
    humanEvent({ action: 'moved', item: 'plant', text: 'nudged the plant' })

    const next = await run('get_room')
    expect(next.humanChanges, 'the agent was never told the room moved').toBeTruthy()
    expect(next.humanChanges[0].text).toBe('nudged the plant')
    expect(next.status, 'the status line hides it').toMatch(/1 human change/)

    const after = await run('get_room')
    expect(after.humanChanges, 'told the agent the same news twice').toBeUndefined()
  })

  it('a read-only tool reports it too, not just the ones that change things', async () => {
    scene()
    humanEvent({ action: 'moved', item: 'sofa', text: 'shoved the sofa over' })
    const r = await run('measure', { a: 'sofa', b: 'tv' })
    expect(r.humanChanges, 'measuring is a turn too — the room still moved').toBeTruthy()
    expect(r.humanChanges[0].text).toBe('shoved the sofa over')
  })

  it('keeps every change when the human does several before the agent looks', async () => {
    scene()
    for (const t of ['nudged the plant', 'rotated the sofa', 'removed the rug'])
      humanEvent({ action: 'moved', text: t })
    const r = await run('sense_room')
    expect(r.humanChanges.map((h: any) => h.text)).toEqual(['nudged the plant', 'rotated the sofa', 'removed the rug'])
  })
})

describe('a bubble with no words in it is not a bubble', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  it('asks for the sentence rather than drawing an empty one', async () => {
    set({ presetId: 'blank', room: { w: 400, h: 400, doors: [], windows: [], outlets: [] }, items: [], notes: [], flat: null, here: null })
    for (const bad of [{}, { text: '' }, { text: '   ' }, { text: 42 }]) {
      const r = await run('say', bad)
      expect(r.error, `say(${JSON.stringify(bad)}) drew a bubble anyway`).toMatch(/say what\?/)
    }
    expect(state.notes, 'left empty bubbles on the plan').toHaveLength(0)
    expect((await run('say', { text: 'a real sentence' })).ok).toBe(true)
  })
})

describe('the transcript is honest about a question that was not answered yes', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const furnished = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
  }
  const ASKS: [string, any][] = [
    ['remove_item', { id: 'plant' }],
    ['define_flat', { bedrooms: 2, people: 4 }],
    ['preset', { id: 'studio-tight' }],
    ['set_room', { w: 300, h: 300, doors: [{ wall: 'S', pos: 100, width: 90 }] }],
  ]

  for (const [name, args] of ASKS) {
    it(`${name}: a refusal reads as a refusal`, async () => {
      furnished()
      const pending = run(name, args)
      await new Promise(r => setTimeout(r, 0))
      settle(state.notes.at(-1)!.id, '✗')
      const out = await pending
      const line = plain(name, args, out)
      expect(line, `${name} said nothing about being refused`).toBeTruthy()
      expect(line, `${name}: ${line}`).not.toMatch(/undefined|NaN/)
      expect(line).toMatch(/you refused/)
    })

    it(`${name}: silence does not read as a refusal`, async () => {
      vi.useFakeTimers()
      try {
        furnished()
        const pending = run(name, args)
        await vi.advanceTimersByTimeAsync(91_000)
        const line = plain(name, args, await pending)
        expect(line, `${name} told the human they refused`).not.toMatch(/you refused/)
        expect(line).toMatch(/nobody answered/)
      } finally { vi.useRealTimers() }
    })
  }
})

describe('silence is not a refusal', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('says nobody answered, rather than that they said no', async () => {
    vi.useFakeTimers()
    try {
      const p = PRESETS.find(x => x.id === 'dad-visits')!
      set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
        hour: 9, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
      const pending = run('remove_item', { id: 'plant' })
      await vi.advanceTimersByTimeAsync(91_000)
      const r = await pending
      expect(r.refused).toBe(true)
      expect(r.note, 'told the agent the human refused when nobody was there').toMatch(/nobody answered/)
      expect(r.note).toMatch(/do NOT tell them they refused/)
      expect(r.waited_for).toMatch(/did not answer/)
      expect(state.items.some(i => i.id === 'plant'), 'deleted it anyway').toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('still says they refused when they actually did', async () => {
    const pending = run('remove_item', { id: 'plant' })
    await new Promise(r => setTimeout(r, 0))
    settle(state.notes.at(-1)!.id, '✗')
    const r = await pending
    expect(r.note).toMatch(/did not allow deleting plant/)
    expect(r.waited_for, 'called a real refusal an unanswered question').toBeUndefined()
  })
})

describe('reopening a save asks too', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('keeps what is on screen when the human says no', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    await run('saves', { action: 'save', name: 'keeper' })
    await run('remove_item', { id: 'plant', keep: true })
    const before = state.items.filter(i => !i.parked).length

    const pending = run('saves', { action: 'load', name: 'keeper' })
    await new Promise(r => setTimeout(r, 0))
    settle(state.notes.at(-1)!.id, '✗')
    const r = await pending
    expect(r.refused).toBe(true)
    expect(r.note, 'no way out offered').toMatch(/save it under a new name/)
    expect(state.items.filter(i => !i.parked)).toHaveLength(before)
    await run('saves', { action: 'delete', name: 'keeper' })
  })

  it('does not ask when the room is empty', async () => {
    set({ items: [], flat: null, here: null, notes: [], presetId: 'blank' })
    await run('saves', { action: 'save', name: 'empty one' })
    const r = await run('saves', { action: 'load', name: 'empty one' })
    expect(r.loaded).toBe('empty one')
    expect(state.notes, 'asked about nothing').toHaveLength(0)
    await run('saves', { action: 'delete', name: 'empty one' })
  })
})

describe('building a home asks before it builds over one', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const furnished = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
  }
  const answer = (yes: boolean) => { const n = state.notes.at(-1)!; settle(n.id, yes ? '✓' : '✗') }

  it('keeps the room when the human says no', async () => {
    furnished()
    const before = state.items.length
    const pending = run('define_flat', { bedrooms: 2, people: 4 })
    await new Promise(r => setTimeout(r, 0))
    expect(state.notes.at(-1)!.text, 'built a home over their furniture without asking').toMatch(/all 9 pieces in it go/)
    answer(false)
    const r = await pending
    expect(r.refused).toBe(true)
    expect(state.flat, 'built the home anyway').toBeNull()
    expect(state.items).toHaveLength(before)
  })

  it('builds it when they say yes', async () => {
    furnished()
    const pending = run('define_flat', { bedrooms: 2, people: 4 })
    await new Promise(r => setTimeout(r, 0))
    answer(true)
    expect((await pending).flat).toBe('2BHK for 4')
    expect(state.flat!.rooms).toHaveLength(5)
  })

  it('does not ask when there is nothing to lose', async () => {
    set({ items: [], flat: null, here: null, notes: [], presetId: 'blank' })
    const r = await run('define_flat', { bedrooms: 1, people: 2 })
    expect(r.flat, 'asked about an empty room').toBe('1BHK for 2')
    expect(state.notes, 'put a question on screen for nothing').toHaveLength(0)
  })
})

describe('a resize says what no longer fits', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('names the pieces it had to set aside', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, brief: null, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    const r = await run('set_room', { w: 200, h: 200 })
    expect(r.set_aside, 'quietly emptied the floor').toBeTruthy()
    expect(r.set_aside).toContain('sofa')
    expect(r.in_the_room, 'counted the item list, not the room').toBe(state.items.filter(i => !i.parked).length)
    expect(r.note, 'never said the furniture is recoverable').toMatch(/move_items brings/)
    // and the human's transcript says it too, not just the agent's payload
    expect(plain('set_room', { w: 200, h: 200 }, r)).toMatch(/no longer fit/)
  })

  it('says nothing about a resize that costs nothing', async () => {
    const r = await run('set_room', { w: 600, h: 600 })
    expect(r.set_aside).toBeUndefined()
    expect(plain('set_room', { w: 600, h: 600 }, r)).toBe('resized the room to 600×600cm')
  })
})

describe('the page\'s own arranger is a bar worth clearing', () => {
  for (const p of PRESETS.filter(x => x.items.filter(i => !i.parked).length > 2)) {
    it(`${p.id}: baseline owns up when it makes the room worse`, async () => {
      set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
        hour: 9, brief: null, notes: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
      const before = score(check(state.room, state.items, state.profile, undefined, 9, null))
      const out = await (TOOLS.find(t => t.name === 'baseline')!.run({}) as any)
      const after = score(check(state.room, state.items, state.profile, undefined, 9, null))
      expect(out.baseline_score, 'reported a score it did not reach').toBe(after)
      expect(out.was, 'never said what the room scored before it rearranged it').toBe(before)
      if (after < before) {
        expect(out.note, `${p.id}: ${before} → ${after} with no warning`).toMatch(/WORSE/)
        expect(out.note, 'did not say how to put the old layout back').toMatch(/undo\(\)/)
      }
    })
  }
})

describe('the coffee table band says which number is which', () => {
  const room2: Room = { w: 500, h: 400, doors: [{ id: 'd', wall: 'S', pos: 200, width: 90 }], windows: [], outlets: [{ x: 0, y: 200 }] }
  const pair = (tableW: number) => [it_('sofa', 'sofa', 100, 250), { ...it_('t', 'coffee_table', 120, 150), w: tableW }]
  const fired = (tableW: number) => check(room2, pair(tableW) as never, 'general').some(v => v.rule === 'proportion')
  const sofaLong = Math.max(CATALOG.sofa.w, CATALOG.sofa.h)

  it('leaves alone anything inside the tolerance, including outside the aim', () => {
    expect(fired(Math.round(sofaLong * TABLE.aim[0])), 'the aim itself must pass').toBe(false)
    expect(fired(Math.round(sofaLong * (TABLE.allow[0] + 0.02))), 'inside the tolerance, still nagged').toBe(false)
    expect(fired(Math.round(sofaLong * (TABLE.allow[0] - 0.05))), 'well under and said nothing').toBe(true)
  })

  it('and the advice quotes both bands', () => {
    const v = check(room2, pair(Math.round(sofaLong * 0.3)) as never, 'general').find(x => x.rule === 'proportion')!
    // bounded on the left, so a wider number containing this one cannot satisfy it — the same shape
    // that let "60cm" pass by matching inside "660cm" elsewhere in this suite
    expect(v.fix).toMatch(new RegExp(`(^|[^\\d])${Math.round(TABLE.allow[0] * 100)}%`))
    expect(v.fix).toMatch(new RegExp(`(^|[^\\d])${Math.round(TABLE.aim[0] * sofaLong)}(?!\\d)`))
  })
})

// Both write-ups quote this message verbatim as the example of a rule that encodes lived experience
// rather than collision detection. Five desks at 140cm each is exactly the 700cm run they quote.
describe('the sentence the write-ups quote about five desks', () => {
  it('is the sentence the rule produces', () => {
    const room2: Room = { w: 900, h: 500, doors: [{ id: 'd', wall: 'S', pos: 400, width: 90 }], windows: [], outlets: [{ x: 0, y: 200 }] }
    const desks = Array.from({ length: 5 }, (_, i) => it_(`desk_${i + 1}`, 'desk', 20 + i * CATALOG.desk.w, 100))
    const v = check(room2, desks, 'office', undefined, 9, { people: 5, activity: 'study' })
      .find(x => x.rule === 'per_person' && /run/.test(x.msg))!
    expect(v, 'five desks in a row no longer read as one table').toBeTruthy()
    expect(v.msg).toBe('desk_1, desk_2, desk_3, desk_4, desk_5 are pushed together into one 700cm run — that reads as a single shared table, not 5 places to work')
  })
})

describe('the gap that makes two desks one table', () => {
  const desks = (gap: number) => Array.from({ length: 3 }, (_, i) =>
    it_(`desk_${i}`, 'desk', 20 + i * (CATALOG.desk.w + gap), 100))

  it('fires below the threshold and not above it', () => {
    const room2: Room = { w: 900, h: 400, doors: [{ id: 'd', wall: 'S', pos: 400, width: 90 }], windows: [], outlets: [{ x: 0, y: 200 }] }
    const brief3: Brief = { people: 3, activity: 'study' }
    const fired = (gap: number) => check(room2, desks(gap), 'office', undefined, 9, brief3)
      .some(v => v.rule === 'per_person' && /one \d+cm run/.test(v.msg))
    expect(fired(TOUCHING - 5), `desks ${TOUCHING - 5}cm apart should read as one table`).toBe(true)
    expect(fired(TOUCHING + 10), `desks ${TOUCHING + 10}cm apart are separate desks`).toBe(false)
  })

  it('and says the number it actually uses', () => {
    const room2: Room = { w: 900, h: 400, doors: [{ id: 'd', wall: 'S', pos: 400, width: 90 }], windows: [], outlets: [{ x: 0, y: 200 }] }
    const v = check(room2, desks(2), 'office', undefined, 9, { people: 3, activity: 'study' })
      .find(x => x.rule === 'per_person' && /run/.test(x.msg))!
    expect(v.fix).toContain(`${TOUCHING}cm`)
  })
})

describe('what the brief asks for is what the rules will check', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const askedFor = async (profile: 'bedroom' | 'accessibility') => {
    set({ presetId: 'custom', room: { w: 400, h: 400, doors: [], windows: [], outlets: [] }, items: [], profile,
      hour: 9, brief: null, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    return ((await run('brief', { people: 2, activity: 'sleep' })).requires as string[]).join(' ')
  }

  it('asks for the bedside space the goal in force will hold it to', async () => {
    expect(await askedFor('bedroom'), 'asked for a number the rules do not check')
      .toContain(`${bedSide('bedroom')}cm clear beside each bed`)
    expect(await askedFor('accessibility')).toContain(`${bedSide('accessibility')}cm clear beside each bed`)
  })

  it('and the wheelchair audit quotes its own constants', async () => {
    set({ presetId: 'custom', room: { w: 400, h: 400, doors: [{ id: 'd', wall: 'S', pos: 150, width: 90 }], windows: [], outlets: [] },
      items: [it_('bed', 'bed_double', 100, 100)], profile: 'accessibility', hour: 9, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    const std = (await run('access_check')).standard as string
    for (const n of [minWalk('accessibility'), TURN, bedSide('accessibility'), pullOut('accessibility')])
      expect(std, `the standard no longer quotes ${n}`).toContain(`${n}cm`)
  })
})

describe('the two bedside numbers explain themselves', () => {
  it('bedside_check says which question each number answers', async () => {
    const room: Room = { w: 400, h: 400, doors: [{ id: 'd', wall: 'S', pos: 150, width: 90 }], windows: [], outlets: [] }
    set({ presetId: 'custom', room, items: [it_('bed', 'bed_double', 100, 0)], profile: 'bedroom',
      hour: 9, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    const r = await (TOOLS.find(t => t.name === 'bedside_check')!.run({}) as any)
    // this said toContain('75cm') and went on passing after the tool stopped using 75 — the number in
    // the sentence has to be the number the check uses, or the tool explains itself wrongly
    expect(r.rule, 'the tool quotes a threshold it does not use').not.toMatch(/(^|[^\d])75cm/)
    expect(r.rule, 'never mentions the rule it shares its number with').toContain('bed_clearance')
    expect(r.rule).toMatch(new RegExp(`(^|[^\\d])${bedSide('bedroom')}cm`))
    expect(r.beds[0].clear_left_cm, 'the sides are measured against a different number than the text quotes')
      .toBeGreaterThanOrEqual(bedSide('bedroom'))
    expect(r.rule).toContain(`${bedSide('accessibility')}cm`)
  })
})

describe('a window is a thing in the room you can name', () => {
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
  }
  const spots = (a: Record<string, unknown>) => (TOOLS.find(t => t.name === 'find_space')!.run({ type: 'desk', ...a }) as any).candidates ?? []

  it('facing the window changes the answer', () => {
    scene()
    const plain = JSON.stringify(spots({}))
    const win = spots({ facing: 'window' })
    expect(JSON.stringify(win), 'facing the window did nothing at all').not.toBe(plain)
    expect(win[0].why, 'the reason does not mention what it faces').toMatch(/facing window/)
  })

  it('near the door and the socket mean something too', () => {
    scene()
    for (const word of ['door', 'outlet'])
      expect(JSON.stringify(spots({ near: word })), `near the ${word} did nothing`).not.toBe(JSON.stringify(spots({})))
  })
})

describe('docking to something that is not there', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('will not quietly dock a blind to a different window', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })
    const blind = (await run('add_item', { type: 'blind' })).item.id
    const wrong = await run('dock_item', { id: blind, to: 'south window' })
    expect(wrong.docked_to, 'covered a window nobody asked about').toBeUndefined()
    expect(wrong.error).toMatch(/no south window/)
    expect(wrong.windows).toContain('north window')
    // naming a real one still works, and so does letting the page choose
    expect((await run('dock_item', { id: blind, to: 'north window' })).docked_to).toBe('north window')
    expect((await run('dock_item', { id: blind })).docked_to).toBeTruthy()
  })

  it('says which host it could not find', async () => {
    const r = await run('dock_item', { id: 'chair_a', to: 'no_such_desk' })
    expect(r.error).toMatch(/no item called no_such_desk/)
    expect(r.ids).toContain('sofa')
  })
})

describe('what cannot change is not resent every turn', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const size = (o: unknown) => JSON.stringify(o).length

  it('teaches the catalogue and the rules once, and the second call is much smaller', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    resetSent()
    set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9,
      notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null })

    const one = await run('get_room')
    expect(one.catalog, 'the first call has to teach the catalogue').toBeTruthy()
    expect(one.rules, 'and which rules are in force').toBeTruthy()

    const two = await run('get_room')
    expect(two.catalog, 'sent the whole catalogue again').toBeUndefined()
    expect(two.rules, 'sent the rule list again').toBeUndefined()
    // the room itself is still there — this is about what does not change, not about saying less
    expect(two.items).toHaveLength(one.items.length)
    expect(size(two), 'the repeat call saved almost nothing').toBeLessThan(size(one) - 1000)
  })

  it('teaches it again for a new session', async () => {
    resetSent()
    expect((await run('get_room')).catalog, 'a fresh agent never got the catalogue').toBeTruthy()
  })
})

// WebMCP is agent to page only. The one thing a page can do unprompted is change its tool list, so a
// message for the agent is carried IN THE DESCRIPTION of a tool that appears when there is something
// to say. It is a headline claim of the submission and nothing tested it.
describe('the page can get a word in', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const scene = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9,
      notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null, nudge: null })
  }

  it('a human turning down a proposal leaves a message the agent can read', async () => {
    scene()
    await run('move_items', { id: 'plant', x: 20, y: 20, propose: true, why: 'nearer the window' })
    expect(state.proposals).toHaveLength(1)
    expect(state.nudge, 'nothing to tell the agent about yet').toBeNull()

    rejectProposal(state.proposals[0].id, 'it will not get any light there')
    expect(state.nudge!.text, 'the human said no and the agent was never told').toMatch(/REJECTED/)
    expect(state.nudge!.text).toMatch(/plant/)
    expect(state.nudge!.text, 'dropped the reason they gave').toMatch(/not get any light/)

    expect(state.nudge!.text.length, 'a message too short to act on').toBeGreaterThan(30)
    expect(state.nudge!.text, 'told the agent what happened but not what to do').toMatch(/Ask why or try something else/)
  })

  it('keeps both when the human does two things before the agent looks', async () => {
    scene()
    await run('move_items', { id: 'plant', x: 20, y: 20, propose: true })
    await run('move_items', { id: 'shelf', x: 30, y: 30, propose: true })
    const [a, b] = state.proposals.map(p => p.id)
    rejectProposal(a); rejectProposal(b)
    expect(state.nudge!.text, 'the second refusal overwrote the first').toMatch(/ALSO:/)
  })
})

// The refusal is the first twenty seconds of the video and the first line of the submission. Most
// judges will never have a WebMCP agent, so the scripted session is where they see it — and nothing
// checked that it is still in there.
describe('the scripted session still shows the page refusing', () => {
  it('dad-visits refuses a move, puts the furniture back and offers somewhere that works', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, brief: null, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, eye: null })
    let last = '', refusals = 0
    for (const [name, args] of p.demo!) {
      const filled = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v === '$last' ? last : v]))
      const before = state.items.map(i => `${i.id}:${i.x},${i.y}`).join()
      const out: any = await (TOOLS.find(t => t.name === name)!.run(filled) as any)
      if (out?.item?.id) last = out.item.id
      if (out?.refused) {
        refusals++
        expect(out.moved, 'a refusal that moved something is not a refusal').toBe(0)
        expect(state.items.map(i => `${i.id}:${i.x},${i.y}`).join(), 'the room changed anyway').toBe(before)
        expect(out.because?.[0]?.length, 'refused without naming a rule').toBeGreaterThan(10)
        expect((out.instead ?? out.least_bad)?.length, 'refused without handing back a coordinate to negotiate with').toBeGreaterThan(0)
      }
    }
    expect(refusals, 'the one thing no other entry shows, and the demo no longer does it').toBeGreaterThan(0)
  })
})

// A scripted session that ends in a mess is worse than no session at all — it is the only thing a
// judge without an agent will see. So the flagship scenes have to END somewhere defensible.
describe('a scripted session leaves the room better than it found it', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const scoreNow = () => score(check(state.room, state.items, state.profile, undefined, state.hour, state.brief))

  for (const p of PRESETS.filter(x => x.demo?.some(([t]) => t === 'baseline' || t === 'arrange'))) {
    it(`${p.id} ends up better than it started`, async () => {
      set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
        hour: 9, brief: null, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, eye: null })
      const started = scoreNow()
      let last = ''
      for (const [name, args] of p.demo!) {
        const filled = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v === '$last' ? last : v]))
        const out: any = await run(name, filled)
        if (out?.item?.id) last = out.item.id
        expect(out?.refused, `${p.id}/${name} was refused: ${out?.because?.[0]}`).toBeFalsy()
      }
      // a session that deliberately ends holding ghosts out for a human is judged on what it offered
      if (state.proposals.length) {
        const asAccepted = state.items.map(i => { const q = state.proposals.find(p2 => p2.item === i.id); return q ? { ...i, x: q.x, y: q.y, rot: q.rot, parked: undefined } : i })
        expect(score(check(state.room, asAccepted, state.profile, undefined, state.hour, state.brief)),
          `${p.id} is offering the human something worse than what they had`).toBeGreaterThanOrEqual(started)
        return
      }
      const ended = scoreNow()
      // a scene that starts empty starts at 100 by default — it cannot "improve", it just has to
      // finish somewhere defensible. A scene that starts broken has to actually get better.
      if (p.items.length) expect(ended, `${p.id} finished worse than it started`).toBeGreaterThanOrEqual(started)
      expect(ended, `${p.id} ends in a state nobody would want`).toBeGreaterThanOrEqual(70)
    })
  }
})

// The clearest thing WebMCP lets a page do: the agent's tool list tells it where it is standing.
describe('a home is several rooms, and the tools follow you between them', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const visible = () => TOOLS.filter(t => !t.when || t.when()).map(t => t.name)

  it('2BHK for four puts two in the first bedroom and one in the second', () => {
    expect(sleepers(4, 2)).toEqual([2, 2])
    expect(sleepers(3, 2)).toEqual([2, 1])
    expect(sleepers(1, 3)).toEqual([1, 0, 0])
    expect(sleepers(7, 3)).toEqual([2, 3, 2])       // nobody sleeps in the hall
    expect(sleepers(4, 1)).toEqual([4])             // one bedroom means one bedroom
  })

  it('builds the rooms a 2BHK actually has, and stands you back to look at it', async () => {
    const r = await freshFlat({ bedrooms: 2, people: 4 })
    expect(r.rooms.map((x: any) => x.id)).toEqual(['hall', 'bed1', 'bed2', 'kitchen', 'bath'])
    expect(r.total_m2).toBeGreaterThan(30)
    // you stand back and look at the whole home first — the same as pressing 2BHK on the landing
    expect(state.here, 'building a home dropped the agent straight into a room').toBeNull()
    expect(r.you_are_in).toMatch(/whole home/)
  })

  it('each room brings its own goal — a bathroom is judged on turning space whether or not you asked', async () => {
    await freshFlat({ bedrooms: 2, people: 4 })
    expect((await run('enter_room', { id: 'bath' })).judged_as).toBe('accessibility')
    expect(state.profile).toBe('accessibility')
    expect(visible(), 'the wheelchair audit should appear by itself in a bathroom').toContain('access_check')
    await run('enter_room', { id: 'bed1' })
    expect(state.profile).toBe('bedroom')
    expect(state.brief).toMatchObject({ people: 2, activity: 'sleep' })
  })

  it('what you did in a room is still there when you come back', async () => {
    await freshFlat({ bedrooms: 1, people: 2 })
    await run('enter_room', { id: 'bed1' })
    const bed = (await run('add_item', { type: 'bed_double' })).item
    await run('enter_room', { id: 'kitchen' })
    expect(state.items.some(i => i.id === bed.id), 'the bed followed us into the kitchen').toBe(false)
    await run('enter_room', { id: 'bed1' })
    expect(state.items.some(i => i.id === bed.id), 'the bed was lost on the way back').toBe(true)
  })

  it('the bedside check exists in a bedroom with a bed, and nowhere else', async () => {
    await freshFlat({ bedrooms: 1, people: 2 })
    await run('enter_room', { id: 'bed1' })
    expect(visible()).not.toContain('bedside_check')      // an empty bedroom has no bedside
    await run('add_item', { type: 'bed_double' })
    expect(visible()).toContain('bedside_check')
    await run('enter_room', { id: 'kitchen' })
    expect(visible()).not.toContain('bedside_check')      // and it is gone again in the kitchen
  })

  it('catches a double bed shoved into a corner, which sleeps one', async () => {
    await freshFlat({ bedrooms: 1, people: 2 })
    await run('enter_room', { id: 'bed1' })
    const bed = (await run('add_item', { type: 'bed_double', x: 0, y: 0 })).item
    const r = await run('bedside_check')
    const b = r.beds.find((x: any) => x.bed === bed.id)
    expect(b.sides_you_can_get_out).toBeLessThan(2)
    expect(b.verdict).toMatch(/climbing over|boxed in/)
  })

  it('the work triangle appears once a kitchen has a hob, and judges the layout', async () => {
    await freshFlat({ bedrooms: 1, people: 2 })
    await run('enter_room', { id: 'kitchen' })
    expect(visible()).not.toContain('work_triangle')
    await run('add_item', { type: 'hob' })
    expect(visible()).toContain('work_triangle')
    expect((await run('work_triangle')).error).toMatch(/sink|fridge/)   // says what is still missing
    await run('add_item', { type: 'sink' }); await run('add_item', { type: 'fridge' })
    const t = await run('work_triangle')
    expect(t.perimeter_cm).toBeGreaterThan(0)
    expect(t.verdict).toMatch(/too tight|too spread out|a kitchen that works/)
  })
})

// The home is the most ambitious thing here and the easiest to see nothing happen in: a judge with no
// agent presses 2BHK and gets five empty rooms. Its scripted session has to actually furnish them.
describe('the home has a session of its own, and it demonstrates the point', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const visible = () => TOOLS.filter(t => !t.when || t.when()).map(t => t.name)

  it('runs end to end and leaves three rooms furnished', async () => {
    await freshFlat({ bedrooms: 2, people: 4 })
    const steps = demoFor('flat')!
    expect(steps.length).toBeGreaterThan(8)
    const seen: string[] = []
    for (const [name, args, note] of steps) {
      expect(note.length, `${name} needs a caption`).toBeGreaterThan(10)
      const out: any = await run(name, args)
      expect(out?.error, `${name} errored: ${out?.error}`).toBeUndefined()
      seen.push(...visible())
    }
    // the three contextual tools each became reachable at some point during the walk
    for (const t of ['bedside_check', 'work_triangle', 'access_check'])
      expect(seen, `${t} never appeared during the session`).toContain(t)

    const home = await run('rooms')
    expect(home.unfurnished.length, 'the session left everything empty').toBeLessThan(home.rooms.length)
    expect(home.rooms.find((r: any) => r.id === 'kitchen').pieces).toBe(4)
  })

  it('adapts to a 1BHK, where there is only one bedroom to walk into', async () => {
    await freshFlat({ bedrooms: 1, people: 2 })
    const steps = demoFor('flat')!
    expect(steps.find(([n, a]) => n === 'enter_room' && (a as any).id === 'bed1')).toBeTruthy()
  })
})

describe('an empty room is not a perfect room', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('does not report a perfect home before anything is in it', async () => {
    await freshFlat({ bedrooms: 2, people: 4 })
    const bare = await run('rooms')
    expect(bare.score_of_the_furnished_rooms, 'nothing is furnished, so there is nothing to score').toBeUndefined()
    expect(bare.unfurnished).toHaveLength(bare.rooms.length)
    expect(bare.note).toMatch(/still empty/)

    await run('enter_room', { id: 'bed1' })
    await run('add_item', { type: 'bed_double' })
    const some = await run('rooms')
    expect(some.score_of_the_furnished_rooms).toBeGreaterThan(0)
    expect(some.unfurnished).not.toContain('Bedroom 1')
  })

  it('every catalogue piece can actually be drawn', () => {
    // a piece with no glyph renders as a floating label and nothing else — which is how the kitchen
    // shipped, and it looked broken
    for (const t of CATALOG_TYPES) expect(Glyph({ type: t, w: CATALOG[t].w, h: CATALOG[t].h }), t).toBeTruthy()
  })
})

// Every other rule here is about how a room feels. This one is about electrocution.
describe('a socket does not belong beside water', () => {
  const wet: Room = { w: 200, h: 220, doors: [{ id: 'd', wall: 'S', pos: 60, width: 75 }], windows: [], outlets: [{ x: 200, y: 40 }] }
  const at = (type: keyof typeof CATALOG, x: number, y: number): Item => ({ id: 'w1', type, x, y, rot: 0, w: CATALOG[type].w, h: CATALOG[type].h })

  it('flags a basin under the socket as an error, not a suggestion', () => {
    const v = check(wet, [at('basin', 140, 20)], 'general')
    const hit = v.find(x => x.rule === 'wet_zone')
    expect(hit, 'a basin 5cm from a socket passed').toBeTruthy()
    expect(hit!.severity).toBe('error')
    expect(hit!.msg).toMatch(/wet zone/)
  })

  it('lets it pass once the fixture is clear of the socket', () => {
    expect(check(wet, [at('basin', 10, 150)], 'general').map(x => x.rule)).not.toContain('wet_zone')
  })

  it('applies whatever the room is being judged as — it is not a matter of taste', () => {
    for (const p of ['general', 'theater', 'office', 'bedroom', 'accessibility'] as const)
      expect(check(wet, [at('bathtub', 30, 20)], p).map(x => x.rule), p).toContain('wet_zone')
  })

  it('covers a kitchen sink too, not just the bathroom', () => {
    expect(check(wet, [at('sink', 150, 30)], 'general').map(x => x.rule)).toContain('wet_zone')
  })
})

// The transcript is what the human reads to know what happened. It said "added a shower" for a shower
// that would not fit, which is how somebody ends up buying one.
describe('the transcript never narrates something that did not happen', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('says nothing when a tool returned an error', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile, brief: null, flat: null, here: null })
    const bad: [string, any][] = [
      ['add_item', { type: 'nonsense' }], ['move_items', { id: 'ghost', x: 10, y: 10 }],
      ['measure', { a: 'ghost', b: 'sofa' }], ['dock_item', { id: 'ghost' }],
      ['enter_room', { id: 'nowhere' }], ['saves', { action: 'load', name: 'nope' }],
      ['work_triangle', {}], ['bedside_check', {}],
    ]
    for (const [n, args] of bad) {
      const out: any = await run(n, args)
      if (!out?.error) continue                       // some of these are legal in some states
      expect(plain(n, args, out), `${n} narrated a failed call: ${plain(n, args, out)}`).toBeNull()
    }
  })

  it('still narrates a refusal, because that DID happen', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile, brief: null, flat: null, here: null })
    const args = { id: 'sofa', x: 0, y: 40, rot: 90 }
    const out = await run('move_items', args)
    expect(out.refused).toBe(true)
    expect(plain('move_items', args, out)).toMatch(/refused/)
  })

  it('a shower that does not fit is not reported as added', async () => {
    await freshFlat({ bedrooms: 1, people: 2 })
    await run('enter_room', { id: 'bath' })
    await run('add_item', { type: 'toilet', prefer: 'wall' })
    await run('add_item', { type: 'basin', prefer: 'wall' })
    const args = { type: 'shower', prefer: 'wall' }
    const out: any = await run('add_item', args)
    if (out.error) expect(plain('add_item', args, out)).toBeNull()
    else expect(state.items.some(i => i.type === 'shower')).toBe(true)
  })
})

// The bathroom is the room where accessibility actually decides whether someone can live somewhere,
// and the audit used to find nothing there because its idea of a destination was a sofa.
describe('the wheelchair audit works in the room it matters most in', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('treats a toilet and a basin as places you have to get to', async () => {
    await freshFlat({ bedrooms: 1, people: 2 })
    await run('enter_room', { id: 'bath' })
    expect((await run('access_check')).verdict).toBe('nothing to reach yet')
    await run('add_item', { type: 'toilet', prefer: 'wall' })
    await run('add_item', { type: 'basin', prefer: 'wall' })
    const a = await run('access_check')
    expect(a.verdict, 'a bathroom with a toilet in it still had nothing to audit').not.toBe('nothing to reach yet')
    expect(a.routes.map((r: any) => r.label)).toContain('Toilet')
    expect(a.turning_circles.length).toBeGreaterThan(0)
  })

  it('counts a worktop and a fridge too — a kitchen is somewhere you stand', async () => {
    await freshFlat({ bedrooms: 1, people: 2 })
    await run('enter_room', { id: 'kitchen' })
    await run('add_item', { type: 'counter', prefer: 'wall' })
    await run('set_profile', { profile: 'accessibility' })
    expect((await run('access_check')).routes.map((r: any) => r.label)).toContain('Worktop')
  })
})

// The claim check is the one place on this page whose entire job is to be trustworthy about numbers.
describe('a claim the page cannot check is never printed as a number', () => {
  const load = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile, brief: null, flat: null, here: null, notes: [] }) }

  it('never renders NaN at the human', () => {
    load()
    for (const bad of [{}, { value: undefined }, { value: 'sixty' }, { value: NaN }, { value: Infinity }] as any[]) {
      const r = verify({ kind: 'gap', a: 'chair_a', b: 'sofa', ...bad }) as any
      expect(r.error, `${JSON.stringify(bad)} produced a verdict instead of an error`).toBeTruthy()
      expect(JSON.stringify(r)).not.toMatch(/NaN/)
    }
  })

  it('takes the number however the agent wrote it', () => {
    load()
    const a = verify({ kind: 'gap', a: 'chair_a', b: 'sofa', value: 62 } as any) as any
    const b = verify({ kind: 'gap', a: 'chair_a', b: 'sofa', cm: 62 } as any) as any
    expect(a.said).toBe(62)
    expect(b.said, '`cm` is what an agent naturally writes for a gap').toBe(62)
  })

  it('still corrects a wrong number in public', () => {
    load()
    const v = verify({ kind: 'gap', a: 'chair_a', b: 'sofa', value: 62 } as any) as any
    expect(v.ok).toBe(false)
    expect(v.text).toMatch(/not quite — the clear gap between .* and .* is \d+cm, not 62cm/)
    // it has to read as a sentence: this line is the page's one claim to being trustworthy about
    // numbers, and it used to say "clear gap Armchair and Sofa is 115cm"
    expect(v.text).toContain('between')
  })
})

// Adding a lamp made the score go DOWN: the page put it in the nearest free rectangle and then told
// the agent off for it being adrift. Being penalised for asking the page to choose is perverse.
describe('a piece the page places itself lands where that piece belongs', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const sc = () => score(check(state.room, state.items, state.profile, undefined, state.hour, state.brief))
  const load = () => { const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })), profile: p.profile,
      hour: 9, brief: null, notes: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, flat: null, here: null }) }

  it('docks a lamp to a seat instead of dropping it in free space', async () => {
    load()
    const r = await run('add_item', { type: 'lamp' })
    expect(r.placed_for_you, 'the lamp was not docked to anything').toMatch(/docked to/)
    const adrift = check(state.room, state.items, state.profile, undefined, state.hour, state.brief)
      .find(v => v.rule === 'pairing' && v.items.includes(r.item.id))
    expect(adrift, `the lamp it just placed was immediately called adrift: ${adrift?.msg}`).toBeUndefined()
  })

  it('adding a lamp does not make the room score worse', async () => {
    load()
    const before = sc()
    await run('add_item', { type: 'lamp' })
    expect(sc(), 'the room got worse for gaining a light it needed').toBeGreaterThanOrEqual(before)
  })

  it('an explicit prefer still wins — the agent can overrule the page', async () => {
    load()
    const r = await run('add_item', { type: 'lamp', prefer: 'corner' })
    expect(r.placed_for_you).not.toMatch(/docked to/)
  })

  it('falls back to a free spot when there is no host to dock to', async () => {
    load()
    await run('remove_item', { id: 'sofa', keep: true }); await run('remove_item', { id: 'chair_a', keep: true })
    await run('remove_item', { id: 'chair_b', keep: true })
    const r = await run('add_item', { type: 'lamp' })
    expect(r.item).toBeTruthy()
    expect(r.placed_for_you).toMatch(/the page chose/)
  })
})

// The app wrote ?preset=flat into the address bar itself, and then reloading it landed on the front
// page with no home — so a bookmark, a refresh or a link to your own 2BHK gave you nothing.
describe('a home has an address that brings it back', () => {
  it('survives the round trip, extras and all', () => {
    for (const [b, p, x] of [[1, 2, []], [2, 4, []], [3, 5, ['study']], [4, 8, ['study', 'balcony']]] as const) {
      const f = buildFlat(b, p, x as never)
      expect(homeParam(f)).toBe(`${b}b${p}p${x.map(k => `-${k}`).join('')}`)
      const back = homeFromParam(homeParam(f))!
      expect(back.rooms.map(r => r.id)).toEqual(f.rooms.map(r => r.id))
      expect(back.name).toBe(f.name)
    }
  })

  it('refuses an address it cannot rebuild, rather than half-building one', () => {
    for (const bad of ['', 'flat', '2b', '4p', '2b4p-kitchen', '2b4px', 'nb4p', '2b999p'])
      expect(homeFromParam(bad), bad).toBeNull()
  })
})

// An eight-room flat came out 1164 wide and 1296 tall — a tower, with the hall floating above a void.
describe('a home is laid out like a home', () => {
  it('never comes out taller than it is wide', () => {
    for (const [beds, people, extras] of [[1, 2, []], [2, 4, []], [3, 5, []], [3, 5, ['study', 'balcony']], [4, 8, ['study']]] as const) {
      const f = buildFlat(beds, people, extras as any)
      const { w, h } = flatSize(f)
      expect(w, `${beds}BHK with ${f.rooms.length} rooms is ${w}×${h} — taller than it is wide`).toBeGreaterThanOrEqual(h)
    }
  })

  it('keeps every room inside the envelope and out of every other room', () => {
    const f = buildFlat(3, 5, ['study', 'balcony'])
    for (const a of f.rooms) {
      expect(a.x).toBeGreaterThanOrEqual(0); expect(a.y).toBeGreaterThanOrEqual(0)
      for (const b of f.rooms) {
        if (a === b) continue
        const apart = a.x + a.room.w <= b.x || b.x + b.room.w <= a.x || a.y + a.room.h <= b.y || b.y + b.room.h <= a.y
        expect(apart, `${a.name} and ${b.name} overlap`).toBe(true)
      }
    }
  })
})

// Every structural bug this session came from a case assumed to be fine. These are the shapes an
// agent actually sends when it is confused: the wrong type, a negative, a fraction, nothing at all.
describe('the home tools survive an agent having a bad day', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('builds something sane from any number of bedrooms and people', async () => {
    for (const a of [{ bedrooms: 0, people: 0 }, { bedrooms: -5, people: -2 }, { bedrooms: 99, people: 999 },
                     { bedrooms: 1.7, people: 2.4 }, { bedrooms: 'two', people: 'four' }, { bedrooms: NaN, people: NaN },
                     { bedrooms: 4, people: 1 }, { bedrooms: 1, people: 12 }, { bedrooms: Infinity, people: 3 }] as any[]) {
      const r = await freshFlat(a)
      expect(r.error, `${JSON.stringify(a)} errored`).toBeUndefined()
      const beds = state.flat!.rooms.filter(x => x.kind === 'bedroom')
      expect(beds.length, `${JSON.stringify(a)} produced ${beds.length} bedrooms`).toBeGreaterThanOrEqual(1)
      expect(beds.length).toBeLessThanOrEqual(4)
      expect(beds.reduce((t, b) => t + b.people, 0), 'somebody has nowhere to sleep').toBeGreaterThanOrEqual(1)
      for (const b of beds) expect(Number.isInteger(b.people)).toBe(true)
      const { w, h } = flatSize(state.flat!)
      expect(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0).toBe(true)
    }
  })

  it('ignores nonsense in extras rather than building a room out of it', async () => {
    await freshFlat({ bedrooms: 2, people: 4, extras: ['study', 'study', 'nope', 123] })
    const kinds = state.flat!.rooms.map(r => r.kind)
    expect(kinds).toContain('study')
    expect(kinds.every(k => ['hall', 'bedroom', 'kitchen', 'bath', 'study', 'balcony'].includes(k))).toBe(true)
    await freshFlat({ bedrooms: 2, people: 4, extras: 'study' })   // a string, not a list
    expect(state.flat!.rooms.every(r => r.name.length > 0)).toBe(true)
  })

  it('names the room it cannot find without echoing an essay back', async () => {
    await freshFlat({ bedrooms: 1, people: 2 })
    for (const id of [123, '../hall', 'hall/../bath', 'x'.repeat(500)] as any[]) {
      const r = await run('enter_room', { id })
      expect(r.error).toMatch(/no room called/)
      expect(r.error.length, 'the error echoed the whole argument back').toBeLessThan(80)
    }
    // nothing at all is a different mistake from a name that does not exist, and "no room called
    // undefined" is the page reading its own variable out to the agent
    for (const id of ['', null, undefined] as any[]) {
      const e = (await run('enter_room', { id })).error
      expect(e, `${JSON.stringify(id)} read its own variable out to the agent`).not.toMatch(/undefined|null/)
      expect(e, `${JSON.stringify(id)} does not ask which room`).toMatch(/which room/)
    }
  })

  it('tells a full shelf apart from a browser that will not store anything', async () => {
    expect((await run('saves', { action: 'nope' })).error).toMatch(/unknown action/)
    expect((await run('saves', { action: 'save' })).error).toMatch(/give a name to save/)
  })
})

// A home is several rooms. Saving and sharing both predate it and both captured only the one room you
// happened to be standing in — four rooms lost, silently, with the save reporting success.
describe('a home survives being saved and being sent', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  const away = () => set({ flat: null, here: null, presetId: null, items: [], notes: [], history: [], proposals: [] })
  const build = async () => {
    await freshFlat({ bedrooms: 2, people: 4 })
    await run('enter_room', { id: 'bed1' }); await run('add_item', { type: 'bed_double' })
    await run('enter_room', { id: 'kitchen' }); await run('add_item', { type: 'hob' })
    await run('enter_room', { id: 'hall' }); await run('add_item', { type: 'sofa' })
  }

  it('saving a 2BHK saves the 2BHK, not the room you were standing in', async () => {
    await build()
    expect((await run('saves', { action: 'save', name: 'home' })).saved).toBe('home')
    away()                                                   // walk away entirely
    expect(state.flat).toBeNull()

    const back = await run('saves', { action: 'load', name: 'home' })
    expect(back.error).toBeUndefined()
    expect(state.flat, 'the home did not come back at all').toBeTruthy()
    expect(state.flat!.rooms).toHaveLength(5)
    const furnished = state.flat!.rooms.filter(r => r.items.length)
    expect(furnished.map(r => r.id).sort(), 'rooms lost their furniture').toEqual(['bed1', 'hall', 'kitchen'])
    await run('saves', { action: 'delete', name: 'home' })
  })

  it('saving from the whole-home view does not save an empty room', async () => {
    await build()
    leaveRoom()                       // the real way out — it stows what you were working on
    await run('saves', { action: 'save', name: 'whole' })
    away()
    await run('saves', { action: 'load', name: 'whole' })
    expect(state.flat!.rooms.filter(r => r.items.length).length).toBe(3)
    await run('saves', { action: 'delete', name: 'whole' })
  })

  // The page's whole stance is that it does not report what it did not do, and it was doing exactly
  // that in two places.
  it('does not claim to have deleted a save that was never there', async () => {
    const r = await run('saves', { action: 'delete', name: 'never existed' })
    expect(r.deleted, 'reported a delete it did not do').toBeUndefined()
    expect(r.error).toMatch(/no save called/)
  })

  it('asks which room instead of reading out its own variable', async () => {
    await build()
    const r = await run('enter_room', {})
    expect(r.error, 'said "no room called undefined" to the agent').toMatch(/^which room\?/)
    // and it names the argument, because "give an id" beside a list of ids is what an agent that
    // passed {room:'bed1'} was already reading
    expect(r.error, 'it asks for an id without saying which key that is').toMatch(/`id`/)
    expect(r.rooms).toContain('kitchen')
  })

  // The sheet a home prints is a cover plus a page per room, and standing back to look at the whole
  // home was the one place the tool to print it disappeared.
  it('can still print the plan from the whole home', async () => {
    await build()
    leaveRoom()
    expect(state.items, 'standing in no room means nothing in hand').toHaveLength(0)
    expect(TOOLS.find(t => t.name === 'plan_sheet')!.when!(), 'no way to print a furnished home').toBe(true)
    // and the tools that edit one room are correctly gone, because there is no room to edit
    expect(TOOLS.find(t => t.name === 'arrange')!.when!()).toBe(false)
  })

  it('a link to a 2BHK arrives as a 2BHK', async () => {
    await build()
    const url = (await run('share', {})).url
    const hash = url.slice(url.indexOf('#l=') + 3)
    away()
    expect(loadShare(hash)).toBe(true)
    expect(state.flat, 'the link arrived as a single room').toBeTruthy()
    expect(state.flat!.rooms).toHaveLength(5)
    expect(state.flat!.rooms.find(r => r.id === 'kitchen')!.items.some(i => i.type === 'hob')).toBe(true)
  })

  it('keeps the study and the balcony, which the link used to drop', async () => {
    await freshFlat({ bedrooms: 3, people: 5, extras: ['study', 'balcony'] })
    await run('enter_room', { id: 'study' }); await run('add_item', { type: 'desk' })
    const url = (await run('share', {})).url
    away()
    expect(loadShare(url.slice(url.indexOf('#l=') + 3))).toBe(true)
    const kinds = state.flat!.rooms.map(r => r.kind)
    expect(kinds, 'the study was dropped in transit').toContain('study')
    expect(kinds, 'the balcony was dropped in transit').toContain('balcony')
    expect(state.flat!.rooms.find(r => r.id === 'study')!.items).toHaveLength(1)
  })

  it('does not send the walls, which the other end rebuilds anyway', async () => {
    await freshFlat({ bedrooms: 3, people: 5, extras: ['study', 'balcony'] })
    await run('enter_room', { id: 'bed1' }); await run('add_item', { type: 'bed_double' })
    const r = await run('share', {})
    const decoded = JSON.parse(decodeURIComponent(escape(atob(r.url.slice(r.url.indexOf('#l=') + 3)))))
    expect(JSON.stringify(decoded.f), 'the link is carrying room shapes it will throw away').not.toMatch(/doors|windows|outlets/)
    // and only rooms with something in them are worth a byte
    expect(decoded.f.r.every((x: any) => x.i.length)).toBe(true)
  })

  it('warns when a link is long enough to be cut by whatever it is pasted into', async () => {
    await freshFlat({ bedrooms: 3, people: 5 })
    for (const id of ['hall', 'bed1', 'bed2', 'bed3', 'kitchen']) {
      await run('enter_room', { id })
      for (let k = 0; k < 8; k++) await run('add_item', { type: 'chair' })
    }
    const r = await run('share', {})
    if (r.length > 2000) expect(r.long).toMatch(/chat apps, QR codes/)
    else expect(r.long).toBeUndefined()
  })

  it('a hand-edited link cannot inject a room the page has never seen', async () => {
    const evil = btoa(unescape(encodeURIComponent(JSON.stringify({
      r: { w: 400, h: 400, doors: [], windows: [], outlets: [] }, i: [], p: 'general', h: 9,
      f: { name: 'x', bedrooms: 1, people: 1, rooms: [{ id: 'nope', name: '<script>', kind: 'vault', people: 9,
        x: -999, y: -999, room: { w: 99999, h: 99999, doors: [], windows: [], outlets: [] }, items: [] }] },
    }))))
    expect(loadShare(evil)).toBe(true)
    for (const r of state.flat?.rooms ?? []) {
      expect(['hall', 'bedroom', 'kitchen', 'bath', 'study', 'balcony']).toContain(r.kind)
      expect(r.room.w).toBeLessThan(2000)
      expect(r.x).toBeGreaterThanOrEqual(0)
    }
  })
})

// The resume card and the room's memory both predate the home too.
describe('coming back to a home', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any
  const away = () => set({ flat: null, here: null, presetId: null, items: [], notes: [] })

  it('offers a furnished home back even when you left it on the whole-home view', async () => {
    forgetSession()
    await freshFlat({ bedrooms: 2, people: 4 })
    await run('enter_room', { id: 'bed1' }); await run('add_item', { type: 'bed_double' })
    leaveRoom()
    rememberSession()

    const last = lastSession()
    expect(last, 'a furnished 2BHK looked like nothing to come back to').toBeTruthy()
    expect(last!.flat!.rooms.filter(r => r.items.length)).toHaveLength(1)

    away()
    expect(restore(last)).toBe(true)
    expect(state.flat!.rooms.find(r => r.id === 'bed1')!.items).toHaveLength(1)
    forgetSession()
  })

  it('offers it back even with no current room at all, if a room is furnished', async () => {
    forgetSession()
    await freshFlat({ bedrooms: 2, people: 4 })
    await run('enter_room', { id: 'bed1' }); await run('add_item', { type: 'bed_double' })
    leaveRoom()
    set({ items: [] })            // nothing on screen; the work lives in the flat
    rememberSession()
    expect(lastSession(), 'a furnished 2BHK looked like nothing to come back to').toBeTruthy()
    forgetSession()
  })

  it('still refuses to offer an untouched session back', async () => {
    forgetSession()
    await freshFlat({ bedrooms: 1, people: 1 })
    leaveRoom(); set({ items: [] }); rememberSession()
    expect(lastSession(), 'an untouched home is not work to resume').toBeNull()
    forgetSession()
  })

  it('two identical bedrooms do not share one memory', async () => {
    await freshFlat({ bedrooms: 2, people: 4 })
    await run('enter_room', { id: 'bed1' })
    const a = state.room, keyA = `${a.w}x${a.h}`
    await run('enter_room', { id: 'bed2' })
    // the shells are identical, which is exactly why the memory key needed the room's own id in it
    expect(`${state.room.w}x${state.room.h}`).toBe(keyA)
    expect(state.here).toBe('bed2')
  })
})

// layouts is the agent's scratch space for showing option A against option B. It stores a bare list
// of furniture with no idea which room that furniture belongs to.
describe('options belong to the room they were drawn for', () => {
  const run = (n: string, a: any = {}) => TOOLS.find(t => t.name === n)!.run(a) as any

  it('never carries one room\'s furniture into another', async () => {
    await freshFlat({ bedrooms: 2, people: 4 })
    await run('enter_room', { id: 'bed1' })
    await run('add_item', { type: 'bed_double' })
    await run('layouts', { save: 'A' })

    await run('enter_room', { id: 'kitchen' })
    expect((await run('layouts', {})).layouts, 'the bedroom\'s options followed us into the kitchen').toEqual([])
    await run('add_item', { type: 'hob' })
    expect((await run('layouts', { load: 'A' })).error).toBeTruthy()
    expect(state.items.some(i => i.type === 'bed_double'), 'a bed teleported into the kitchen').toBe(false)
  })

  it('and is still there when you walk back in', async () => {
    await freshFlat({ bedrooms: 2, people: 4 })
    await run('enter_room', { id: 'bed1' })
    await run('add_item', { type: 'bed_double' })
    await run('layouts', { save: 'A' })
    await run('enter_room', { id: 'kitchen' })
    await run('enter_room', { id: 'bed1' })
    expect((await run('layouts', {})).layouts, 'the option the agent saved was quietly thrown away').toEqual(['A'])
    expect((await run('layouts', { load: 'A' })).loaded).toBe('A')
    expect(state.items.some(i => i.type === 'bed_double')).toBe(true)
  })
})

// Every write used to be try/catch/ignore. A browser that has stopped accepting anything looks
// exactly like one that is working, and the human finds out when they come back and it is gone.
describe('storing things properly', () => {
  const real = globalThis.localStorage

  const fake = (opts: { full?: boolean } = {}) => {
    const map = new Map<string, string>()
    Object.assign(globalThis, { localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { if (opts.full) throw new DOMException('quota', 'QuotaExceededError'); map.set(k, v) },
      removeItem: (k: string) => void map.delete(k),
      get length() { return map.size },
      key: (i: number) => [...map.keys()][i] ?? null,
    } })
    Object.defineProperty(globalThis.localStorage, Symbol.iterator, { value: undefined })
    return map
  }
  const restoreLs = () => Object.assign(globalThis, { localStorage: real })

  it('says so when the browser refuses, instead of pretending it saved', async () => {
    fake({ full: true })
    set({ storage: 'ok' })
    expect(saveRoom('anything')).not.toBe('ok')
    expect(state.storage, 'the page still believed everything was fine').not.toBe('ok')
    restoreLs()
  })

  // "there are already 12 rooms on this device. Delete one first." — with nothing on the shelf. A
  // full shelf and a browser that will not write are two different problems with two different fixes.
  it('does not blame a full shelf when the browser is the one refusing', async () => {
    const map = fake()
    map.set('room.last', '{}')           // something in storage, so it is a quota failure, not private mode
    set({ storage: 'ok' })
    ;(globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void }).setItem =
      () => { throw new DOMException('quota', 'QuotaExceededError') }
    expect(saveRoom('anything'), 'told the human to delete saves they do not have').toBe('blocked')
    const r = await (TOOLS.find(t => t.name === 'saves')!.run({ action: 'save', name: 'anything' }) as any)
    expect(r.error).not.toMatch(/already \d+ rooms/)
    expect(r.error).toMatch(/will not let the page store anything/)
    restoreLs()
  })

  // "The refusal is remembered in localStorage so the next agent that opens the room reads it before
  // it starts." Both halves were tested — a rejection writes a lesson, storage survives junk — and
  // the join between them, which is the actual claim, was not.
  it('a refusal this session is waiting for the next agent that opens the room', async () => {
    fake()
    set({ storage: 'ok' })
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    const open = () => set({ presetId: p.id, here: null, room: JSON.parse(JSON.stringify(p.room)),
      items: p.items.map(i => ({ ...i })), profile: p.profile, hour: 9, learned: [], notes: [], history: [], proposals: [], flat: null })

    open()
    await (TOOLS.find(t => t.name === 'move_items')!.run({ id: 'plant', x: 20, y: 20, propose: true, why: 'nearer the window' }) as any)
    rejectProposal(state.proposals[0].id, 'it will not get any light there')
    expect(state.learned.length, 'the refusal was never written down').toBeGreaterThan(0)

    // a different agent, a fresh page, the same room
    open()
    expect(state.learned, 'a reload forgot what the human taught it').toHaveLength(0)
    loadLearned()
    const seen = (TOOLS.find(t => t.name === 'get_room')!.run({}) as any).learned as string[]
    expect(seen, 'the next agent was never told').toBeTruthy()
    expect(seen.join(' ')).toMatch(/rejected moving the plant/)
    expect(seen.join(' '), 'kept the move but dropped the reason they gave').toMatch(/not get any light/)
    restoreLs()
  })

  it('does not keep a memory for every room ever opened', async () => {
    const map = fake()
    set({ storage: 'ok' })
    // 60 different rooms, each leaving a memory behind
    for (let i = 0; i < 60; i++) {
      set({ presetId: `p${i}`, here: null, room: { w: 300 + i, h: 300, doors: [], windows: [], outlets: [] }, learned: [] })
      learn(`lesson ${i}`)
    }
    const before = [...map.keys()].filter(k => k.startsWith('room.learned.')).length
    expect(before).toBeGreaterThan(40)
    // a write that does not fit prunes the coldest rooms and gets through
    Object.assign(globalThis.localStorage, { setItem(k: string, v: string) {
      if ([...map.keys()].filter(x => x.startsWith('room.learned.')).length > 30) throw new DOMException('quota', 'QuotaExceededError')
      map.set(k, v)
    } })
    set({ presetId: 'new', room: { w: 999, h: 300, doors: [], windows: [], outlets: [] }, learned: [] })
    learn('the newest lesson')
    const after = [...map.keys()].filter(k => k.startsWith('room.learned.')).length
    expect(after, 'nothing was pruned, so the store stays full for ever').toBeLessThan(before)
    restoreLs()
  })

  it('ignores whatever an older version of the page left behind', () => {
    const map = fake()
    set({ presetId: 'junk', here: null, room: { w: 400, h: 400, doors: [], windows: [], outlets: [] } })
    for (const junk of ['"a string"', '{"not":"a list"}', '[1,2,3]', 'null', 'not json']) {
      map.set([...map.keys()].find(k => k.startsWith('room.learned.')) ?? 'room.learned.x', junk)
      loadLearned()
      expect(Array.isArray(state.learned), `${junk} became state.learned`).toBe(true)
    }
    restoreLs()
  })
})

// This project argues that a wheelchair user should be able to get around a room. A page making that
// argument had better be usable without a mouse and without sight.
describe('the page itself is reachable', () => {
  it('describes the floor plan for somebody who cannot see it', () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    const v = check(p.room, p.items, 'accessibility')
    const said = describePlan(p.room, p.items, v)
    expect(said).toMatch(/^Floor plan\. 420 by 360 centimetres/)
    expect(said).toMatch(/1 door, 2 windows/)
    for (const word of ['sofa', 'armchair', 'tv unit']) expect(said.toLowerCase()).toContain(word)
    expect(said, 'a plan with problems in it should say so').toMatch(/problem/)
  })

  it('says an empty room is empty rather than listing nothing', () => {
    const said = describePlan({ w: 300, h: 300, doors: [], windows: [], outlets: [] }, [], [])
    expect(said).toContain('Empty')
    expect(said).toContain('Every rule passes')
  })
})

// Found by reading a session rather than a function: the accessibility beat printed "no 150cm turning
// circle beside the sofa (sofa)". Every other message goes through name(), which drops an id that is
// only the label again — this one built its own. One call site not using the shared helper, which is
// the same shape as getItem resolving an id that updateItem then could not.
it('the turning circle message names a piece the way every other message does', () => {
  const p = PRESETS.find(x => x.id === 'dad-visits')!
  const all = check(p.room, p.items, 'accessibility')
  const v = all.find(x => x.rule === 'turning_circle' && x.items.includes('sofa'))
  expect(v, `dad-visits under accessibility no longer strands the sofa: ${all.map(x => x.rule).join(', ')}`).toBeTruthy()
  expect(v!.msg, 'said "the sofa (sofa)"').not.toMatch(/\(sofa\)/)
  expect(v!.msg, 'stopped naming the piece at all').toContain('sofa')
})
