import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { describePlan } from './Plan'
import { spec, type ItemType } from './catalog'
import { fixture } from './light'
import { sun as solar, windowSun } from './sun'
import { hasTwin, footprint, center, front, type Violation } from './rules'
import { answerNote, humanEvent, push, set, state, subscribe, updateItem } from './store'

// cm → scene units (1 unit = 10cm)
const U = 0.1
/** rough blackbody colour for a fixture's kelvin */
function kelvinToRGB(k: number) { const t = Math.max(0, Math.min(1, (k - 2200) / 2800)); const r = 255, g = Math.round(150 + 85 * t), b = Math.round(60 + 175 * t); return (r << 16) | (g << 8) | b }

const FAB = 0x3b4259, WOOD = 0x6e5542, DARK = 0x1c2029, LINEN = 0x9aa2b5, GREEN = 0x3e8a5c, GLASS = 0x7fc7ff

/** build one furniture group centred at origin, unrotated, footprint w×h (cm), front = +z */
function buildItem(type: ItemType, w: number, h: number): THREE.Group {
  const g = new THREE.Group()
  const box = (sx: number, sy: number, sz: number, color: number, x = 0, y = 0, z = 0, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx * U, sy * U, sz * U), new THREE.MeshStandardMaterial({ color, roughness: .8, ...opts }))
    m.position.set(x * U, (y + sy / 2) * U, z * U); m.castShadow = m.receiveShadow = true; g.add(m); return m
  }
  const cyl = (r: number, hh: number, color: number, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * U, r * U, hh * U, 20), new THREE.MeshStandardMaterial({ color, roughness: .7 }))
    m.position.set(x * U, (y + hh / 2) * U, z * U); m.castShadow = m.receiveShadow = true; g.add(m); return m
  }
  switch (type) {
    case 'sofa': case 'armchair': {
      const arm = type === 'sofa' ? 16 : 14
      box(w, 40, h, FAB)                                   // base
      box(w, 45, 18, 0x4a5270, 0, 40, -h / 2 + 9)          // back rest
      box(arm, 20, h, 0x4a5270, -w / 2 + arm / 2, 40, 0)
      box(arm, 20, h, 0x4a5270, w / 2 - arm / 2, 40, 0)
      const n = type === 'sofa' ? Math.max(2, Math.round(w / 65)) : 1, cw = (w - 2 * arm) / n
      for (let i = 0; i < n; i++) box(cw - 6, 8, h - 24, 0x59627f, -w / 2 + arm + cw * (i + .5), 40, 6)
      break
    }
    case 'tv_unit':
      box(w, 50, h, WOOD)
      box(w * .8, 4, 6, DARK, 0, 50, h / 2 - 8)                              // stand
      box(w * .85, 70, 3, DARK, 0, 54, h / 2 - 8, { roughness: .3 })         // screen
      box(w * .82, 64, 1, 0xf5b544, 0, 57, h / 2 - 6, { emissive: 0xf5b544, emissiveIntensity: .35 })
      break
    case 'desk':
      box(w, 4, h, WOOD, 0, 72, 0)
      box(6, 72, h - 10, 0x5b4636, -w / 2 + 5, 0, 0); box(6, 72, h - 10, 0x5b4636, w / 2 - 5, 0, 0)
      box(60, 36, 2, DARK, 0, 84, -h / 2 + 12, { roughness: .3 }); box(10, 8, 6, DARK, 0, 76, -h / 2 + 12)
      box(50, 2, 14, DARK, 0, 76, h / 2 - 20)
      break
    case 'chair':
      cyl(w / 2 - 2, 3, DARK, 0, 0, 0); cyl(3, 42, DARK, 0, 3, 0)
      box(w - 8, 8, h - 8, FAB, 0, 45, 0); box(w - 12, 40, 6, 0x4a5270, 0, 53, -h / 2 + 7)
      break
    case 'bed_double': case 'bed_single': {
      box(w, 30, h, WOOD); box(w - 6, 22, h - 6, LINEN, 0, 30, 0)
      box(w, 50, 6, 0x5b4636, 0, 0, -h / 2 + 3)                                // headboard
      const dbl = type === 'bed_double', pw = dbl ? (w - 22) / 2 : w - 20
      box(pw - 2, 12, 30, 0xc3c9d8, dbl ? -pw / 2 - 4 : 0, 52, -h / 2 + 24)
      if (dbl) box(pw - 2, 12, 30, 0xc3c9d8, pw / 2 + 4, 52, -h / 2 + 24)
      box(w - 8, 10, h - 60, FAB, 0, 52, 26)
      break
    }
    // bathroom
    case 'toilet': box(w, 40, h * .7, 0xa6adc0, 0, 0, h * .15); box(w, 75, h * .28, 0xa6adc0, 0, 0, -h * .36); break
    case 'basin': box(w, 82, h, 0xa6adc0); box(w - 12, 6, h - 12, 0x39404f, 0, 82); break
    case 'shower': box(w, 6, h, 0x2f3644); box(3, 200, 3, 0x9aa3b8, -w / 2 + 10, 0, -h / 2 + 10); break
    case 'bathtub': box(w, 55, h, 0xa6adc0); box(w - 16, 6, h - 16, 0x39404f, 0, 50); break
    // kitchen: worktop height is 90cm, and a fridge is a wardrobe that hums
    case 'counter': box(w, 88, h, WOOD); box(w + 2, 4, h + 2, 0x8f97ab, 0, 88); break
    case 'sink': box(w, 88, h, WOOD); box(w - 14, 5, h - 14, 0x39404f, 0, 88); box(3, 22, 3, 0x9aa3b8, 0, 99, -h / 2 + 8); break
    case 'hob': box(w, 88, h, WOOD); box(w - 6, 4, h - 6, 0x1c2029, 0, 88); break
    case 'fridge': box(w, 175, h, 0xa6adc0); box(w - 6, 3, 2, 0x8f97ab, 0, 118, h / 2); box(3, 30, 3, 0x1c2029, w / 2 - 8, 140, h / 2); break
    case 'wardrobe': box(w, 200, h, WOOD); box(w - 8, 190, 2, 0x5b4636, 0, 5, h / 2); box(2, 16, 3, 0x9aa3b8, -6, 95, h / 2 + 1); box(2, 16, 3, 0x9aa3b8, 6, 95, h / 2 + 1); break
    case 'bookshelf': {
      box(w, 180, h, WOOD)
      const colors = [0xb86b4b, 0x6b8fb8, 0xb8a04b, 0x7ab87a, 0x8b6bb8, 0xb8b8b8]
      for (let shelf = 0; shelf < 4; shelf++) for (let x = -w / 2 + 6, i = 0; x < w / 2 - 8; x += 7.5, i++) box(6, 28 - (i % 3) * 3, h - 6, colors[(i + shelf) % colors.length], x + 3, 12 + shelf * 42, 1)
      break
    }
    case 'dining_table': box(w, 4, h, WOOD, 0, 71, 0); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(6, 71, 6, 0x5b4636, x * (w / 2 - 8), 0, z * (h / 2 - 8)); break
    case 'coffee_table': box(w, 3, h, GLASS, 0, 42, 0, { transparent: true, opacity: .55, roughness: .1 }); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(4, 42, 4, DARK, x * (w / 2 - 6), 0, z * (h / 2 - 6)); break
    case 'plant': { cyl(w / 2 - 4, 30, 0x3a2f28); const s = new THREE.Mesh(new THREE.SphereGeometry(w * .6 * U, 16, 12), new THREE.MeshStandardMaterial({ color: GREEN, roughness: .9 })); s.position.y = 75 * U; s.castShadow = true; g.add(s); break }
    case 'lamp': { cyl(w / 2, 3, DARK); cyl(1.5, 140, 0x9aa3b8, 0, 3, 0); const sh = cyl(18, 30, 0xf5d78a, 0, 130, 0); (sh.material as THREE.MeshStandardMaterial).emissive.set(0xf5b544); (sh.material as THREE.MeshStandardMaterial).emissiveIntensity = .6; const l = new THREE.PointLight(0xf5c37a, 6, 40, 1.6); l.position.y = 140 * U; g.add(l); break }
    case 'rug': box(w, 1.5, h, 0x2a3040, 0, 0, 0, { roughness: 1 }); break
    case 'ceiling_light': case 'pendant': case 'spotlight_bar': case 'chandelier': case 'downlights': case 'cove_strip': case 'wall_sconce': case 'track_light': {
      const f = fixture(type), col = kelvinToRGB(f.kelvin), H = f.height
      const drop = type === 'pendant' ? 22 : type === 'chandelier' ? 30 : 10
      if (type === 'pendant' || type === 'chandelier') cyl(.8, 250 - H, 0x9aa3b8, 0, H, 0)
      const emis = (m: THREE.Mesh, i = 1) => { const s = m.material as THREE.MeshStandardMaterial; s.emissive.setHex(col); s.emissiveIntensity = i; s.color.setHex(col) }
      const addLight = (x: number, z: number, power: number, dist_: number) => {
        const l = new THREE.PointLight(col, power, dist_ * U * 10, 1.7); l.position.set(x * U, (H - drop - 3) * U, z * U); g.add(l); return l
      } // ponytail: point lights never cast shadows — 6 cube passes each would tank the frame rate
      if (type === 'downlights') { for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { emis(cyl(9, 4, col, dx * w / 3, H - 6, dz * h / 3), 1.1); addLight(dx * w / 3, dz * h / 3, 45, f.reach) } }
      else if (type === 'cove_strip') { emis(box(w, 4, h, col, 0, H - 6, 0), .8); const l = addLight(0, 0, 40, f.reach); l.position.y = (H - 2) * U }
      else if (type === 'track_light' || type === 'spotlight_bar') { box(w, 6, Math.max(h, 8), 0x2a2f3c, 0, H - 8, 0); for (const t of [-0.33, 0, 0.33]) { emis(cyl(5, 7, col, w * t, H - 16, 0), 1.2); addLight(w * t, 0, 28, f.reach) } }
      else if (type === 'wall_sconce') { emis(box(w, 22, h, col, 0, H - 22, 0), .9); addLight(0, 0, 30, f.reach) }
      else if (type === 'chandelier') { emis(cyl(w / 3, 14, col, 0, H - drop, 0), .7); for (const a of [0, 72, 144, 216, 288]) { const r = w / 2.4; emis(cyl(4.5, 10, col, Math.cos(a * Math.PI / 180) * r, H - drop - 6, Math.sin(a * Math.PI / 180) * r), 1.3) } addLight(0, 0, 70, f.reach) }
      else { emis(cyl(w / 2, drop, col, 0, H - drop, 0), 1); addLight(0, 0, type === 'pendant' ? 60 : 110, f.reach) }
      break
    }
  }
  return g
}

