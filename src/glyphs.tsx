import type { ItemType } from './catalog'

// materials
const FAB = '#3b4259', FAB2 = '#4a5270', FAB3 = '#59627f', WOOD = '#5b4636', WOOD2 = '#6e5542', WOOD3 = '#7d6350', DARK = '#1c2029', S = '#9aa3b8', A = '#f5b544', LINEN = '#8f97ab', LINEN2 = '#a6adc0'
const RR = ({ w, h, r = 6, fill, stroke = S, sw = 1.5, ...p }: any) => <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth={sw} {...p} />

/** Glyphs are drawn centred at the origin, unrotated. Front of the object = +y (south). */
/* The pale #f5d78a shapes below are light pools. index.css makes them pointer-events:none — they
   are what a fitting throws, not the fitting, and a 240cm glow over the sofa was stealing its clicks. */
export function Glyph({ type, w: rawW, h: rawH }: { type: ItemType; w: number; h: number }) {
  const w = Math.max(30, rawW || 30), h = Math.max(30, rawH || 30) // negative rect widths make Chrome drop the element
  const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2
  switch (type) {
    case 'sofa': case 'armchair': {
      const arm = Math.min(type === 'sofa' ? 16 : 14, w / 5), back = Math.min(20, h / 3), n = type === 'sofa' ? Math.max(2, Math.round(w / 65)) : 1
      const cw = Math.max(8, (w - 2 * arm) / n)
      return <g className="glyph-body">
        <RR w={w} h={h} r={12} fill={FAB} />
        {/* back rest */}
        <rect x={x0 + arm - 2} y={y0 + 3} width={w - 2 * arm + 4} height={back} rx={8} fill={FAB2} />
        {Array.from({ length: n }, (_, i) => <rect key={'b' + i} x={x0 + arm + i * cw + 3} y={y0 + 6} width={cw - 6} height={back - 6} rx={6} fill={FAB3} />)}
        {/* arms */}
        <rect x={x0 + 3} y={y0 + 3} width={arm - 3} height={h - 6} rx={7} fill={FAB2} />
        <rect x={x1 - arm} y={y0 + 3} width={arm - 3} height={h - 6} rx={7} fill={FAB2} />
        {/* seat cushions */}
        {Array.from({ length: n }, (_, i) => <g key={i}>
          <rect x={x0 + arm + i * cw + 3} y={y0 + back + 5} width={cw - 6} height={h - back - 11} rx={7} fill={FAB2} stroke={FAB3} strokeWidth={1} />
          <path d={`M${x0 + arm + i * cw + 10} ${y1 - 12} h${cw - 20}`} stroke={FAB} strokeWidth={1.2} />
        </g>)}
        {n > 1 && <ellipse cx={x0 + arm + cw * 0.5} cy={y0 + back + 2} rx={12} ry={7} fill={A} opacity={.7} />}
      </g>
    }
    case 'tv_unit':
      return <g className="glyph-body">
        <RR w={w} h={h} r={3} fill={WOOD} />
        <path d={`M${x0 + w / 3} ${y0 + 4} V${y1 - 4} M${x0 + (2 * w) / 3} ${y0 + 4} V${y1 - 4}`} stroke={WOOD3} strokeWidth={1.2} />
        {[w / 6, w / 2, (5 * w) / 6].map((cx, i) => <rect key={i} x={x0 + cx - 6} y={y0 + h / 2 - 1.5} width={12} height={3} rx={1.5} fill={S} />)}
        {/* the screen sits at the front edge, glowing into the room */}
        <ellipse cx={0} cy={y1 + 6} rx={w * 0.45} ry={10} fill={A} opacity={.12} />
        <rect x={x0 + 14} y={y1 - 11} width={w - 28} height={7} rx={1.5} fill={DARK} stroke={S} strokeWidth={1} />
        <rect x={x0 + 16} y={y1 - 9} width={w - 32} height={3} fill={A} opacity={.9} />
      </g>
    case 'desk':
      return <g className="glyph-body">
        <RR w={w} h={h} r={4} fill={WOOD2} />
        <path d={`M${x0 + 8} ${y0 + 8} H${x1 - 8}`} stroke={WOOD3} strokeWidth={1} opacity={.6} />
        {/* monitor on a stand at the back, keyboard + mouse at the front, a mug */}
        <rect x={-30} y={y0 + 9} width={60} height={7} rx={2} fill={DARK} stroke={S} strokeWidth={1} />
        <rect x={-28} y={y0 + 11} width={56} height={3} fill={A} opacity={.6} />
        <rect x={-8} y={y0 + 16} width={16} height={5} rx={1} fill={S} opacity={.8} />
        <rect x={-26} y={y1 - 24} width={52} height={14} rx={3} fill={DARK} stroke={S} strokeWidth={1} />
        {[0, 1, 2].map(r => <path key={r} d={`M${-22} ${y1 - 20 + r * 4} H22`} stroke="#3a4159" strokeWidth={1.5} strokeDasharray="2 2" />)}
        <ellipse cx={38} cy={y1 - 17} rx={5} ry={7} fill={DARK} stroke={S} strokeWidth={1} />
        <circle cx={x1 - 16} cy={y0 + 16} r={5} fill={DARK} stroke={S} strokeWidth={1} /><circle cx={x1 - 16} cy={y0 + 16} r={2} fill={A} opacity={.7} />
      </g>
    case 'chair':
      return <g className="glyph-body">
        <circle r={w / 2 - 2} fill="none" stroke={S} strokeWidth={1} opacity={.4} />
        {[0, 72, 144, 216, 288].map(a => <path key={a} d={`M0 0 L0 ${w / 2 - 3}`} stroke={S} strokeWidth={2} transform={`rotate(${a})`} opacity={.5} />)}
        <RR w={w - 12} h={h - 12} r={9} fill={FAB} />
        <rect x={x0 + 7} y={y0 + 6} width={w - 14} height={10} rx={5} fill={FAB3} />
      </g>
    case 'bed_double': case 'bed_single': {
      const dbl = type === 'bed_double', pw = Math.max(10, dbl ? (w - 22) / 2 : w - 20)
      return <g className="glyph-body">
        <RR w={w} h={h} r={6} fill={WOOD} />
        <rect x={x0 + 5} y={y0 + 5} width={w - 10} height={h - 10} rx={4} fill={LINEN} />
        {/* pillows */}
        <rect x={x0 + 10} y={y0 + 12} width={pw - 2} height={30} rx={9} fill={LINEN2} stroke="#c3c9d8" strokeWidth={1} />
        {dbl && <rect x={x0 + 12 + pw} y={y0 + 12} width={pw - 2} height={30} rx={9} fill={LINEN2} stroke="#c3c9d8" strokeWidth={1} />}
        {/* duvet with a folded top edge */}
        <rect x={x0 + 5} y={y0 + 52} width={w - 10} height={h - 57} rx={4} fill={FAB} />
        <rect x={x0 + 5} y={y0 + 52} width={w - 10} height={14} fill={FAB3} />
        <path d={`M${x0 + 5} ${y0 + 66} H${x1 - 5}`} stroke={FAB2} strokeWidth={1.5} />
        {[0.35, 0.55, 0.75].map(t => <path key={t} d={`M${x0 + 18} ${y0 + h * t} Q${0} ${y0 + h * t + 8} ${x1 - 18} ${y0 + h * t}`} stroke={FAB2} strokeWidth={1} fill="none" />)}
      </g>
    }
    case 'blind':
      // a shallow band of slats across the window it covers
      return <g className="glyph-body">
        <RR w={w} h={Math.max(6, h)} r={2} fill={LINEN} sw={1} />
        {(() => { const n = Math.max(3, Math.round(w / 22)); return Array.from({ length: n }, (_, i) =>
          <path key={i} d={`M${x0 + (i + 1) * (w / (n + 1))} ${-Math.max(3, h / 2) + 1} v${Math.max(4, h - 2)}`} stroke={LINEN2} strokeWidth={1.2} />) })()}
      </g>
    case 'toilet':
      // seen from above: cistern at the back, pan in front. Front of the object is +y.
      return <g className="glyph-body">
        <rect x={x0 + 2} y={y0 + 2} width={w - 4} height={Math.max(10, h * 0.26)} rx={3} fill={LINEN} stroke={S} strokeWidth={1} />
        <ellipse cx={0} cy={y0 + h * 0.62} rx={w / 2 - 4} ry={h * 0.32} fill={LINEN2} stroke={S} strokeWidth={1.2} />
        <ellipse cx={0} cy={y0 + h * 0.62} rx={w / 2 - 10} ry={h * 0.24} fill="#39404f" />
      </g>
    case 'basin':
      return <g className="glyph-body">
        <RR w={w} h={h} r={7} fill={LINEN} sw={1.2} />
        <ellipse cx={0} cy={2} rx={w / 2 - 7} ry={h / 2 - 7} fill={LINEN2} stroke={S} strokeWidth={1} />
        <circle cx={0} cy={2} r={3} fill="#39404f" />
        <path d={`M0 ${y0 + 6} v-3 q0 -3 5 -3`} fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" />
      </g>
    case 'shower':
      return <g className="glyph-body">
        <RR w={w} h={h} r={3} fill="#2f3644" sw={1.5} />
        <path d={`M${x0 + 4} ${y0 + 4} L${x1 - 4} ${y1 - 4}`} stroke={S} strokeWidth={1} opacity={.5} />
        <path d={`M${x1 - 4} ${y0 + 4} L${x0 + 4} ${y1 - 4}`} stroke={S} strokeWidth={1} opacity={.5} />
        <circle cx={x0 + 13} cy={y0 + 13} r={7} fill="none" stroke={S} strokeWidth={1.5} />
        <circle cx={0} cy={0} r={4} fill="#39404f" stroke={S} strokeWidth={1} />
      </g>
    case 'bathtub':
      return <g className="glyph-body">
        <RR w={w} h={h} r={10} fill={LINEN} sw={1.2} />
        <rect x={x0 + 6} y={y0 + 6} width={w - 12} height={h - 12} rx={8} fill="#39404f" stroke={S} strokeWidth={1} />
        <circle cx={x0 + 18} cy={0} r={3.5} fill={DARK} />
        <path d={`M${x0 + 10} ${y0 + 3} v-3`} stroke={S} strokeWidth={2} strokeLinecap="round" />
      </g>
    case 'counter':
      return <g className="glyph-body">
        <RR w={w} h={h} r={2} fill={WOOD2} />
        <rect x={x0 + 3} y={y0 + 3} width={w - 6} height={h - 6} rx={2} fill={WOOD} stroke={WOOD3} strokeWidth={1} />
        {/* drawer fronts along the run, so a worktop reads as cupboards and not a table */}
        {(() => { const n = Math.max(2, Math.round(w / 60)); return Array.from({ length: n }, (_, i) => {
          const cw = (w - 8) / n
          return <g key={i}>
            <rect x={x0 + 4 + i * cw} y={y0 + 4} width={cw - 2} height={h - 8} rx={2} fill="none" stroke={WOOD3} strokeWidth={1} />
            <rect x={x0 + 4 + i * cw + cw / 2 - 8} y={-2} width={16} height={3} rx={1.5} fill={S} />
          </g>
        }) })()}
      </g>
    case 'sink':
      return <g className="glyph-body">
        <RR w={w} h={h} r={3} fill={WOOD2} />
        <rect x={x0 + 5} y={y0 + 7} width={w - 10} height={h - 14} rx={4} fill="#39404f" stroke={S} strokeWidth={1.2} />
        <circle cx={0} cy={2} r={Math.min(5, w / 8)} fill={DARK} stroke={S} strokeWidth={1} />
        {/* tap at the back, which is also the side you cannot stand at */}
        <path d={`M0 ${y0 + 6} v-4 q0 -4 6 -4`} fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" />
      </g>
    case 'hob':
      return <g className="glyph-body">
        <RR w={w} h={h} r={3} fill={DARK} />
        {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sy], i) =>
          <circle key={i} cx={sx * w / 5} cy={sy * h / 5} r={Math.min(w, h) / 7} fill="none" stroke="#c0553d" strokeWidth={2} />)}
      </g>
    case 'fridge':
      return <g className="glyph-body">
        <RR w={w} h={h} r={3} fill="#8f97ab" />
        <rect x={x0 + 3} y={y0 + 3} width={w - 6} height={h - 6} rx={2} fill={LINEN2} stroke={S} strokeWidth={1} />
        <path d={`M${x0 + 3} ${y0 + (h - 6) * 0.34} h${w - 6}`} stroke={S} strokeWidth={1.2} />
        <rect x={x1 - 11} y={y0 + 8} width={3} height={Math.max(8, h * 0.18)} rx={1.5} fill={DARK} />
        <rect x={x1 - 11} y={y0 + (h - 6) * 0.34 + 6} width={3} height={Math.max(10, h * 0.3)} rx={1.5} fill={DARK} />
      </g>
    case 'wardrobe':
      return <g className="glyph-body">
        <RR w={w} h={h} r={2} fill={WOOD2} />
        <rect x={x0 + 4} y={y0 + 4} width={w / 2 - 5} height={h - 8} rx={2} fill={WOOD} stroke={WOOD3} strokeWidth={1} />
        <rect x={1} y={y0 + 4} width={w / 2 - 5} height={h - 8} rx={2} fill={WOOD} stroke={WOOD3} strokeWidth={1} />
        <rect x={-9} y={-8} width={4} height={16} rx={2} fill={S} /><rect x={5} y={-8} width={4} height={16} rx={2} fill={S} />
      </g>
    case 'bookshelf': {
      const books: [number, string][] = [[7, '#b86b4b'], [5, '#6b8fb8'], [9, '#b8a04b'], [6, '#7ab87a'], [8, '#8b6bb8'], [5, '#b8b8b8'], [7, '#b86b4b'], [6, '#6b8fb8'], [9, '#c07a5a'], [5, '#7ab87a'], [7, '#b8a04b'], [6, '#8b6bb8']]
      let x = x0 + 5; const out = []
      for (const [bw, c] of books) { if (x + bw > x1 - 5) break; out.push(<rect key={x} x={x} y={y0 + 5} width={bw} height={h - 10 - (bw % 3) * 2} rx={1} fill={c} opacity={.85} />); x += bw + 1.5 }
      return <g className="glyph-body"><RR w={w} h={h} r={2} fill={WOOD} />{out}</g>
    }
    case 'dining_table': {
      const plates = [[-w / 3, -h / 4], [0, -h / 4], [w / 3, -h / 4], [-w / 3, h / 4], [0, h / 4], [w / 3, h / 4]]
      return <g className="glyph-body">
        <RR w={w} h={h} r={16} fill={WOOD2} />
        <RR w={w - 8} h={h - 8} r={13} fill="none" stroke={WOOD3} sw={1} />
        {plates.map(([cx, cy], i) => <g key={i}><circle cx={cx} cy={cy} r={9} fill={LINEN2} stroke={S} strokeWidth={.8} /><circle cx={cx} cy={cy} r={5} fill={LINEN} /></g>)}
        <ellipse rx={12} ry={7} fill="#2f6b47" />
      </g>
    }
    case 'coffee_table':
      return <g className="glyph-body">
        <RR w={w} h={h} r={10} fill={WOOD2} />
        <RR w={w - 6} h={h - 6} r={8} fill="#7fc7ff" opacity={.18} stroke="#7fc7ff" sw={1} />
        <rect x={-22} y={-10} width={26} height={18} rx={2} fill="#b86b4b" opacity={.9} /><rect x={-19} y={-7} width={20} height={12} rx={1} fill="#c98466" opacity={.9} />
        <circle cx={22} cy={4} r={6} fill={LINEN2} stroke={S} strokeWidth={1} /><circle cx={22} cy={4} r={3.5} fill={WOOD} />
      </g>
    case 'plant':
      return <g className="glyph-body">
        <circle r={w / 2 - 6} fill="#3a2f28" stroke={WOOD3} strokeWidth={2} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => <ellipse key={a} cx={0} cy={-(w / 2 - 12) / 2} rx={5} ry={w / 2 - 10} fill={i % 2 ? '#2f6b47' : '#3e8a5c'} opacity={.95} transform={`rotate(${a})`} />)}
        {[20, 110, 200, 290].map(a => <ellipse key={a} cx={0} cy={-6} rx={3.5} ry={9} fill="#4fd68a" opacity={.8} transform={`rotate(${a})`} />)}
        <circle r={3} fill="#4fd68a" />
      </g>
    case 'lamp':
      return <g className="glyph-body">
        <circle r={w * 1.6} fill={A} opacity={.07} /><circle r={w} fill={A} opacity={.08} />
        <circle r={w / 2} fill="#2a2f3c" stroke={S} strokeWidth={1.5} />
        <circle r={w / 2 - 5} fill={A} opacity={.35} /><circle r={4} fill={A} />
      </g>
    case 'ceiling_light':
      return <g className="glyph-body"><circle r={w * 2.4} fill="#f5d78a" opacity={.05} /><circle r={w * 1.5} fill="#f5d78a" opacity={.06} />
        <circle r={w / 2} fill="none" stroke={A} strokeWidth={2} strokeDasharray="4 3" /><circle r={w / 2 - 7} fill={A} opacity={.35} /><circle r={5} fill={A} /></g>
    case 'pendant':
      return <g className="glyph-body"><circle r={w * 2.2} fill="#f5d78a" opacity={.05} /><circle r={w * 1.3} fill="#f5d78a" opacity={.07} />
        <circle r={w / 2} fill="#2a2f3c" stroke={A} strokeWidth={2} /><circle r={w / 2 - 6} fill={A} opacity={.45} /><circle r={3} fill="#0d0f13" /></g>
    case 'spotlight_bar':
      return <g className="glyph-body"><rect x={x0} y={-6} width={w} height={12} rx={6} fill="#2a2f3c" stroke={A} strokeWidth={1.5} />
        {[0.2, 0.5, 0.8].map(t => <g key={t}><circle cx={x0 + w * t} cy={0} r={4} fill={A} /><circle cx={x0 + w * t} cy={0} r={22} fill="#f5d78a" opacity={.06} /></g>)}</g>
    case 'downlights': {
      const p: [number, number][] = [[-w / 3, -h / 3], [w / 3, -h / 3], [-w / 3, h / 3], [w / 3, h / 3]]
      return <g className="glyph-body">{p.map(([cx, cy], i) => <g key={i}><circle cx={cx} cy={cy} r={38} fill="#f5d78a" opacity={.06} /><circle cx={cx} cy={cy} r={9} fill="none" stroke={A} strokeWidth={1.5} /><circle cx={cx} cy={cy} r={5} fill={A} opacity={.5} /></g>)}</g>
    }
    case 'chandelier':
      return <g className="glyph-body"><circle r={w * 1.6} fill="#f5d78a" opacity={.05} /><circle r={w} fill="#f5d78a" opacity={.05} />
        <circle r={w / 3} fill="#2a2f3c" stroke={A} strokeWidth={1.5} />
        {[0, 72, 144, 216, 288].map(a => <g key={a} transform={`rotate(${a})`}><path d={`M0 0 L0 ${-w / 2.4}`} stroke={A} strokeWidth={1} opacity={.6} /><circle cy={-w / 2.4} r={5} fill={A} opacity={.85} /></g>)}</g>
    case 'cove_strip':
      return <g className="glyph-body"><rect x={x0} y={-16} width={w} height={32} fill="#f5d78a" opacity={.06} /><rect x={x0} y={-4} width={w} height={8} rx={4} fill={A} opacity={.75} /></g>
    case 'wall_sconce':
      return <g className="glyph-body"><path d={`M${x0} 0 A${w} ${w} 0 0 1 ${x1} 0 Z`} fill="#f5d78a" opacity={.08} transform="scale(2.4)" /><rect x={x0} y={y0} width={w} height={h} rx={3} fill="#2a2f3c" stroke={A} strokeWidth={1.5} /><rect x={x0 + 3} y={y0 + 2} width={w - 6} height={h - 4} rx={2} fill={A} opacity={.6} /></g>
    case 'track_light':
      return <g className="glyph-body"><rect x={x0} y={-5} width={w} height={10} rx={5} fill="#2a2f3c" stroke={A} strokeWidth={1.5} />
        {[0.15, 0.5, 0.85].map(t => <g key={t}><circle cx={x0 + w * t} r={26} fill="#f5d78a" opacity={.06} /><circle cx={x0 + w * t} r={4.5} fill={A} /></g>)}</g>
    case 'rug':
      return <g className="glyph-body">
        <rect x={x0} y={y0} width={w} height={h} rx={3} fill="#232838" stroke="#3a4159" strokeWidth={1.5} />
        <rect x={x0 + 10} y={y0 + 10} width={w - 20} height={h - 20} rx={2} fill="none" stroke="#3f4760" strokeWidth={1.5} />
        <rect x={x0 + 22} y={y0 + 22} width={w - 44} height={h - 44} rx={2} fill="none" stroke="#3a4159" strokeWidth={1} strokeDasharray="4 4" />
        <path d={`M${x0 + 40} ${y0 + 40} L${x1 - 40} ${y1 - 40} M${x1 - 40} ${y0 + 40} L${x0 + 40} ${y1 - 40}`} stroke="#3a4159" strokeWidth={1} opacity={.7} />
        {Array.from({ length: Math.floor(h / 12) }, (_, i) => <g key={i}><path d={`M${x0} ${y0 + 6 + i * 12} h-6`} stroke="#4a5270" strokeWidth={1.5} /><path d={`M${x1} ${y0 + 6 + i * 12} h6`} stroke="#4a5270" strokeWidth={1.5} /></g>)}
      </g>
  }
}
