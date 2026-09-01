import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Panel } from './Panel'
import { Plan } from './Plan'
const Scene3D = lazy(() => import('./Scene3D').then(m => ({ default: m.Scene3D })))
import { buildFlat } from './flat'
// a 2BHK drawn once, so the landing can show what a home looks like without touching the live state
const SAMPLE_FLAT = buildFlat(2, 4)
import { FlatPlan } from './FlatPlan'
import { PRESETS } from './presets'
import { onTheFloor, check, roomPasses } from './rules'
import { Boundary } from './Boundary'
import { GET_WEBMCP, MAX_SAVES, acceptAll, answerNote, atWholeHome, deleteSave, enterRoom, forgetSession, getItem, humanEvent, lastSession, leaveRoom, listSaves, loadSave, push, rejectAll, removeItem, restore, rotateItem, saveRoom, set, updateItem, useStore, whoPhrase } from './store'
import { loadPreset, showFlat } from './tools'
import { spec } from './catalog'

const NOTE_COLOR = { say: '#e8eaf0', ok: '#4fd68a', warn: '#ff5d5d', idea: '#f5b544' }

export default function App() {
  const s = useStore()
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!s.selected || (e.target as HTMLElement).tagName === 'INPUT' || e.metaKey || e.ctrlKey) return
      const it = getItem(s.selected); if (!it) return
      if (e.key === 'r' || e.key === 'R') { push(); rotateItem(it.id) }
      const d = { ArrowUp: [0, -10], ArrowDown: [0, 10], ArrowLeft: [-10, 0], ArrowRight: [10, 0] }[e.key]
      if (d) { e.preventDefault(); push(); updateItem(it.id, { x: it.x + d[0], y: it.y + d[1] }); humanEvent({ action: 'moved', item: it.id, from: { x: it.x, y: it.y }, to: { x: it.x + d[0], y: it.y + d[1] }, text: `nudged the ${spec(it.type).label.toLowerCase()}` }) }
      if (e.key === 'Backspace' || e.key === 'Delete') { push(); removeItem(it.id); humanEvent({ action: 'removed', item: it.id, text: `removed the ${spec(it.type).label.toLowerCase()}` }) }
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [s.selected])

  if (!s.presetId) return <Landing />
  const V = check(s.room, s.items, s.profile, undefined, s.hour)
  const banner = [...s.notes].reverse().find(n => !n.item && n.x === undefined && !n.answered)
  const last = s.calls.at(-1)
  const here = s.flat?.rooms.find(r => r.id === s.here) ?? null
  const p = PRESETS.find(x => x.id === s.presetId) ?? null
  return (
    <div className="h-full flex overflow-hidden">
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* One bar that always answers "where am I and how do I get somewhere else". Navigation used to
            live in the side panel, below the fold, which is nobody's first guess. */}
        <header className="h-14 px-5 flex items-center gap-3 border-b border-line">
          <button onClick={() => set({ presetId: null })} title="back to all the scenes" className="font-serif italic text-2xl hover:text-accent shrink-0">ROOM</button>
          <nav className="flex items-center gap-1.5 text-[13px] min-w-[58px] overflow-hidden">
            <button onClick={() => set({ presetId: null })} className="text-mute hover:text-ink shrink-0">Scenes</button>
            {(s.flat || here) && <>
              <span className="text-line shrink-0">›</span>
              <button onClick={leaveRoom} disabled={!s.flat}
                className={`truncate min-w-0 ${!s.here && s.flat ? 'text-ink' : 'text-mute hover:text-ink'}`}>{s.flat?.name ?? here?.name}</button>
            </>}
            {!s.flat && p && <><span className="text-line shrink-0">›</span><span className="text-ink truncate">{p.title}</span></>}
            {s.flat && here && <><span className="text-line shrink-0">›</span><span className="text-ink shrink-0">{here.name}</span></>}
          </nav>

          {/* every room of the home, one click away, without opening the panel */}
          {s.flat && <div className="hidden lg:flex items-center gap-1 pl-3 ml-1 border-l border-line overflow-x-auto shrink">
            {s.flat.rooms.map(r => <button key={r.id} title={`${onTheFloor(r.items).length} pieces`}
              onClick={() => { enterRoom(r.id); humanEvent({ action: 'room', to: r.id, text: `walked into the ${r.name.toLowerCase()}` }) }}
              className={`px-2 py-0.5 rounded text-[12px] whitespace-nowrap ${s.here === r.id ? 'bg-accent text-bg' : 'text-mute hover:text-ink'}`}>
              {r.name.replace('Bedroom ', 'Bed ')}
            </button>)}
          </div>}

          {/* Not hidden on a narrow layout: this page can be embedded in a frame a few hundred px wide, and
              this pulsing dot is the whole visible proof that a call from another origin landed HERE.
              It was behind lg:, so in the one place the demo points at it, it was not on screen. */}
          {last && <span key={last.t} className="fade font-mono text-[12px] text-accent flex items-center gap-2 shrink-0" title="your agent just used this tool"><span className="w-2 h-2 rounded-full bg-accent pulse" />{last.name}</span>}
          {/* Below 640px the header cannot hold everything, and this is the widest thing in it. On a phone,
              and in a narrow embed, the room and the tool the agent just used are what the
              header is for; saving is not what either is being used for. */}
          <div className="ml-auto shrink-0 hidden sm:block"><Saves /></div>
        </header>
        <div className="flex-1 min-h-0 p-6 flex flex-col gap-2">
          {/* It sits on the thing it changes. In the header it was one control among five, next to a
              breadcrumb and a save button, and people looked at the room without ever seeing it.
              A whole flat is a plan, not a walkthrough, so there is nothing to toggle there. */}
          {!atWholeHome(s) && <div className="shrink-0 flex items-center gap-2">
            <div className="flex rounded-md border border-line overflow-hidden text-[12px]">
              {(['2d', '3d'] as const).map(v => <button key={v} onClick={() => { set({ view: v }); const q = new URLSearchParams(location.search); q.set('view', v); history.replaceState(null, '', `?${q}`); humanEvent({ action: 'view', to: v, text: `switched to the ${v.toUpperCase()} view` }) }}
                aria-pressed={s.view === v} title={v === '2d' ? 'flat plan, for precise work' : 'the room in 3D, and the light in it'}
                className={`px-3 py-1 ${s.view === v ? 'bg-accent text-bg' : 'text-mute hover:text-ink'}`}>{v.toUpperCase()}</button>)}
            </div>
            <span className="text-mute text-[11px] hidden sm:inline">{s.view === '3d' ? 'the room in 3D' : 'flat plan'}</span>
          </div>}
          <div className="flex-1 min-h-0 relative">
          {roomPasses(V, s.items) && !banner && !atWholeHome(s) && <div className="rise absolute left-1/2 -translate-x-1/2 top-3 z-10 px-4 py-2 rounded-full bg-bg border border-green/40 text-[13px] text-green shadow-lg">✓ All rules pass</div>}
          {(s.proposals.length > 1 || (s.view === '3d' && s.proposals.length > 0)) && <div className="rise absolute left-1/2 -translate-x-1/2 top-3 z-10 px-4 py-2 rounded-full bg-bg border border-accent/50 text-[13px] flex items-center gap-3 shadow-lg">
            <span className="text-accent">agent proposes {s.proposals.length} move{s.proposals.length === 1 ? '' : 's'} — nothing has moved yet</span>
            <button onClick={acceptAll} className="px-2.5 py-0.5 rounded-full border border-green text-green text-[12px] hover:bg-green hover:text-bg">✓ accept all</button>
            <button onClick={rejectAll} className="px-2.5 py-0.5 rounded-full border border-red text-red text-[12px] hover:bg-red hover:text-bg">✗ keep mine</button></div>}
          {banner && !(s.proposals.length > 1 || (s.view === '3d' && s.proposals.length > 0)) && <div key={banner.id} className="rise absolute left-0 right-0 mx-auto w-fit top-3 z-10 max-w-[90%] px-4 py-2 rounded-2xl bg-bg border border-line text-[13px] flex flex-wrap items-center justify-center gap-2 shadow-lg">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NOTE_COLOR[banner.kind] }} /><span className="text-mute">agent</span><span>{banner.text}</span>
            {/* Pressing reply used to put the input in the side panel, three hundred pixels away from
                the sentence being answered — and on a narrow layout the panel is shut, so the box the
                page had just asked you to type in was not on screen at all. It opens here, under the
                question. */}
            {s.replyTo === banner.id
              ? <form className="flex items-center gap-2 shrink-0 w-full sm:w-auto" onSubmit={e => { e.preventDefault()
                  const v = (e.currentTarget.elements.namedItem('r') as HTMLInputElement).value.trim(); if (v) answerNote(banner.id, v) }}>
                  <input name="r" autoFocus aria-label="Your reply to the agent" placeholder="type and press Enter…"
                    className="flex-1 min-w-0 sm:w-56 bg-panel border border-accent/60 rounded-full px-3 py-0.5 text-[12px] outline-none focus:border-accent" />
                  <button type="button" onClick={() => set({ replyTo: null })} aria-label="cancel the reply" className="text-mute hover:text-ink text-[12px] shrink-0">✕</button>
                </form>
              : <span className="flex items-center gap-2 shrink-0">{(banner.options ?? (banner.kind === 'idea' ? ['✓ do it', '✗ no'] : ['👍'])).map(o => <button key={o} onClick={() => answerNote(banner.id, o)} className="ml-1 px-2.5 py-0.5 rounded-full border border-accent text-accent text-[12px] hover:bg-accent hover:text-bg whitespace-nowrap">{o}</button>)}
                <button onClick={() => set({ replyTo: banner.id })} className="px-2.5 py-0.5 rounded-full border border-line text-mute text-[12px] hover:text-ink">reply</button></span>}</div>}
          {/* A bubble on the plan, or one in the 3D view, sends its reply here too — the panel is the
              one place the answer must not appear, because it is shut on a narrow layout and it is
              nowhere near the sentence being answered. */}
          {(() => { const n = s.replyTo && s.notes.find(x => x.id === s.replyTo)
            return n && n.id !== banner?.id ? <div className="rise absolute left-0 right-0 mx-auto w-fit top-3 z-20 max-w-[90%] px-4 py-2 rounded-2xl bg-bg border border-accent/50 text-[13px] flex items-center gap-2 shadow-lg">
              <span className="text-mute shrink-0 max-w-[40vw] truncate">re: “{n.text}”</span>
              <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault()
                const v = (e.currentTarget.elements.namedItem('r') as HTMLInputElement).value.trim(); if (v) answerNote(n.id, v) }}>
                <input name="r" autoFocus aria-label="Your reply to the agent" placeholder="type and press Enter…"
                  className="w-56 bg-panel border border-accent/60 rounded-full px-3 py-0.5 text-[12px] outline-none focus:border-accent" />
                <button type="button" onClick={() => set({ replyTo: null })} aria-label="cancel the reply" className="text-mute hover:text-ink text-[12px]">✕</button>
              </form></div> : null })()}
          {s.eye && s.view === '3d' && <div className="rise absolute left-1/2 -translate-x-1/2 bottom-5 z-10 px-4 py-2 rounded-full bg-bg border border-accent/50 text-[13px] flex items-center gap-3 shadow-lg">
            <span className="text-mute">you are sitting in</span><span className="text-accent">{s.eye.label.toLowerCase()} ({s.eye.id})</span>
            <span className="text-mute text-[12px]">· eye {s.eye.cm}cm</span>
            <button onClick={() => { set({ eye: null }); humanEvent({ action: 'eye', text: 'stood back up out of the seat' }) }} className="px-2.5 py-0.5 rounded-full border border-line text-mute text-[12px] hover:text-ink">stand up</button>
          </div>}
          {atWholeHome(s) ? <FlatPlan />
            : s.view === '3d'
              ? <Boundary only="the 3D view"><Suspense fallback={<div className="h-full grid place-items-center text-mute text-[13px]">building the room…</div>}><Scene3D V={V} /></Suspense></Boundary>
              : <Plan violations={V} />}
          </div>
        </div>
      </main>
      <Panel V={V} />
    </div>
  )
}