/** dispose everything under an object and detach it — geometries, materials, shadow maps, CSS2D divs */
function kill(o: THREE.Object3D) {
  o.traverse(c => {
    const m = c as any
    m.geometry?.dispose?.()
    ;(Array.isArray(m.material) ? m.material : [m.material]).forEach((x: any) => x?.dispose?.())
    m.shadow?.map?.dispose?.()
    if (m.isCSS2DObject) m.element?.remove()
  })
  o.removeFromParent()
}

const HEIGHT: Partial<Record<ItemType, number>> = { wardrobe: 200, bookshelf: 180, plant: 110, lamp: 150, tv_unit: 125, desk: 100, bed_double: 60, bed_single: 60, ceiling_light: 262, downlights: 262, pendant: 195, chandelier: 215, spotlight_bar: 258, track_light: 258, cove_strip: 258, wall_sconce: 175 }

export function Scene3D({ V }: { V: Violation[] }) {
  const host = useRef<HTMLDivElement>(null)
  const [no3D, setNo3D] = useState(false)
  const vRef = useRef(V); vRef.current = V
  const syncRef = useRef<() => void>(() => {})

  useEffect(() => {
    const el = host.current!
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0f13)
    const cam = new THREE.PerspectiveCamera(45, 1, .1, 500)
    // PCFSoft is deprecated and falls back to PCFShadowMap anyway, loudly
    let r: THREE.WebGLRenderer
    try { r = new THREE.WebGLRenderer({ antialias: true }) } catch { setNo3D(true); return }
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFShadowMap
    r.setPixelRatio(Math.min(devicePixelRatio, 2))
    const css = new CSS2DRenderer(); css.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    el.append(r.domElement, css.domElement)
    const ctl = new OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI / 2.05; ctl.minDistance = 8; ctl.maxDistance = 120
    // Frame the whole room for THIS viewport rather than by a magic multiplier: a 3×3.5m office and a
    // 6×4.5m living room both need to fit, and a wide window needs a different distance than a tall one.
    const frame = () => {
      const W = state.room.w * U, H = state.room.h * U
      const t = Math.tan((cam.fov * Math.PI / 180) / 2)
      const d = Math.max(H / 2 / t, W / 2 / t / Math.max(cam.aspect, .5)) * 1.5
      cam.position.set(W / 2 + d * .45, d * .62, H / 2 + d * .78)
      ctl.target.set(W / 2, 3, H / 2); ctl.minDistance = 8; ctl.update()
    }

    const amb = new THREE.AmbientLight(0xb9c2d6, .9); scene.add(amb)
    const hemi = new THREE.HemisphereLight(0x8fa3c8, 0x1a1e26, .5); scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffe2b0, 0); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun); scene.add(sun.target)
    const lamp = new THREE.DirectionalLight(0xdfe6f5, 1.1); lamp.position.set(-20, 40, 25); lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); scene.add(lamp)

    const roomG = new THREE.Group(), itemG = new THREE.Group(), fxG = new THREE.Group(); scene.add(roomG, itemG, fxG)
    const meshes = new Map<string, { g: THREE.Group; label: CSS2DObject; target: THREE.Vector3; rot: number }>()
    const notes = new Map<string, CSS2DObject>()
    let roomKey = ''

    const buildRoom = () => {
      const { room } = state; roomKey = JSON.stringify(room)
      ;[...roomG.children].forEach(kill)
      const W = room.w * U, H = room.h * U, wallH = 26, t = 1.4
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: 0x232833, roughness: .95 }))
      floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true; roomG.add(floor)
      const grid = new THREE.GridHelper(Math.max(W, H), Math.max(room.w, room.h) / 50, 0x2b303b, 0x2b303b); grid.position.set(W / 2, .01, H / 2); roomG.add(grid)
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d4352, roughness: .9, side: THREE.DoubleSide })
      const seg = (wall: 'N' | 'S' | 'E' | 'W', from: number, to: number, mat = wallMat, hgt = wallH, y0 = 0) => {
        const len = (to - from) * U; if (len <= 0) return
        const m = new THREE.Mesh(new THREE.BoxGeometry(wall === 'N' || wall === 'S' ? len : t, hgt, wall === 'N' || wall === 'S' ? t : len), mat)
        const mid = ((from + to) / 2) * U
        m.position.set(wall === 'N' || wall === 'S' ? mid : wall === 'W' ? -t / 2 : W + t / 2, y0 + hgt / 2, wall === 'N' ? -t / 2 : wall === 'S' ? H + t / 2 : mid)
        m.castShadow = m.receiveShadow = true; m.userData.wall = wall; roomG.add(m)
      }
      const glass = new THREE.MeshStandardMaterial({ color: GLASS, transparent: true, opacity: .25, roughness: .1 })
      for (const wall of ['N', 'S', 'E', 'W'] as const) {
        const L = wall === 'N' || wall === 'S' ? room.w : room.h
        const cuts = [...room.doors.filter(d => d.wall === wall).map(d => ({ a: d.pos, b: d.pos + d.width, kind: 'door' })), ...room.windows.filter(w => w.wall === wall).map(w => ({ a: w.pos, b: w.pos + w.width, kind: 'win' }))].sort((p, q) => p.a - q.a)
        let x = 0
        for (const c of cuts) { seg(wall, x, c.a); if (c.kind === 'win') { seg(wall, c.a, c.b, wallMat, 9, 0); seg(wall, c.a, c.b, glass, 13, 9); seg(wall, c.a, c.b, wallMat, 4, 22) } else seg(wall, c.a, c.b, wallMat, 5, 21); x = c.b }
        seg(wall, x, L)
      }
      // door leaf on the floor as a thin arc-ish slab
      for (const d of room.doors) { const leaf = new THREE.Mesh(new THREE.BoxGeometry(d.wall === 'N' || d.wall === 'S' ? d.width * U : t, 20, d.wall === 'N' || d.wall === 'S' ? t : d.width * U), new THREE.MeshStandardMaterial({ color: 0x8b93a7, transparent: true, opacity: .35 }))
        const c = d.wall === 'N' ? [d.pos + d.width / 2, 0] : d.wall === 'S' ? [d.pos + d.width / 2, room.h] : d.wall === 'W' ? [0, d.pos + d.width / 2] : [room.w, d.pos + d.width / 2]
        leaf.position.set(c[0] * U, 10, c[1] * U); leaf.rotation.y = d.wall === 'N' || d.wall === 'S' ? .9 : -.9; roomG.add(leaf) }
      for (const o of room.outlets) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xf5b544, emissive: 0xf5b544, emissiveIntensity: .6 })); m.position.set(o.x * U, 3, o.y * U); roomG.add(m) }
      if (!state.eye) frame()
    }

    const mkLabel = (text: string, cls: string) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; return new CSS2DObject(d) }
    const noteEl = (n: (typeof state.notes)[number]) => {
      const d = document.createElement('div'); d.className = 'bubble3d'; d.style.pointerEvents = 'auto'
      const col = { say: '#e8eaf0', ok: '#4fd68a', warn: '#ff5d5d', idea: '#f5b544' }[n.kind]
      const text = document.createElement('div'); text.className = 'b-text'
      const dot = document.createElement('span'); dot.className = 'b-dot'; dot.style.background = col
      text.append(dot, document.createTextNode(n.text))
      d.append(text)
      if (n.verdict) {
        const v = document.createElement('div'); v.className = 'b-verdict'
        v.style.color = n.verdict.ok ? '#4fd68a' : '#ff5d5d'
        v.textContent = `${n.verdict.ok ? '✓' : '✗'} ${n.verdict.text}`
        d.append(v)
      }
      const chips = document.createElement('div'); chips.className = 'b-chips'; d.append(chips)
      d.style.borderLeftColor = col
      for (const o of [...(n.options ?? (n.kind === 'warn' ? ['✓ fix it', '✗ leave it'] : n.kind === 'idea' ? ['✓ do it', '✗ no'] : ['👍'])), 'reply']) {
        const b = document.createElement('button'); b.textContent = o; b.className = o === 'reply' ? 'chip chip-reply' : o.startsWith('✓') ? 'chip chip-yes' : o.startsWith('✗') ? 'chip chip-no' : 'chip chip-opt'
        b.onclick = e => { e.stopPropagation(); o === 'reply' ? set({ replyTo: n.id }) : answerNote(n.id, o) }; chips.append(b)
      }
      return new CSS2DObject(d)
    }

    const sync = () => {
      if (JSON.stringify(state.room) !== roomKey) buildRoom()
      const s = state, seen = new Set<string>()
      const bad = new Map<string, 'error' | 'warn'>(); for (const v of vRef.current) for (const id of v.items) if (bad.get(id) !== 'error') bad.set(id, v.severity)
      for (const it of s.items) {
        seen.add(it.id)
        let e = meshes.get(it.id)
        if (!e || e.g.userData.key !== `${it.type}:${it.w}:${it.h}`) {
          if (e) { for (const [nid, o] of notes) if (o.parent === e.g) { kill(o); notes.delete(nid) } ; kill(e.g) }
          const g = buildItem(it.type, it.w, it.h); g.userData.key = `${it.type}:${it.w}:${it.h}`
          // same rule as the plan: an id is for the agent, and only earns a place on screen when
          // there are two of something and a person needs to know which one is meant
          const twin = hasTwin(s.items, it)
          const label = mkLabel(spec(it.type).label.toLowerCase() + (twin ? ' · ' + it.id : ''), 'label3d')
          label.position.y = ((HEIGHT[it.type] ?? 90) + 14) * U; g.add(label)
          e = { g, label, target: new THREE.Vector3(), rot: it.rot }; meshes.set(it.id, e); itemG.add(g)
          const f = footprint(it), c = center(f); g.position.set(c.x * U, 0, c.y * U); g.rotation.y = -it.rot * Math.PI / 180
        }
        const f = footprint(it), c = center(f); e.target.set(c.x * U, 0, c.y * U); e.rot = it.rot
        const sev = bad.get(it.id), sel = s.selected === it.id, fl = !!s.flash[it.id], dim = s.spot && !s.spot.ids.includes(it.id)
        e.label.visible = !!(sel || sev || fl || s.notes.some(n => n.item === it.id && !n.answered) || (s.spot && s.spot.ids.includes(it.id)))
        e.g.traverse(o => { if (o instanceof THREE.Mesh) { const m = o.material as THREE.MeshStandardMaterial; if (!m.userData.base) m.userData.base = { e: m.emissive.getHex(), i: m.emissiveIntensity }; const b = m.userData.base
          if (sev === 'error') { m.emissive.set(0xff5d5d); m.emissiveIntensity = .35 } else if (fl) { m.emissive.set(0xf5b544); m.emissiveIntensity = .5 } else if (sel) { m.emissive.set(0xe8eaf0); m.emissiveIntensity = .18 } else if (sev === 'warn') { m.emissive.set(0xf5b544); m.emissiveIntensity = .12 } else { m.emissive.set(b.e); m.emissiveIntensity = b.i }
          m.transparent = m.transparent || !!dim; m.opacity = dim ? .25 : (m.userData.baseOpacity ?? (m.userData.baseOpacity = m.opacity)) } })
        e.g.visible = !it.parked && it.x > -500
      }
      for (const [id, e] of meshes) if (!seen.has(id)) { for (const [nid, o] of notes) if (o.parent === e.g) { kill(o); notes.delete(nid) } ; kill(e.g); meshes.delete(id) }
      // notes
      const liveNotes = s.notes.filter(n => !n.answered && (n.item ? meshes.has(n.item) : n.x !== undefined)).slice(-3)
      for (const [id, o] of notes) if (!liveNotes.some(n => n.id === id)) { kill(o); notes.delete(id) }
      for (const n of liveNotes) if (!notes.has(n.id)) { const o = noteEl(n); notes.set(n.id, o); if (n.item) { const e = meshes.get(n.item)!; o.position.y = ((HEIGHT[e.g.userData.key.split(':')[0] as ItemType] ?? 90) + 40) * U; e.g.add(o) } else { o.position.set(n.x! * U, 30 * U, n.y! * U); fxG.add(o) } }
      // daylight — the real solar vector, so shadows swing through the day
      const S = solar(s.hour, s.room), W = s.room.w * U, H = s.room.h * U
      const anyWindowLit = s.room.windows.some(w => windowSun(w.wall, s.hour, s.room) > 0.12)
      sun.intensity = S.up && anyWindowLit ? 0.6 + 1.6 * Math.min(1, S.altitude / 45) : 0
      sun.color.setHex(kelvinToRGB(S.kelvin))
      if (sun.intensity > 0) {
        const D = Math.max(W, H) * 1.6, rise = Math.tan(Math.max(6, S.altitude) * Math.PI / 180) * D
        sun.position.set(W / 2 - S.dir.x * D, rise, H / 2 - S.dir.y * D)
        sun.target.position.set(W / 2, 0, H / 2); sun.target.updateMatrixWorld()
      }
      const day = S.up
      hemi.intensity = day ? .65 : .22
      amb.intensity = day ? .9 : .32
      lamp.intensity = day ? 1.1 : .25
      // walk path
      const pathKey = s.path ? `${s.path.to}:${s.path.pts.length}:${s.path.length}` : ''
      const existing = fxG.children.find(c => c.userData.path)
      if (existing && existing.userData.path !== pathKey) kill(existing)
      if (s.path && (!existing || existing.userData.path !== pathKey)) { const pts = s.path.pts.map(p => new THREE.Vector3(p.x * U, .3, p.y * U)); const curve = new THREE.CatmullRomCurve3(pts); const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, .35, 8), new THREE.MeshStandardMaterial({ color: 0x4fd68a, emissive: 0x4fd68a, emissiveIntensity: .8 })); tube.userData.path = pathKey; fxG.add(tube) }
    }

    // ---- direct manipulation: drag furniture on the floor, same store, same rules as 2D ----
    const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3()
    let drag: { id: string; dx: number; dz: number; x0: number; y0: number; moved: boolean } | null = null
    const ndc = (e: PointerEvent) => { const b = r.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1) }
    const pick = (e: PointerEvent): string | null => {
      ray.setFromCamera(ndc(e), cam)
      const hits = ray.intersectObjects(itemG.children, true)
      for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o && o.parent !== itemG) o = o.parent
        if (o) for (const [id, m] of meshes) if (m.g === o && !spec(state.items.find(i => i.id === id)?.type ?? 'plant').ceiling) return id }
      return null
    }
    const floorAt = (e: PointerEvent) => { ray.setFromCamera(ndc(e), cam); return ray.ray.intersectPlane(floorPlane, hit) ? { x: hit.x / U, y: hit.z / U } : null }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const id = pick(e); if (!id) { set({ selected: null }); return }
      const it = state.items.find(i => i.id === id)!, p = floorAt(e); if (!p) return
      e.preventDefault()
      try { r.domElement.setPointerCapture(e.pointerId) } catch { /* dragging still works, just not past the canvas edge */ }
      ctl.enabled = false
      push(); set({ selected: id })
      drag = { id, dx: p.x - it.x, dz: p.y - it.y, x0: it.x, y0: it.y, moved: false }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag) { r.domElement.style.cursor = pick(e) ? 'grab' : ''; return }
      const p = floorAt(e); if (!p) return
      // keep it inside the walls: in 3D the floor is all you can see, so 'outside' is just confusing
      const it = state.items.find(i => i.id === drag!.id); if (!it) return
      const f = footprint(it), x = Math.max(0, Math.min(state.room.w - f.w, p.x - drag.dx)), y = Math.max(0, Math.min(state.room.h - f.h, p.y - drag.dz))
      updateItem(drag.id, { x, y }); drag.moved = true; r.domElement.style.cursor = 'grabbing'
    }
    const onUp = () => {
      if (!drag) return
      const it = state.items.find(i => i.id === drag!.id)
      if (it && (it.x !== drag.x0 || it.y !== drag.y0)) humanEvent({ action: 'moved', item: it.id, from: { x: drag.x0, y: drag.y0 }, to: { x: it.x, y: it.y }, text: `dragged the ${spec(it.type).label.toLowerCase()} to (${it.x},${it.y}) in 3D` })
      else set(st => ({ history: st.history.slice(0, -1) })) // a click that moved nothing: drop our snapshot
      drag = null; ctl.enabled = true; r.domElement.style.cursor = ''
    }
    r.domElement.addEventListener('pointerdown', onDown); r.domElement.addEventListener('pointermove', onMove); r.domElement.addEventListener('pointerup', onUp); r.domElement.addEventListener('pointercancel', onUp)

    syncRef.current = sync
    const unsub = subscribe(sync); sync()
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h); css.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); if (!state.eye) frame() }
    const ro = new ResizeObserver(resize); ro.observe(el); resize()
    let raf = 0
    const cutaway = () => { const W = state.room.w * U, H = state.room.h * U; const dx = cam.position.x - W / 2, dz = cam.position.z - H / 2
      const hide = new Set<string>(); if (dz > H / 2) hide.add('S'); if (dz < -H / 2) hide.add('N'); if (dx > W / 2) hide.add('E'); if (dx < -W / 2) hide.add('W')
      roomG.children.forEach(c => { if (c.userData.wall) c.visible = !hide.has(c.userData.wall) }) }
    // ---- eye level: stand (or sit) inside the room and look where that person looks -------------
    // A plan view is an argument about a room. This is the room. Only the page can do it, so the
    // agent gets to ask for it: show({ eye: 'chair_b' }) puts you in the wheelchair by the door.
    let eyeKey = ''
    const toEye = () => {
      const e = state.eye
      if (!e) { if (eyeKey) { eyeKey = ''; ctl.enabled = true; frame() } return }
      const key = `${e.id}:${e.cm}`
      const it = state.items.find(i => i.id === e.id); if (!it) return
      if (key === eyeKey) return
      eyeKey = key
      const f = front(it.rot)
      const fw = it.rot % 180 ? it.h : it.w, fh = it.rot % 180 ? it.w : it.h
      const cx = (it.x + fw / 2) * U, cz = (it.y + fh / 2) * U
      // sit at the piece's centre, a little forward of its back, and look out along its face
      ctl.minDistance = 0.01
      cam.position.set(cx + f.x * fw * U * 0.15, e.cm * U, cz + f.y * fh * U * 0.15)
      ctl.target.set(cx + f.x * 60, e.cm * U * 0.92, cz + f.y * 60)
      ctl.update()
    }

    const loop = () => { raf = requestAnimationFrame(loop); toEye(); cutaway(); for (const [id, e] of meshes) { e.g.position.lerp(e.target, drag?.id === id ? .6 : .12); const tr = -e.rot * Math.PI / 180; let d = tr - e.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); e.g.rotation.y += d * .12 } ctl.update(); r.render(scene, cam); css.render(scene, cam) }
    loop()
    return () => { cancelAnimationFrame(raf); unsub(); ro.disconnect(); ctl.dispose(); r.domElement.removeEventListener('pointerdown', onDown); r.domElement.removeEventListener('pointermove', onMove); r.domElement.removeEventListener('pointerup', onUp); r.domElement.removeEventListener('pointercancel', onUp); [...scene.children].forEach(kill); r.dispose(); r.forceContextLoss(); el.replaceChildren() }
  }, [])

  useEffect(() => { syncRef.current() }, [V]) // violations changed → re-sync emissives

  if (no3D) return <div className="w-full h-full grid place-items-center text-center p-8">
    <div className="max-w-sm">
      <p className="font-serif text-2xl">This browser cannot draw the 3D view.</p>
      <p className="text-mute text-[13px] mt-2">WebGL is unavailable or switched off. Everything else works — the plan, the rules, the agent's tools and the printable drawing are all in 2D.</p>
      <button onClick={() => set({ view: '2d' })} className="mt-4 px-3 py-1.5 rounded-md border border-accent/60 text-accent hover:bg-accent hover:text-bg text-[13px]">Back to the plan</button>
    </div>
  </div>

  return <div ref={host} className="w-full h-full relative rounded-xl overflow-hidden"
    role="img" aria-label={describePlan(state.room, state.items, V, 'Three-dimensional view of the room')}>
    {/* sitting inside the room, you are not dragging anything — and the hint collided with the eye pill */}
    {!state.eye && <div className="absolute bottom-3 left-3 z-10 text-[11px] text-mute font-mono pointer-events-none">drag furniture to move · R rotates · arrows nudge · ⌫ removes · right-drag orbits</div>}
  </div>
}
