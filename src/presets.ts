import { CATALOG, type ItemType } from './catalog'
import type { Item, Profile, Room, Rot } from './store'

/** `demo` is a scripted agent session: the same tool calls, in order, that a real agent makes on this
 *  scene. It exists because most people who open this page have no WebMCP agent attached, and the
 *  point of the page is invisible without one. Each step is [tool, args, the line the page narrates]. */
export type DemoStep = [tool: string, args: Record<string, unknown>, note: string]
export type Preset = { id: string; title: string; tagline: string; prompt: string; profile: Profile; room: Room; items: Item[]; demo?: DemoStep[] }

const I = (id: string, type: ItemType, x: number, y: number, rot: Rot = 0): Item => ({ id, type, x, y, rot, w: CATALOG[type].w, h: CATALOG[type].h })

const living: Room = {
  w: 600, h: 450,
  doors: [{ id: 'door', wall: 'S', pos: 260, width: 90 }],
  windows: [{ id: 'north window', wall: 'N', pos: 80, width: 160 }, { id: 'east window', wall: 'E', pos: 100, width: 140 }],
  outlets: [{ x: 0, y: 300 }, { x: 600, y: 30 }, { x: 420, y: 450 }],
}

export const PRESETS: Preset[] = [
  {
    id: 'living-pile', title: 'The pile', tagline: 'Movers dumped everything in a corner. Make a home theater.',
    prompt: 'Set this up as a home theater.', profile: 'general', room: living,
    demo: [
      ['get_room', {}, 'reads the room — everything is piled in one corner'],
      ['baseline', {}, "runs the page's own arranger first, so it has a number to beat"],
      ['brief', { people: 4, activity: 'watch', who: 'us' }, 'asks who it is for — four people watching, not one'],
      ['sense_room', {}, 'no focal point, no seating group, three dead corners'],
      ['arrange', { items: ['sofa', 'chair_a', 'chair_b'], as: 'row', gap: 30, centre: 'room', facing: 'tv' }, 'lines up three seats facing the television in ONE call — the page does the arithmetic'],
      ['find_space', { id: 'table', facing: 'sofa', ignore: ['table'] }, 'then asks where the coffee table goes now the seats have moved'],
      ['say', { item: 'sofa', kind: 'ok', text: 'Three seats now face the TV, evenly spaced.' }, 'explains itself on the plan, not in the chat'],
      ['show', { view: '3d' }, 'stands back and looks at it'],
    ],
    items: [I('sofa', 'sofa', 20, 20), I('chair_a', 'armchair', 60, 60), I('chair_b', 'armchair', 140, 80), I('tv', 'tv_unit', 40, 120), I('table', 'coffee_table', 180, 130), I('shelf', 'bookshelf', 200, 40), I('plant', 'plant', 260, 20), I('rug', 'rug', 30, 30), I('ceil', 'ceiling_light', 275, 200)],
  },
  {
    id: 'studio-tight', title: 'Studio, tight', tagline: 'Bed blocks the door. Fit bed, desk and sofa.',
    prompt: 'Fit the bed, desk and sofa without blocking the door, and keep the desk near power.', profile: 'bedroom',
    demo: [
      ['get_room', {}, 'reads the room — the bed is sitting across the only door'],
      ['brief', { people: 1, activity: 'sleep', who: 'me' }, 'asks who lives here'],
      ['find_space', { id: 'bed', prefer: 'wall', ignore: ['bed'] }, 'asks the page where the bed fits — it never invents a coordinate'],
      ['arrange', { items: ['bed', 'wardrobe'], as: 'column', gap: 20, centre: 'room', propose: true }, 'PROPOSES rather than moves — ghosts with a ✓ and a ✗, because it is your bed, not its bed'],
      ['say', { item: 'bed', kind: 'idea', text: 'Moving the bed clears the door. Accept the ghosts to apply it.' }, 'and then it waits for you — the tool call is genuinely parked on a human'],
    ],
    room: { w: 400, h: 500, doors: [{ id: 'door', wall: 'W', pos: 390, width: 80 }], windows: [{ id: 'north window', wall: 'N', pos: 120, width: 160 }], outlets: [{ x: 400, y: 100 }, { x: 0, y: 100 }] },
    items: [I('bed', 'bed_single', 0, 400, 90), I('desk', 'desk', 250, 0), I('chair', 'chair', 300, 80), I('sofa', 'sofa', 100, 180), I('wardrobe', 'wardrobe', 270, 430), I('lamp', 'lamp', 20, 20), I('ceil', 'ceiling_light', 175, 225)],
  },
  {
    id: 'office-glare', title: 'Office, glare', tagline: 'Desk faces the window, far from power. Fix it for video calls.',
    prompt: 'Make this a video-call-friendly office.', profile: 'office',
    demo: [
      ['get_room', {}, 'reads the room — the desk faces straight into the east window'],
      ['sun', { hour: 16 }, 'moves the sun to 4pm and works out where the beam lands'],
      ['sense_room', {}, 'the light report: which window, how strong, how far across the floor'],
      ['add_item', { type: 'blind' }, 'the page keeps a remedy for every rule it enforces — so it adds a blind'],
      ['dock_item', { id: '$last', to: 'east window' }, 'docks it to the window, cut to that window\'s exact width'],
      ['say', { item: 'desk', kind: 'ok', text: 'Blind on the east window kills the 4pm glare on your screen.' }, 'says what it did and why'],
      ['show', { view: '3d' }, 'shows the room with the blind down'],
    ],
    room: { w: 300, h: 350, doors: [{ id: 'door', wall: 'S', pos: 20, width: 80 }], windows: [{ id: 'east window', wall: 'E', pos: 80, width: 150 }], outlets: [{ x: 0, y: 300 }] },
    items: [I('desk', 'desk', 150, 120, 270), I('chair', 'chair', 100, 130), I('shelf', 'bookshelf', 200, 10), I('lamp', 'lamp', 260, 300), I('plant', 'plant', 20, 20), I('ceil', 'ceiling_light', 125, 150)],
  },
  {
    // a normal 15m2 living room, not a showroom: the furniture is fine, the CLEARANCES are not
    id: 'dad-visits', title: 'Dad visits', tagline: 'Looks fine — until someone in a wheelchair comes over.',
    prompt: 'My dad uses a wheelchair. Make this room work for him.', profile: 'general',
    demo: [
      ['get_room', {}, 'reads the room — 420×360, one door, nine pieces, scoring 90'],
      ['brief', { people: 3, activity: 'talk', who: 'my family' }, 'asks who the room is for before touching anything'],
      ['set_profile', { profile: 'accessibility' }, 'switches the goal to accessibility — the page grows a tool that did not exist a second ago'],
      ['sense_room', {}, 'the score falls from 90 to 41. Red circles are where a wheelchair cannot turn'],
      ['access_check', {}, 'runs the audit tool that just appeared'],
      ['move_items', { id: 'sofa', x: 0, y: 40, rot: 90 }, 'tries to swing the sofa round to the door wall — and the page REFUSES. Nothing moved. It names the rule and hands back spots that work'],
      ['find_space', { id: 'chair_a', prefer: 'wall', ignore: ['chair_a'] }, 'so it asks the page where the armchair fits instead — it never invents a coordinate'],
      // the bluff is deliberate, and it bluffs in the direction that matters: an agent claiming the room
      // is fine now. Understating a gap invents a problem, which is nobody's fear of an agent.
      ['say', { item: 'chair_a', kind: 'warn', text: 'There is 95cm to the table — wide enough for a wheelchair.', claim: { kind: 'gap', a: 'chair_a', b: 'table', value: 95 } }, 'claims the room is fine now — and the page checks the number against its own geometry, in front of you'],
      ['show', { eye: 'chair_b', eye_height: 115 }, 'sits you in the chair at wheelchair eye height, so you see it yourself'],
    ],
    room: { w: 420, h: 360, doors: [{ id: 'door', wall: 'W', pos: 30, width: 90 }],
      windows: [{ id: 'north window', wall: 'N', pos: 120, width: 150 }, { id: 'east window', wall: 'E', pos: 60, width: 120 }],
      outlets: [{ x: 420, y: 60 }, { x: 200, y: 360 }, { x: 0, y: 300 }] },
    items: [I('tv', 'tv_unit', 160, 0), I('sofa', 'sofa', 110, 240, 180), I('chair_a', 'armchair', 330, 40, 90), I('chair_b', 'armchair', 10, 200, 270), I('table', 'coffee_table', 160, 150), I('shelf', 'bookshelf', 392, 200, 90), I('plant', 'plant', 370, 310), I('rug', 'rug', 110, 140), I('ceil', 'ceiling_light', 185, 155)],
  },
  {
    // A single open-plan room on moving day. Not a flat — a flat is several rooms with different
    // jobs, and that is what define_flat builds. This is the harder case: four ways of living with
    // no walls at all to separate them.
    id: 'open-plan', title: 'Open plan', tagline: 'One room doing four jobs at once — sleep, eat, work, sit. No walls to hide behind.',
    prompt: 'Two of us live in this one room. Zone it properly — somewhere to sleep, somewhere to eat, somewhere to work, somewhere to sit.', profile: 'general',
    demo: [
      ['get_room', {}, 'reads the room — 820×600, 13 pieces, all of it stacked against one wall'],
      ['brief', { people: 2, activity: 'talk', who: 'the two of us' }, 'asks who lives here before it moves anything'],
      ['sense_room', {}, 'and names what is wrong: no focal point, nothing grouped, three dead corners'],
      ['baseline', {}, "sets the page's own arranger loose on all 13 pieces — one call, and a score to beat"],
      ['arrange', { items: ['sofa', 'chair_a'], as: 'row', gap: 40, facing: 'tv' }, 'then builds a sitting zone by hand: sofa and armchair side by side, both facing the television'],
      ['dock_item', { id: 'desk_chair', to: 'desk' }, 'then the detail work — the desk chair tucked in at its own desk'],
      ['dock_item', { id: 'ch1', to: 'dining' }, 'and the dining chairs at the dining table, not orbiting the desk'],
      ['dock_item', { id: 'ch2', to: 'dining' }, 'spaced around it, on the side with room to pull out'],
      ['dock_item', { id: 'lamp', to: 'chair_a' }, 'the floor lamp moved to the end of the armchair, at shoulder height, where it is any use'],
      ['add_item', { type: 'ceiling_light' }, 'the page says three zones are still dark, so it adds a second ceiling light — and lets the page pick the spot rather than inventing one'],
      ['add_item', { type: 'ceiling_light' }, 'and a third, because 49m² is not one light bulb'],
      ['sense_room', {}, 'reads it again: the same flat, now four zones instead of a heap'],
      ['say', { kind: 'idea', text: 'Sitting and desk zones are clear. Bed and table still read as one block — this room wants a screen.' }, 'and finishes by telling you what is STILL wrong. 75/100 on a room this hard is the honest answer, not 100'],
    ],
    room: { w: 820, h: 600,
      doors: [{ id: 'door', wall: 'S', pos: 360, width: 90 }],
      windows: [{ id: 'north window', wall: 'N', pos: 100, width: 220 }, { id: 'east window', wall: 'E', pos: 160, width: 180 }],
      outlets: [{ x: 0, y: 140 }, { x: 820, y: 300 }, { x: 440, y: 600 }, { x: 260, y: 0 }] },
    items: [
      I('bed', 'bed_double', 10, 20), I('wardrobe', 'wardrobe', 20, 40),
      I('desk', 'desk', 30, 230), I('desk_chair', 'chair', 60, 250),
      I('dining', 'dining_table', 20, 300), I('ch1', 'chair', 40, 320), I('ch2', 'chair', 90, 310),
      I('sofa', 'sofa', 10, 400), I('chair_a', 'armchair', 180, 410),
      I('tv', 'tv_unit', 150, 250), I('rug', 'rug', 60, 150),
      I('ceil', 'ceiling_light', 260, 180), I('lamp', 'lamp', 110, 470),
    ],
  },
  {
    id: 'blank', title: 'Blank room', tagline: 'Tell the agent your room size and what you own.',
    prompt: 'I have a 5×4m bedroom, door on the south wall, window north. Add a double bed, wardrobe and desk and lay it out.', profile: 'general',
    demo: [
      ['set_room', { w: 14, h: 12, units: 'ft', doors: [{ wall: 'S', pos: 150, width: 90 }], windows: [{ wall: 'N', pos: 120, width: 160 }], outlets: [{ x: 0, y: 200 }, { x: 420, y: 100 }] }, 'builds the room from FEET — it does not convert in its head, it passes the units'],
      ['brief', { people: 2, activity: 'sleep', who: 'us' }, 'asks who will sleep here'],
      ['add_item', { type: 'bed_double' }, 'adds the bed'],
      ['add_item', { type: 'wardrobe' }, 'adds the wardrobe'],
      ['add_item', { type: 'desk' }, 'adds the desk'],
      ['baseline', {}, "lets the page's own arranger place them, then reads the score"],
      ['sense_room', {}, 'and judges the result it just made'],
    ],
    room: { w: 500, h: 400, doors: [{ id: 'door', wall: 'S', pos: 200, width: 90 }], windows: [{ id: 'north window', wall: 'N', pos: 150, width: 160 }], outlets: [{ x: 0, y: 200 }, { x: 500, y: 200 }] },
    items: [],
  },
]
export const preset = (id: string) => PRESETS.find(p => p.id === id)