function Landing() {
  const s = useStore()
  const n = s.mcpTools.length
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-14">
        <div className={`mb-8 rounded-lg border px-4 py-3 text-[13px] flex items-center gap-3 ${s.mcp === 'ok' ? 'border-green/40 bg-green/5' : s.mcp === 'missing' ? 'border-red/40 bg-red/5' : 'border-line'}`}>
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.mcp === 'ok' ? 'bg-green' : s.mcp === 'missing' ? 'bg-red' : 'bg-mute'}`} />
          {s.mcp === 'ok'
            ? <span><span className="text-green">WebMCP is live in this browser.</span> <span className="text-mute">Your agent can already see {n} tool{n === 1 ? '' : 's'} on this page — pick a scene and it will see more.</span></span>
            : s.mcp === 'missing'
              ? <span><span className="text-red">No WebMCP in this browser.</span> <span className="text-mute">Everything still works by hand. For the agent: open this URL in {GET_WEBMCP}.</span></span>
              : <span className="text-mute">checking for WebMCP…</span>}
        </div>
        <h1 className="font-serif text-6xl leading-none">ROOM</h1>
        <p className="mt-3 font-serif text-2xl">A web page that argues back.</p>
        <p className="mt-3 text-mute max-w-2xl text-[15px]">Your agent proposes; the room measures. It owns every number — collisions, door swings, walkway flood-fill, sun angles, wheelchair turning circles — so the agent never guesses a coordinate. It ships its own arranger for the agent to <em>beat</em>. And when the agent says “the sofa is 2.2 m from the TV”, the page checks that out loud and corrects it in front of you.</p>
        <p className="mt-3 text-mute max-w-2xl text-[15px]">No screenshots, no DOM scraping. Structured tools over WebMCP — and the tool list changes as the room does. Pick a scene, open it in your agent's browser, and say the line — or press <span className="text-accent">Watch a session</span> inside any scene and let the page run the calls itself.</p>
        <Resume />
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-4">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => loadPreset(p.id)} className="text-left rounded-xl border border-line bg-panel hover:border-mute transition-colors overflow-hidden group">
              <div className="aspect-[4/3] bg-bg p-3"><Plan room={p.room} items={p.items} mini violations={check(p.room, p.items, p.profile)} /></div>
              <div className="p-4">
                <div className="font-serif text-xl">{p.title}</div>
                <div className="text-mute text-[13px] mt-1 min-h-[3em]">{p.tagline}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-10 rounded-xl border border-line bg-panel p-5 grid md:grid-cols-[minmax(0,1fr)_320px] gap-5 items-center">
          <div>
            <div className="font-serif text-xl">Or plan a whole home</div>
            <p className="text-mute text-[13px] mt-1">A hall, that many bedrooms, a kitchen and a bathroom, with the walls between them — each room judged on its own terms, and <span className="text-ink">the agent's tool list changes with the room it is standing in</span>. A bathroom grows a wheelchair audit. A bedroom with a bed in it grows a bedside check. A kitchen with a hob grows the work triangle. Nobody tells the agent where it is; it finds out by reading its own tools.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
            {([[1, 2], [2, 4], [3, 5]] as const).map(([b, ppl]) => (
              <button key={b} onClick={() => showFlat(buildFlat(b, ppl))}
                className="px-3.5 py-2 rounded-lg border border-accent/60 text-accent hover:bg-accent hover:text-bg">
                {b}BHK <span className="opacity-70">· for {ppl}</span>
              </button>
            ))}
            <span className="text-mute text-[12px]">or tell your agent “we're four people moving into a 2BHK”</span>
          </div>
          </div>
          <div className="rounded-lg border border-line bg-bg p-3 h-[220px] overflow-hidden"><FlatPlan sample={SAMPLE_FLAT} /></div>
        </div>

        <div className="mt-10 rounded-xl border border-line bg-panel p-5 text-[13px]">
          <div className="text-[11px] uppercase tracking-wider text-mute mb-2">Trying it in 60 seconds</div>
          <ol className="space-y-1.5 text-mute list-decimal list-inside">
            <li>Open this page inside your agent's browser (the light above turns green).</li>
            <li>Pick <span className="text-ink">Dad visits</span>. It scores 90. Say to your agent: <span className="text-ink font-serif text-[14px]">“My dad uses a wheelchair. Make this room work for him.”</span></li>
            <li>Watch the panel: the score drops to 41, an <span className="font-mono text-ink">access_check</span> tool appears that did not exist a second ago, red circles show where a chair can't turn, and the agent's proposals arrive as ghosts you approve or refuse. Drag something yourself — the agent's next call sees it.</li>
          </ol>
          <p className="mt-3 pt-3 border-t border-line text-mute">No agent to hand? Open any scene and press <span className="text-accent">Watch a session</span>. The page runs the same tool calls a real agent makes — real calls on the real room, not a recording.</p>
        </div>
        <div className="mt-10 rounded-xl border border-line bg-panel p-5 text-[13px]">
          <div className="text-[11px] uppercase tracking-wider text-mute mb-2">It isn't really about furniture</div>
          <p className="text-mute max-w-3xl">A room is the smallest honest example of a page holding a model the agent cannot see. The geometry is not in the DOM — no screenshot tells you a wheelchair needs 150cm to turn, or that 62cm is not a corridor. The same shape is waiting in <span className="text-ink">seating plans</span> (sightlines, fire exits), <span className="text-ink">warehouse racking</span> (reach heights, pick paths), <span className="text-ink">stage rigs</span> (loads, focus angles), <span className="text-ink">PCB layout</span> (clearances, thermals), <span className="text-ink">rosters</span> (rest rules, cover) and <span className="text-ink">planting plans</span> (sun hours, mature spread). Each of them today gets an agent that reads the screen and proposes something plausible and wrong. Each could be handed a search that only returns legal answers, and a page willing to say no.</p>
        </div>
        <p className="mt-8 text-mute text-[12px]">Built for the WebMCP Challenge. Nothing leaves your browser.</p>
      </div>
    </div>
  )
}

/** Where the human left off, offered rather than imposed. Stored in this browser, on this device. */
function Resume() {
  useStore()                      // subscribed for the re-render, not for the value: the card has to
  const last = lastSession()      // disappear the moment the human dismisses the session
  if (!last) return null
  const when = new Date(last.t)
  return (
    <div className="mt-10 rounded-xl border border-accent/40 bg-accent/5 p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-[13px]">Pick up where you left off</div>
        <div className="text-mute text-[12px] mt-0.5 truncate">
          {last.flat
            ? `${last.flat.name} · ${last.flat.rooms.filter(r => r.items?.length).length} of ${last.flat.rooms.length} rooms furnished`
            : `${last.room.w}×${last.room.h}cm · ${last.items.length} pieces · ${last.profile}`}
          {!last.flat && last.brief ? ` · for ${whoPhrase(last.brief)} to ${last.brief.activity}` : ''}
          {' · '}{when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <button onClick={() => restore(last)} className="px-3 py-1.5 rounded-md border border-accent text-accent text-[12px] hover:bg-accent hover:text-bg shrink-0">resume</button>
      <button onClick={() => { forgetSession(); set({}) }} title="forget this session" className="text-mute hover:text-red px-1 shrink-0">×</button>
    </div>
  )
}

/** The human's own shelf, on their own machine. Lives in the header rather than the panel so it is
 *  still there when the panel is hidden. `layouts` is the agent's scratch space for comparing options
 *  inside one session; this survives closing the tab. Nothing is uploaded — there is nowhere to. */
function Saves() {
  const s = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [full, setFull] = useState<'full' | 'blocked' | 'no-name' | null>(null)
  const [just, setJust] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('mousedown', away); addEventListener('keydown', esc)
    return () => { removeEventListener('mousedown', away); removeEventListener('keydown', esc) }
  }, [open])

  const saves = listSaves()
  const save = () => {
    const n = name.trim() || (PRESETS.find(x => x.id === s.presetId)?.title ?? 'My room')
    // Every failure used to show "That is 12 rooms — delete one to make space", including a private
    // window where nothing had ever been saved. Telling somebody to delete rooms they do not have is
    // worse than saying nothing: they go looking. saveRoom says which of the three it is.
    const why = saveRoom(n)
    if (why !== 'ok') { setFull(why); return }
    setName(''); setFull(null); setJust(n); setTimeout(() => setJust(''), 1600)
    humanEvent({ action: 'saved', detail: n, text: `saved this room as \u201c${n}\u201d in their browser` })
  }

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(o => !o)} title={`save this ${s.flat ? "home, every room of it" : "room"}, or reopen one you saved before — kept in this browser only`}
        className={`px-2.5 py-1 rounded-md border text-[12px] flex items-center gap-1.5 ${open ? 'border-accent text-accent' : 'border-line text-mute hover:text-ink hover:border-mute'}`}>
        {just ? <span className="text-green">saved “{just}”</span> : <>Save this {s.flat ? 'home' : 'room'}{saves.length ? <span className="font-mono text-mute">{saves.length}</span> : null}</>}
      </button>
      {open && <div className="rise absolute right-0 top-9 z-30 w-[300px] rounded-xl border border-line bg-panel shadow-xl p-4 text-[13px]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-mute">Saved on this device</span>
          <span className="text-[11px] text-mute">{saves.length}/12</span>
        </div>
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()}
            autoFocus aria-label={s.flat ? 'Name for this home' : 'Name for this room'} placeholder={s.flat ? 'name this home…' : 'name this room…'} maxLength={24}
            className="flex-1 min-w-0 bg-bg border border-line rounded px-2 py-1 text-[12px] outline-none focus:border-accent" />
          <button onClick={save} className="px-3 py-1 rounded border border-line text-[12px] text-mute hover:text-ink hover:border-mute">save</button>
        </div>
        {full && <p className="text-[11px] text-red mt-1.5">{full === 'full' ? `That is ${MAX_SAVES} rooms — delete one to make space.`
          : s.storage === 'blocked' ? 'This browser will not let the page store anything — try a normal window.'
          : 'This browser has run out of room. Delete a saved room, or clear some site data.'}</p>}
        {saves.length > 0 && <ul className="mt-2 space-y-1 max-h-[220px] overflow-y-auto">
          {saves.map(v => (
            <li key={v.name} className="flex items-center gap-2 text-[12px] group">
              <button onClick={() => { loadSave(v.name); setOpen(false) }} className="flex-1 min-w-0 text-left truncate text-mute hover:text-accent" title="open this room">
                {v.name} <span className="text-[11px] opacity-60">· {v.items.length} pieces</span>
              </button>
              <button onClick={() => deleteSave(v.name)} title={`delete “${v.name}”`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-mute hover:text-red px-1">×</button>
            </li>
          ))}
        </ul>}
        <p className="text-[11px] text-mute mt-2 leading-relaxed">Kept in this browser, on this device. Closing the tab keeps your work; the × deletes a room for good.</p>
      </div>}
    </div>
  )
}
