import { PRESETS, type DemoStep } from './presets'
import { feed, set, state } from './store'

/** A scripted agent session. Most people who open this page have no WebMCP agent attached, and the
 *  argument the page makes is invisible without one — so this plays the same calls a real agent
 *  makes, through the very same `window.room` entry point the tools already expose. Nothing is
 *  faked: every step is a real tool call, mutating the real room, narrated by the real transcript.
 *  ponytail: reuses window.room rather than a second execution path, so a demo cannot drift from
 *  what an agent actually gets. */
/** The home's session is built rather than written down, because it depends on how many bedrooms the
 *  human asked for. It walks the flat furnishing as it goes, and the point it makes is the one nothing
 *  else in the project can: the tools in the agent's hand change as it moves between the rooms. */
function flatDemo(): DemoStep[] {
  const f = state.flat!
  const bed1 = f.rooms.find(r => r.kind === 'bedroom')!
  return [
    ['rooms', {}, `reads the whole home first — ${f.rooms.length} rooms, and which of them are still empty`],
    ['enter_room', { id: bed1.id }, `walks into the ${bed1.name.toLowerCase()}. The goal changes to "bedroom" on its own — nobody told it to`],
    ['add_item', { type: 'bed_double' }, 'adds the bed WITHOUT coordinates — the page owns the geometry, so the page chooses the spot'],
    ['add_item', { type: 'wardrobe', prefer: 'wall' }, 'and a wardrobe against a wall, because a wardrobe has an unfinished back'],
    ['bedside_check', {}, 'now a tool exists that did not exist a moment ago: can you actually get out of this bed?'],
    ['enter_room', { id: 'kitchen' }, 'walks into the kitchen — and the bedside check disappears, because there is no bedside here'],
    ['add_item', { type: 'counter', prefer: 'wall' }, 'worktop against the wall'],
    ['add_item', { type: 'sink', prefer: 'near_window' }, 'sink under the window, where you would want to stand'],
    ['add_item', { type: 'hob' }, 'a hob — and watch the tool list again'],
    ['add_item', { type: 'fridge', prefer: 'wall' }, 'and a fridge'],
    ['work_triangle', {}, 'the kitchen grew its own rule: sink, hob, fridge, and whether the triangle between them works'],
    ['enter_room', { id: 'bath' }, 'into the bathroom, which sets itself to accessibility without being asked'],
    ['add_item', { type: 'toilet', prefer: 'wall' }, 'a toilet against the wall'],
    ['add_item', { type: 'basin', prefer: 'wall' }, 'and a basin — and the page checks something no floor plan usually does'],
    ['access_check', {}, 'the wheelchair audit is simply there, unasked, because the room is judged as accessible. Three rooms, three different tools, one agent'],
    ['rooms', {}, 'and the whole home again — what is furnished, what still is not, and what each room scores'],
  ]
}

export const demoFor = (id: string | null): DemoStep[] | undefined =>
  state.flat ? flatDemo() : PRESETS.find(p => p.id === id)?.demo

let stop = false
export const stopDemo = () => { stop = true }

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function runDemo() {
  const steps = demoFor(state.presetId)
  if (!steps || state.demo !== null) return
  const room = (window as unknown as { room?: Record<string, (a?: unknown) => Promise<unknown>> }).room
  if (!room) return
  stop = false
  let last = ''
  feed('you', 'played the scripted session — these are real tool calls, not a recording')
  // Anything thrown out here leaves state.demo set, and the guard above then refuses to start ever
  // again: the button that exists precisely for the moment the live agent misbehaves would be dead
  // for the rest of the session, on camera, with no way back but a reload.
  try {
    for (let i = 0; i < steps.length && !stop; i++) {
      set({ demo: i })
      const [name, args] = steps[i]
      // a script cannot know the id of a piece it is about to create, so `$last` stands for it
      const filled = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v === '$last' ? last : v]))
      try {
        const out = await room[name]?.(filled) as { item?: { id?: string } } | undefined
        if (out?.item?.id) last = out.item.id
      } catch { /* a demo step is never worth breaking the page over */ }
      await wait(2200)
    }
  } finally { set({ demo: null }) }
}
