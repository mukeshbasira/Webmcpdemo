import { describe, expect, it } from 'vitest'
import toolsSource from './tools.ts?raw'
import appSource from './App.tsx?raw'
import panelSource from './Panel.tsx?raw'
import submission from '../SUBMISSION.md?raw'
import readme from '../README.md?raw'
import shell from '../index.html?raw'
import rulesSource from './rules.ts?raw'
import verifySource from './verify.ts?raw'
import spaceSource from './space.ts?raw'
import dockSource from './dock.ts?raw'
import planSource from './Plan.tsx?raw'
import lightSource from './light.ts?raw'
import storeSource from './store.ts?raw'
import { beamReach } from './sun'
import type { Room } from './store'
import { TOOLS, activeTools, loadPreset, plain, violations, wrap } from './tools'
import { GET_WEBMCP, MAX_SAVES, PROFILES, SEASONS, answerNote, state } from './store'
import { DOCK } from './dock'
import demo from './demo.ts?raw'
import { PROFILE_RULES } from './rules'
import { buildFlat } from './flat'
import { set } from './store'
import { PRESETS } from './presets'
import demoScript from '../DEMO.md?raw'
import { TURN, bedSide, check, minWalk, pullOut, score } from './rules'
import { CATALOG, CATALOG_TYPES } from './catalog'
import { Glyph } from './glyphs'

/** Things that only matter once this is a live page an agent talks to. `npm run build` type-checks
 *  and bundles and knows none of them; the behaviour tests pin what the tools DO and know none of
 *  them either. Each one here is something that shipped, or nearly did. */
describe('fit to deploy', () => {
  // The whole argument of this page is that somebody should be able to get around a room, so a
  // control nobody can name is not a small thing. The daylight slider read as "9", and neither
  // select said what it was for.
  it('every field a person types into or drags says what it is', () => {
    // [\s\S]*? rather than [^>]*, because a JSX handler is full of => arrows and the tag does not
    // end at the first > it happens to contain
    const tags = (src: string) => [...src.matchAll(/<input\b[\s\S]*?\/>/g), ...src.matchAll(/<select\b[\s\S]*?<\/select>/g)]
    const nameless = Object.entries({ 'App.tsx': appSource, 'Panel.tsx': panelSource }).flatMap(([file, src]) =>
      tags(src)
        .filter(m => !m[0].includes('aria-label')
          // the one exception: Num wraps its field in a <label> with an sr-only caption
          && !m[0].includes('type="number"'))
        .map(m => `${file}: ${m[0].slice(0, 60)}`))
    expect(nameless).toEqual([])
  })

  // https://developer.chrome.com/docs/ai/webmcp/secure-tools — and the people who wrote these numbers
  // are judging this
  it('every tool description is inside Chrome\'s published budget', () => {
    const over = TOOLS.filter(t => t.description.length > 500).map(t => `${t.name} (${t.description.length})`)
    expect(over, 'over 500 characters').toEqual([])
    expect(TOOLS.filter(t => t.name.length > 30).map(t => t.name), 'names over 30 characters').toEqual([])
    // walk into nested objects: say.claim holds four properties of its own, and a budget that only
    // looked at the top level would have let any of them run to any length
    const walk = (props: any, path: string): string[] => Object.entries(props ?? {}).flatMap(([k, v]: [string, any]) =>
      [...((v?.description ?? '').length > 150 ? [`${path}.${k} (${v.description.length})`] : []),
       ...walk(v?.properties, `${path}.${k}`), ...walk(v?.items?.properties, `${path}.${k}[]`)])
    expect(TOOLS.flatMap(t => walk((t.inputSchema as any).properties, t.name)), 'parameter descriptions over 150 characters').toEqual([])
  })

  // a tool nobody can narrate leaves the human watching an empty transcript while the room changes
  it('every tool has a plain-English transcript line', () => {
    expect(TOOLS.filter(t => !toolsSource.includes(`case '${t.name}':`)).map(t => t.name)).toEqual([])
  })

  it('and never narrates a call that failed', () => {
    for (const t of TOOLS) expect(plain(t.name, {}, { error: 'nope' }), t.name).toBeNull()
  })

  // this has shipped twice: a piece with no glyph renders as a label floating over nothing
  it('every catalogue piece can be drawn', () => {
    expect(CATALOG_TYPES.filter(t => !Glyph({ type: t, w: CATALOG[t].w, h: CATALOG[t].h }))).toEqual([])
  })

  // the only thing a judge without a WebMCP agent ever sees run
  it('every scene has a scripted session', () => {
    expect(PRESETS.filter(p => !p.demo?.length).map(p => p.id)).toEqual([])
  })

  // "Screen at eye level" sat in the theater profile's rule list, and in the count three write-ups
  // quote, with a check behind it that could not fire: the only screen the page has is a tv_unit, and
  // the threshold it was compared against was a literal it never crossed. Coverage found that one.
  // This is the cheaper half of the question — a label with nothing behind it at all.
  it('every rule the page advertises is a rule something can raise', () => {
    const labels = [...(rulesSource.match(/RULE_LABEL: Record<Rule, string> = \{[\s\S]*?\n\}/)?.[0] ?? '')
      .matchAll(/([a-z_]+):\s*'/g)].map(m => m[1])
    expect(labels.length, 'the rule labels stopped being readable from the source').toBeGreaterThan(20)
    const raised = new Set([...rulesSource.matchAll(/rule: '([a-z_]+)'/g)].map(m => m[1]))
    expect(labels.filter(r => !raised.has(r)), 'named in the rule list, never raised anywhere').toEqual([])
    // and the reverse: a rule raised under a name the list does not carry has no label to print
    expect([...raised].filter(r => !labels.includes(r)), 'raised under a name the rule list does not carry').toEqual([])
    for (const list of Object.values(PROFILE_RULES))
      expect(list.filter(r => !labels.includes(r)), 'a profile asks for a rule with no label').toEqual([])
  })

  // A judge can count these. A submission claiming 28 tools next to 26 of them is the cheapest
  // possible way to lose their trust, and both numbers move as the thing is built.
  it('the counts the write-up claims are the counts in the code', () => {
    const rules = [...(rulesSource.match(/RULE_LABEL: Record<Rule, string> = \{[\s\S]*?\n\}/)?.[0] ?? '')
      .matchAll(/([a-z_]+):\s*'/g)].length
    const missing: string[] = []
    for (const [file, text] of [['SUBMISSION.md', submission], ['README.md', readme]] as const) {
      for (const [claim, real] of [[/(\d+) tools/, TOOLS.length], [/(\d+) rules/, rules],
        [/`readOnlyHint` on the (\w+)/, TOOLS.filter(t => (t as any).readOnly).length],
        [/`destructiveHint` on the (\w+)/, TOOLS.filter(t => (t as any).destructive).length]] as const) {
        const said = text.match(claim)
        // the write-ups spell the small ones: "on the ten tools that only read"
        const WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
        if (!said) { missing.push(`${file} no longer claims ${claim}`); continue }
        expect(WORDS[said[1]] ?? Number(said[1]), `${file} says "${said[0]}", there are ${real}`).toBe(real)
      }
    }
    // the submission makes all four claims; the README makes some of them. What must not happen is
    // both documents quietly dropping one, which is how a guard stops guarding.
    for (const [claim] of [['tools'], ['rules'], ['readOnlyHint'], ['destructiveHint']] as const)
      expect(missing.filter(m => String(m).includes(claim)).length,
        `neither write-up claims anything about ${claim} any more`).toBeLessThan(2)
  })

  // the test count cannot check itself, but the two documents can at least agree with each other
  it('does not quote two different test counts at a judge', () => {
    const said = [...submission.matchAll(/(\d+) tests/g), ...readme.matchAll(/(\d+) tests/g)].map(m => m[1])
    expect(new Set(said).size, `the write-ups claim ${[...new Set(said)].join(' and ')} tests`).toBeLessThan(2)
  })

  // The write-ups and the video script quote this drop as the headline of the accessibility beat. It
  // is computed from the rules, so it moves whenever a rule does — and it had already moved from 41
  // to 30 with nobody noticing.
  it('the score drop the write-ups quote is the drop the rules produce', () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    const at = (profile: 'general' | 'accessibility') => score(check(p.room, p.items, profile) as never)
    const [before, after] = [at('general'), at('accessibility')]
    for (const [file, text] of [['SUBMISSION.md', submission], ['DEMO.md', demoScript]] as const) {
      const said = text.match(/90 (?:to|→) (\d+)/)
      expect(said, `${file} no longer quotes the drop`).toBeTruthy()
      expect(before, 'dad-visits no longer scores 90').toBe(90)
      expect(Number(said![1]), `${file} says it falls to ${said![1]}, it falls to ${after}`).toBe(after)
    }
    // and the landing page, which quotes both numbers in prose rather than as a "90 → 41" pair, and
    // is the copy a judge reads before opening anything. It was the one surface not held to them.
    const copy = appSource.replace(/<[^>]*>/g, ' ')
    expect(copy, 'the landing page stopped saying what dad-visits scores').toMatch(new RegExp(`scores ${before}\\b`))
    expect(copy, `the landing page says the score drops somewhere other than ${after}`)
      .toMatch(new RegExp(`drops to ${after}\\b`))
    {
    }
  })

  // The tool list changing with the room is the central claim, so the README had better describe the
  // tools that actually do it. It listed eight, three of them with the wrong condition, and left out
  // two that are contextual.
  it('the README accounts for every tool that comes and goes', () => {
    const note = readme.slice(readme.indexOf('\\* contextual'), readme.indexOf('Every result opens with'))
    const described = new Set([...note.matchAll(/`([a-z_]+)`/g)].map(m => m[1]))
    const contextual = TOOLS.filter(t => t.when).map(t => t.name)
    expect(contextual.filter(n => !described.has(n)), 'contextual, and the README does not say so').toEqual([])
    expect([...described].filter(n => !contextual.includes(n)), 'the README calls these contextual, and they are always on').toEqual([])
  })

  // The accessibility section is the most spot-checkable page in the write-up — every number in it is
  // a constant somebody can grep for. The score drop in the same document had already gone stale.
  it('the accessibility numbers in the README are the ones the rules use', () => {
    const acc = readme.slice(readme.indexOf('## Accessibility is real geometry')).replace(/\*/g, '')
    const says = (re: RegExp) => Number(acc.match(re)?.[1])
    expect(says(/(\d+) cm turning circles/), 'turning circle').toBe(TURN)
    expect(says(/(\d+) cm corridors/), 'accessible corridor').toBe(minWalk('accessibility'))
    expect(says(/corridors \(vs (\d+)\)/), 'ordinary corridor').toBe(minWalk('general'))
    expect(says(/(\d+) cm transfer space/), 'bedside transfer').toBe(bedSide('accessibility'))
    expect(says(/transfer space beside a bed, not (\d+)/), 'ordinary bedside').toBe(bedSide('general'))
    expect(says(/(\d+) cm approach/), 'accessible approach').toBe(pullOut('accessibility'))
    expect(says(/instead of a (\d+) cm chair pull-out/), 'ordinary pull-out').toBe(pullOut('general'))
  })

  // "A blank room exposes 13 tools, a furnished one 22, and standing back at a whole home 15." Three
  // numbers a judge can count in the panel, and they move every time a tool gains or loses a `when`.
  it('the tool counts the README quotes are the counts the page registers', () => {
    const blank = PRESETS.find(p => p.id === 'blank')!
    const full = PRESETS.find(p => p.id === 'dad-visits')!
    const at = (p: typeof blank) => {
      set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
        profile: p.profile, hour: 9, brief: null, notes: [], history: [], proposals: [], flat: null, here: null, nudge: null })
      return activeTools().length
    }
    const said = [...readme.matchAll(/\*\*(\d+)\*\* tools?|a furnished one \*\*(\d+)\*\*|whole home \*\*(\d+)\*\*/g)]
      .map(m => Number(m[1] ?? m[2] ?? m[3]))
    expect(said.length, 'the README no longer quotes three tool counts').toBe(3)
    expect(at(blank), `README says a blank room shows ${said[0]}`).toBe(said[0])
    expect(at(full), `README says a furnished room shows ${said[1]}`).toBe(said[1])
    set({ flat: buildFlat(2, 4), here: null, items: [], presetId: 'flat' })
    expect(activeTools().length, `README says a whole home shows ${said[2]}`).toBe(said[2])
  })

  // The README quotes the page's verdict on a claim verbatim, and that sentence was rewritten today.
  // A judge can reproduce it in twenty seconds.
  it('the verdict the README quotes is the one the page produces', () => {
    for (const phrase of ['centre-to-centre distance', 'clear gap', 'space to the nearest wall', 'angle off centre'])
      expect(verifySource, `verify() no longer says "${phrase}"`).toContain(`'${phrase}'`)
    const quoted = readme.match(/checked: ([^`*]+)/)?.[1]?.trim()
    expect(quoted, 'the README stopped quoting a verdict').toBeTruthy()
    expect(quoted).toMatch(/^the centre-to-centre distance between .+ and .+ is \d+cm$/)
  })

  // and the write-ups have to be quoting that same sentence, not one it used to print
  // the submission quotes baseline's own warning verbatim, including the two scores
  // "Nine fixtures with real behaviour" and "a low winter sun throws light 5m across the floor, a high
  // summer noon barely a metre" — two numbers in the README a reader can check in the picker.
  it('the lighting and sunlight numbers in the README are the ones the page computes', () => {
    const fixtures = [...(lightSource.match(/FIXTURE[^=]*=\s*\{[\s\S]*?\n\}/)?.[0] ?? '')
      .matchAll(/^ {2}(\w+):/gm)].length
    const said = Number(readme.match(/\*\*(\w+)\*\* fixtures|(\w+) fixtures with real behaviour/)?.[2] === 'Nine' ? 9 : NaN)
      || { nine: 9, ten: 10, eight: 8 }[(readme.match(/(\w+) fixtures with real behaviour/)?.[1] ?? '').toLowerCase()]
    expect(said, 'the README no longer says how many fixtures').toBeTruthy()
    expect(fixtures, `the README says ${said} fixtures`).toBe(said)

    const room: Room = { w: 600, h: 500, doors: [], windows: [{ id: 'south window', wall: 'S', pos: 200, width: 150 }], outlets: [], north: 0, season: 'winter' }
    const winter = beamReach(9, room)
    const summer = beamReach(12, { ...room, season: 'summer' })
    expect(winter, `a low winter sun should reach metres: got ${winter}cm`).toBeGreaterThan(400)
    expect(summer, `a high summer noon should barely reach: got ${summer}cm`).toBeLessThan(200)
  })

  // The greedy arranger used to lose on two of the six scenes as they ship. It stopped, because it
  // was losing for reasons that were bugs — a lamp it stood in the doorway, a rug it could not place
  // anywhere. The warning is not dead: it fires the moment the layout it replaces is better than
  // greedy, which is what happens once an AGENT has improved the room and then calls baseline.
  it('the baseline warning the submission quotes is the one it prints', async () => {
    const p = PRESETS.find(x => x.id === 'dad-visits')!
    set({ presetId: p.id, room: JSON.parse(JSON.stringify(p.room)), items: p.items.map(i => ({ ...i })),
      profile: p.profile, hour: 9, brief: null, notes: [], history: [], proposals: [], layouts: {}, flat: null, here: null })
    await (TOOLS.find(t => t.name === 'dock_item')!.run({ id: 'rug', to: 'sofa' }) as any)
    const before = score(violations() as never)
    const out: any = TOOLS.find(t => t.name === 'baseline')!.run({})
    expect(out.baseline_score, 'greedy matched a hand-improved room, so there is no drop to warn about')
      .toBeLessThan(before)
    expect(out.note, 'it drops the score and does not say so').toMatch(/WORSE/)
    expect(out.note, 'it does not name the bar that still stands').toContain(`beating ${before}`)
    expect(submission, 'the submission quotes a drop the arranger does not produce')
      .toContain(`(${before} → ${out.baseline_score})`)
  })
})

// The mutation check (`npm run mutate`) proves the suite notices when the page changes — but it does
// that by finding exact lines, and a line that moves turns the whole check into a no-op nobody runs
// often enough to catch. So the anchors are pinned here, where they're read on every commit.
it('every mutation still has a line to mutate', async () => {
  const { MUTATIONS } = await import('../mutate.mjs')
  const SRC: Record<string, string> = { 'src/rules.ts': rulesSource, 'src/tools.ts': toolsSource, 'src/store.ts': storeSource, 'src/verify.ts': verifySource, 'src/space.ts': spaceSource, 'src/dock.ts': dockSource, 'src/Plan.tsx': planSource }
  expect(MUTATIONS.map(([f]) => f).filter(f => !SRC[f]), 'mutate.mjs touches a file this guard cannot read').toEqual([])
  const gone = MUTATIONS.filter(([file, find]) => !SRC[file]?.includes(find))
  expect(gone.map(([file, find]) => `${file}: ${find}`), 'mutate.mjs looks for lines that are no longer there').toEqual([])
  expect(MUTATIONS.length, 'the mutation check has been hollowed out').toBeGreaterThanOrEqual(16)
})

// A test count is the one number in these documents that cannot be kept true: it changes on almost
// every commit, nothing derives it (341 `it(` blocks produce 496 cases), and it read 465 for a day
// while the suite ran 496. It is also weak evidence — anyone can write five hundred tests that assert
// nothing, which is exactly what six of these were doing this morning. So the documents do not quote
// one, and this stops it creeping back in.
it('no write-up quotes a test count, because none of them can keep it true', () => {
  for (const [file, text] of [['README.md', readme], ['SUBMISSION.md', submission], ['DEMO.md', demoScript]] as const) {
    const claim = text.match(/(\d{2,4})\s+tests\b|tests\s*[:—-]\s*(\d{2,4})/i)
    expect(claim?.[0], `${file} quotes "${claim?.[0]}" — a number that goes stale the next time anyone adds a test`).toBeUndefined()
  }
})

// The submission quotes three of the mutations by name to show what "breaks the page on purpose"
// means. Rename one in mutate.mjs and the document is describing a check that no longer exists.
it('the mutations the submission names are mutations that exist', async () => {
  const { MUTATIONS } = await import('../mutate.mjs')
  const said = [...submission.matchAll(/a wheelchair turns in a smaller circle|the page stops refusing|silence gets reported as a refusal/g)].map(m => m[0])
  expect(said.length, 'the submission stopped naming any mutation, so this guard now checks nothing').toBe(3)
  for (const claim of said)
    expect(MUTATIONS.map(([, , , what]) => what), `the submission describes "${claim}", which mutate.mjs no longer does`).toContain(claim)
})

// "Three practical things" sat above four of them for as long as the section has existed. A document
// whose argument is rigour cannot miscount its own list, and the fix — renumbering by hand — is the
// one that rots again the moment a fifth is added.
it('a section that says how many things it lists, lists that many', () => {
  const WORD: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 }
  let checked = 0
  for (const [file, text] of [['SUBMISSION.md', submission], ['README.md', readme]] as const)
    for (const h of [...text.matchAll(/^#{2,4} (\w+) ([\w ]+)$/gm)].filter(m => WORD[m[1].toLowerCase()])) {
      const from = text.indexOf(h[0]) + h[0].length
      const next = text.slice(from).search(/^#{2,4} /m)
      const body = text.slice(from, next < 0 ? undefined : from + next)
      const items = [...body.matchAll(/^\*\*[^*]/gm)].length + [...body.matchAll(/^- \*\*/gm)].length
      expect(items, `${file}: "${h[0].trim()}" is followed by ${items}`).toBe(WORD[h[1].toLowerCase()]); checked++
    }
  // "Four things here that a tool server cannot do" sat above three numbered sections the moment one
  // of them was cut. The guard above only reads headings; this one counts a claim made in prose
  // against the ### 1. / ### 2. sections that answer it, which is where it actually went wrong.
  const lead = submission.match(/(\w+) things here that a tool server cannot do/)
  expect(lead?.[1], 'the submission stopped saying how many things it lists').toBeTruthy()
  expect([...submission.matchAll(/^### \d+\. /gm)].length,
    `the submission says ${lead![1]} things a tool server cannot do`).toBe(WORD[lead![1].toLowerCase()]); checked++

  // the README states its count in prose rather than a heading, and numbers the items
  const intro = readme.match(/^(\w+) things follow from that/m)
  expect(intro?.[1], 'the README stopped saying how many things follow').toBeTruthy()
  expect([...readme.matchAll(/^\*\*\d+\. /gm)].length, `the README says ${intro![1]} things follow`).toBe(WORD[intro![1].toLowerCase()]); checked++

  // and the video script, whose beats are timed headings rather than bold items
  const beats = [...demoScript.matchAll(/^### \d+:\d\d /gm)].length
  const said = demoScript.match(/^(\w+) beats/m)
  expect(said?.[1], 'the video script stopped saying how many beats it has').toBeTruthy()
  expect(WORD[said![1].toLowerCase()], `the script says ${said![1]} beats and lists ${beats}`).toBe(beats); checked++
  expect(checked, 'nothing counts its own contents any more, so this checks nothing').toBeGreaterThan(2)
})

// The meta description is what a judge reads in a link preview, before the page has registered a
// single tool — and it had said "22 WebMCP tools, 27 rules" since the day those numbers were true.
// The three write-ups were held to their counts; the one line that arrives first was not.
it('the page description a judge sees before the page loads is current', () => {
  const meta = shell.match(/<meta name="description" content="([^"]+)"/)?.[1]
  expect(meta, 'index.html has no description for a link preview').toBeTruthy()
  const rules = [...(rulesSource.match(/RULE_LABEL: Record<Rule, string> = \{[\s\S]*?\n\}/)?.[0] ?? '')
    .matchAll(/([a-z_]+):\s*'/g)].length
  expect(Number(meta!.match(/(\d+) WebMCP tools/)?.[1]), `the description says "${meta!.match(/[\d]+ WebMCP tools/)?.[0]}"`).toBe(TOOLS.length)
  expect(Number(meta!.match(/(\d+) rules/)?.[1]), `the description says "${meta!.match(/[\d]+ rules/)?.[0]}"`).toBe(rules)
  // and the two things a shared link needs to look like anything
  expect(shell, 'no title').toMatch(/<title>[^<]{10,}<\/title>/)
  expect(shell, 'no og:title for a shared link').toMatch(/property="og:title"/)
})

// The README does not just count the read-only tools, it names all ten. The count is guarded, which
// means swapping one for another — making `share` no longer read-only and `dock_item` read-only —
// keeps the number right and the sentence wrong. A judge can check this list against the panel in
// under a minute, and readOnlyHint is the annotation a client may skip its confirmation prompt on.
it('the read-only tools the README names are the read-only tools', () => {
  const said = (readme.match(/on all ten tools that only read \(([^)]+)\)/)?.[1] ?? '')
    .split(',').map(x => x.trim().replace(/`/g, '')).filter(Boolean)
  expect(said.length, 'the README stopped naming them').toBeGreaterThan(5)
  const real = TOOLS.filter(t => (t as { readOnly?: boolean }).readOnly).map(t => t.name)
  expect(said.filter(n => !real.includes(n)), 'the README calls these read-only and they are not').toEqual([])
  expect(real.filter(n => !said.includes(n)), 'these only read and the README does not say so').toEqual([])
})

// The README lists all 28 tools by name, in categories. That table is the thing a reader scans to
// decide whether the project is what it says it is, and it is exactly the kind of list that goes
// quietly out of date the next time a tool is added — the count above it is guarded, the membership
// was not. It is also where the "fifteen of the twenty-eight come and go" claim lives.
it('every tool is in the README table, and nothing in it is invented', () => {
  const table = readme.slice(readme.indexOf('## The 28 tools'), readme.indexOf('Every result opens with'))
  expect(table.length, 'the tool table is gone').toBeGreaterThan(400)
  const named = new Set([...table.matchAll(/`([a-z_]{3,30})`/g)].map(m => m[1]))
  const real = TOOLS.map(t => t.name)
  expect(real.filter(n => !named.has(n)), 'these tools exist and the table does not list them').toEqual([])
  // read_message_from_human is transient — it is in the table but never in TOOLS
  expect([...named].filter(n => !real.includes(n) && n !== 'read_message_from_human'),
    'the table lists tools the page does not have').toEqual([])

  const WORDS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17 }
  const said = table.match(/(\w+) of the twenty-eight come and go/)?.[1]
  expect(said, 'the README stopped saying how many tools are contextual').toBeTruthy()
  expect(TOOLS.filter(t => (t as { when?: unknown }).when).length,
    `the README says ${said} of them come and go`).toBe(WORDS[said!.toLowerCase()])
})

// The very first thing a judge does is open the link in something that has WebMCP. That instruction —
// which browser, which flag — is written in four places: the README, the submission, the video script,
// and the page itself, in the red line it shows when the API is missing. Nothing held them together,
// and the page's copy is the one a judge reads at the moment it matters, with no document to hand.
it('every surface names the same browser and the same flag', () => {
  // the page's own copy of it is one sentence now, shared by the landing banner and the panel — the
  // panel being the one a judge reads, because the submission's link goes straight into a scene
  const surfaces = [['README.md', readme], ['SUBMISSION.md', submission], ['DEMO.md', demoScript],
    ['the page', GET_WEBMCP]] as const
  for (const file of ['App.tsx', 'Panel.tsx'])
    expect((file === 'App.tsx' ? appSource : panelSource), `${file} spells the instruction out instead of using GET_WEBMCP`)
      .not.toMatch(/chrome:\/\/flags/)
  const flags = new Set<string>(), versions = new Set<string>()
  for (const [file, text] of surfaces) {
    const flag = text.match(/chrome:\/\/flags\/#([\w-]+)/)?.[1]
    const version = text.match(/Chrome (\d{3})\+/)?.[1]
    expect(flag, `${file} no longer says which flag to turn on`).toBeTruthy()
    expect(version, `${file} no longer says which Chrome version`).toBeTruthy()
    flags.add(flag!); versions.add(version!)
  }
  expect([...flags], 'the four surfaces name different flags').toHaveLength(1)
  expect([...versions], 'the four surfaces name different Chrome versions').toHaveLength(1)

  // and the client instruction, which is the fiddly one — the wrong model has WebMCP off
  for (const [file, text] of [['SUBMISSION.md', submission], ['DEMO.md', demoScript]] as const) {
    expect(text, `${file} stopped naming the models that have WebMCP`).toMatch(/Sol or Terra/)
    expect(text, `${file} stopped warning about the one that does not`).toMatch(/Luna/)
    expect(text, `${file} stopped naming the setting to turn on`).toMatch(/site tools/i)
  }
})

// PROFILES and SEASONS are closed sets that the page spells out in several registers at once: a
// TypeScript union, a JSON Schema enum an agent reads, a picker a human clicks, and the filters that
// clean a share link and a save. Each was written out by hand in three to five places. They agreed —
// they would, having been written the same afternoon — but adding a sixth goal or a fourth season
// means finding all of them, and the schema is the copy that matters most: an agent believes it.
it('the closed sets are declared once, not spelled out again in each register', () => {
  const sun = TOOLS.find(t => t.name === 'sun')!
  const schema = (sun.inputSchema as { properties: Record<string, { enum?: string[] }> }).properties
  expect(schema.season?.enum, 'the sun tool advertises a different set of seasons').toEqual(SEASONS)

  const profile = TOOLS.find(t => t.name === 'set_profile')!
  const goals = ((profile.inputSchema as { properties: Record<string, { enum?: string[] }> }).properties.profile?.enum ?? []).slice().sort()
  expect(goals, 'set_profile advertises different goals than the page has').toEqual([...PROFILES].sort())

  // and every goal really is judged by something, rather than being a name on a button
  for (const p of PROFILES) expect(PROFILE_RULES[p]?.length, `${p} has no rules behind it`).toBeGreaterThan(3)

  // nobody has written the words out again where a list would do
  for (const [file, src] of [['tools.ts', toolsSource], ['Panel.tsx', panelSource], ['App.tsx', appSource]] as const) {
    expect(src, `${file} spells the seasons out instead of using SEASONS`).not.toMatch(/'summer', *'spring', *'winter'/)
    expect(src, `${file} spells the goals out instead of using PROFILES`).not.toMatch(/'general', *'theater', *'office'/)
  }
})

// The first twenty seconds of the video, quoted exactly: the call, the refusal, the transcript line
// and the second reason. It is also the beat where the script most easily drifts, because the same
// call answers differently once the goal changes — and it did drift: the paragraph described the
// accessibility answer while the beat happens in general, promising a 150cm door and a `least_bad`
// that only appear after the NEXT beat.
it('the opening beat of the video is what that call actually does', async () => {
  const script = demoScript.slice(demoScript.indexOf('### 0:00'), demoScript.indexOf('### 0:20'))
  expect(script, 'the script no longer quotes the call').toContain("move_items({id: 'sofa', x: 0, y: 30, rot: 90})")

  // this file runs in node, and loadPreset writes the scene into the address bar
  for (const [k, v] of [['location', { origin: 'https://x', pathname: '/', search: '', href: 'https://x/', hash: '' }],
    ['history', { replaceState() {}, pushState() {} }]] as const)
    if (typeof (globalThis as Record<string, unknown>)[k] === 'undefined')
      Object.defineProperty(globalThis, k, { value: v, configurable: true })
  loadPreset('dad-visits')
  const out = JSON.parse((await wrap(TOOLS.find(t => t.name === 'move_items')!)
    .execute({ id: 'sofa', x: 0, y: 30, rot: 90 })).content[0].text)

  expect(out.refused, 'the page no longer refuses the call the video opens on').toBe(true)
  expect(out.moved, 'it moved something').toBe(0)
  expect(script, 'the script quotes a transcript line the page does not write')
    .toContain('refused to move sofa — Sofa overlaps Armchair (chair_b)')
  expect(out.because?.[0], 'the first reason changed').toBe('Sofa overlaps Armchair (chair_b)')

  // the door line, with the number this goal actually asks for
  const door = out.because?.find((b: string) => /blocks the door/.test(b))
  expect(door, 'the door reason is gone from the refusal').toBeTruthy()
  expect(script, `the script quotes a door line the page does not write: ${door}`).toContain(door!)

  // and in the general goal a legal spot still exists, so it is `instead`, not `least_bad`
  expect(out.instead, 'the script promises coordinates that work and there are none').toBeTruthy()
  expect(out.least_bad, 'this scene now has no legal spot under the general goal').toBeUndefined()
  expect(script, 'the script still promises least_bad in the opening beat').not.toMatch(/`least_bad`[^\n]*closest it can get/)
})

// The rest of the beats, checked the way the first one is. Beat 4 is the one that can drift without
// anybody touching it: the script quotes the page's verdict verbatim, and the 115cm in it is measured
// from where the armchair and the sofa happen to stand in dad-visits. Nudge either piece in the
// preset and the video script is quoting a number the page no longer says.
it('the beats that quote the page verbatim still match it', async () => {
  for (const [k, v] of [['location', { origin: 'https://x', pathname: '/', search: '', href: 'https://x/', hash: '' }],
    ['history', { replaceState() {}, pushState() {} }]] as const)
    if (typeof (globalThis as Record<string, unknown>)[k] === 'undefined')
      Object.defineProperty(globalThis, k, { value: v, configurable: true })
  const call = async (n: string, a: unknown = {}) =>
    JSON.parse((await wrap(TOOLS.find(x => x.name === n)!).execute(a)).content[0].text)

  loadPreset('dad-visits')
  const before = activeTools().length
  await call('set_profile', { profile: 'accessibility' })
  expect(activeTools().length, 'the script says the tool count ticks UP').toBeGreaterThan(before)
  expect(activeTools(), 'the script says access_check appears').toContain('access_check')

  // this block used to hold its own copy of the say step, so it validated DEMO.md against the copy
  // while the real script drifted away from it — the copy was right about a room nobody was looking at
  const step = PRESETS.find(p => p.id === 'dad-visits')!.demo!.find(([n, a]: any) => n === 'say' && a.claim)!
  expect(demoScript, 'DEMO.md no longer quotes the sentence the script says').toContain((step[1] as any).text)
  const verdict = (await call('say', step[1])).claim_checked
  expect(verdict?.ok, 'the script shows the page disagreeing, and it agrees').toBe(false)
  expect(demoScript, `the script quotes a verdict the page does not give: "${verdict?.text}"`).toContain(verdict!.text)

  // and the eye height the script passes is the one it gets
  const eye = await call('show', { eye: 'chair_b', eye_height: 115 })
  expect(eye.eye?.sitting_in, 'the camera did not sit in the chair the script names').toBe('chair_b')
  expect(eye.eye?.height_cm, 'the wheelchair eye height was ignored').toBe(115)
})


// The longest beat of the video is a table of three walks and what each one grows. It is the beat the
// whole WebMCP argument rests on, and every row is checkable: the room, the tool it grows, and the
// number that tool then reports. The bedside row quoted 75cm this morning, which was the tool's own
// figure rather than the rule's — the two disagreed, and the script was quoting the wrong one.
it('every row of the whole-home beat is a walk the page really makes', async () => {
  for (const [k, v] of [['location', { origin: 'https://x', pathname: '/', search: '', href: 'https://x/', hash: '' }],
    ['history', { replaceState() {}, pushState() {} }]] as const)
    if (typeof (globalThis as Record<string, unknown>)[k] === 'undefined')
      Object.defineProperty(globalThis, k, { value: v, configurable: true })
  const call = async (n: string, a: unknown = {}) => {
    const tick = setInterval(() => { const q = state.notes.find(x => x.options?.includes('✓ allow') && !x.answered); if (q) answerNote(q.id, '✓ allow') }, 5)
    try { return JSON.parse((await wrap(TOOLS.find(x => x.name === n)!).execute(a)).content[0].text) } finally { clearInterval(tick) }
  }
  const table = demoScript.slice(demoScript.indexOf('| Walk into'), demoScript.indexOf('Nobody described'))
  expect(table, 'the whole-home table is gone').toContain('access_check')

  loadPreset('blank')
  await call('define_flat', { bedrooms: 2, people: 4 })

  // the bathroom sets itself to accessibility and grows the audit, unasked
  const bath = await call('enter_room', { id: 'bath' })
  expect(bath.judged_as, 'a bathroom no longer judges itself on accessibility').toBe('accessibility')
  expect(activeTools(), 'the bathroom no longer grows access_check').toContain('access_check')

  // a bedroom grows the bedside check only once there is a bed in it
  await call('enter_room', { id: 'bed1' })
  expect(activeTools(), 'an empty bedroom already has a bedside check').not.toContain('bedside_check')
  await call('add_item', { type: 'bed_double' })
  expect(activeTools(), 'a bed did not grow the bedside check').toContain('bedside_check')
  const side = (await call('bedside_check')).beds?.[0]?.needs_cm ?? bedSide(state.profile)
  // the bedside ROW, not the table: the row below it says "360–660cm", so toContain('60cm') against
  // the whole table matches inside 660 and passes whatever the bedside number says. Fifth time today
  // a substring check has agreed with the thing it was meant to catch.
  const bedRow = table.split('\n').find(l => l.includes('bedside_check')) ?? ''
  expect(bedRow, 'the bedside row is gone from the table').toContain('bedside_check')
  expect(bedRow, `the script quotes a bedside number the page does not use: ${side}cm`)
    .toMatch(new RegExp(`(^|[^\\d])${side}cm`))

  // and the kitchen grows the work triangle once it has a hob
  await call('enter_room', { id: 'kitchen' })
  expect(activeTools(), 'an empty kitchen already has a work triangle').not.toContain('work_triangle')
  await call('add_item', { type: 'hob' })
  expect(activeTools(), 'a hob did not grow the work triangle').toContain('work_triangle')
  for (const piece of ['sink', 'hob', 'fridge'])
    expect(table, `the script stops naming ${piece} in the triangle`).toContain(piece)
})

// Numbers written into prose an agent reads. There are only three in the whole tool surface, and one
// of the three sits in the same object as the value it describes — DOCK's coffee table says gap: 45
// and, a few characters later, "45cm in front of the sofa". A stale explanation is exactly how
// bedside_check came to quote a threshold it had stopped using: the sentence is not compiled, so it
// keeps its old number silently while the code moves on.
it('the numbers in prose an agent reads are the numbers behind them', () => {
  const saves = TOOLS.find(t => t.name === 'saves')!
  expect(saves.description, `saves quotes a number that is not the ${MAX_SAVES} it keeps`)
    .toMatch(new RegExp(`(^|[^\\d])${MAX_SAVES}(?!\\d)`))

  const dock = TOOLS.find(t => t.name === 'dock_item')!
  const gap = DOCK.coffee_table!.gap
  expect(dock.description, `dock_item quotes a gap that is not the ${gap}cm it uses`)
    .toMatch(new RegExp(`(^|[^\\d])${gap}cm`))

  // and every note in the dock table that quotes a distance quotes its own
  for (const [type, d] of Object.entries(DOCK)) {
    const said = d!.note.match(/(?<![\d.])(\d+)cm/)?.[1]
    if (said) expect(Number(said), `${type} docks at ${d!.gap}cm and its note says ${said}cm`).toBe(d!.gap)
  }
})

// The landing page is the first thing a judge reads, and it is prose in JSX — nothing spell-checks it
// and nothing type-checks it. "a `access_check` tool appears" sat in the sixty-second walkthrough,
// which is the paragraph most likely to be read aloud.
it('the landing copy puts the right article in front of a vowel', () => {
  const words = appSource.replace(/<[^>]*>/g, ' ')
  const wrong = [...words.matchAll(/\ba (access_check|agent|arrange|item|empty|open|extra|option|origin|hour|undo)\b/g)].map(m => m[0])
  expect(wrong, 'the landing page says "a" where it needs "an"').toEqual([])
  const alsoWrong = [...words.matchAll(/\ban ([bcdfgjklmnpqrstvwxyz][a-z]{2,})/g)].map(m => m[0])
    .filter(x => !/^an (hour|honest|honou)/.test(x))
  expect(alsoWrong, 'the landing page says "an" where it needs "a"').toEqual([])
})

// Two things on the landing page come out of the browser's own storage and land in the opening frame:
// the resume card and, inside a scene, the room's remembered refusals. Both are features. Neither is
// what you want in the first shot of a video, dated yesterday and out of context — and I have seen
// both on the live page while checking something else.
it('the pre-record checklist says to start from a clean browser', () => {
  const list = demoScript.slice(demoScript.indexOf('## Checks before you hit record'))
  expect(list.length, 'the pre-record checklist is gone').toBeGreaterThan(200)
  expect(list, 'the checklist does not say to clear the browser first').toMatch(/clear this site's data|fresh profile/i)
  for (const feature of ['Pick up where you left off', 'remembers'])
    expect(list, `the checklist warns about clearing without saying what shows up: ${feature}`).toContain(feature)
})

// The third row of the whole-home table is about a tool APPEARING. Call it at that moment and it
// answers "no sink, fridge in this room yet" — correct, and worth reading out, but not the triangle.
// A presenter who expects a verdict there gets an error on camera.
it('the script says what work_triangle answers the moment it appears', async () => {
  for (const [k, v] of [['location', { origin: 'https://x', pathname: '/', search: '', href: 'https://x/', hash: '' }],
    ['history', { replaceState() {}, pushState() {} }]] as const)
    if (typeof (globalThis as Record<string, unknown>)[k] === 'undefined')
      Object.defineProperty(globalThis, k, { value: v, configurable: true })
  const call = async (n: string, a: unknown = {}) => {
    const tick = setInterval(() => { const q = state.notes.find(x => x.options?.includes('✓ allow') && !x.answered); if (q) answerNote(q.id, '✓ allow') }, 5)
    try { return JSON.parse((await wrap(TOOLS.find(x => x.name === n)!).execute(a)).content[0].text) } finally { clearInterval(tick) }
  }
  loadPreset('blank')
  await call('define_flat', { bedrooms: 2, people: 4 })
  await call('enter_room', { id: 'kitchen' })
  await call('add_item', { type: 'hob' })
  expect(activeTools(), 'a hob no longer grows the work triangle').toContain('work_triangle')
  const said = (await call('work_triangle')).error
  expect(said, 'the triangle now judges a kitchen with only a hob in it').toBeTruthy()
  // the script is markdown and wraps, so a quoted phrase can straddle a newline — compare with the
  // whitespace flattened, or this fails on where the line happened to break
  expect(demoScript.replace(/\s+/g, ' '), `the script does not warn that it answers "${said}"`)
    .toContain(said!.replace(/\s+/g, ' '))
})


// "under 3:00" is a hard rule of the challenge, not a target, and the script's beats are timed to the
// second. That arithmetic is in a markdown table nobody adds up: shift one beat and either the video
// runs long — which is a disqualification, not a note — or two beats overlap and the running order
// stops making sense. It totals 175s today.
it('the video script adds up, and adds up to less than three minutes', () => {
  const beats = [...demoScript.matchAll(/^### (\d+):(\d\d) — (.+?) \((\d+)s\)/gm)]
    .map(m => ({ at: +m[1] * 60 + +m[2], name: m[3], secs: +m[4] }))
  expect(beats.length, 'the script no longer has timed beats').toBeGreaterThan(4)

  let clock = 0
  for (const b of beats) {
    expect(b.at, `"${b.name}" is marked ${b.at}s and the beats before it end at ${clock}s`).toBe(clock)
    clock += b.secs
  }
  expect(clock, `the beats total ${clock}s and the limit is 180`).toBeLessThanOrEqual(180)
  expect(clock, `only ${180 - clock}s of the three minutes is used — the script has lost a beat`).toBeGreaterThan(120)

  // and the longest scripted session has to fit the beat that plays it: sixteen calls at 2.2s each,
  // narrated over rather than after, or the whole home overruns the beat after it
  const flat = demo.match(/function flatDemo[\s\S]*?\n\}/)?.[0] ?? ''
  const steps = [...flat.matchAll(/^\s*\['[a-z_]+'/gm)].length
  expect(steps, 'the flat session is gone').toBeGreaterThan(8)
  const home = beats.find(b => /whole home/.test(b.name))!
  expect(steps * 2.2, `the flat session runs ${(steps * 2.2).toFixed(1)}s inside a ${home.secs}s beat`)
    .toBeLessThanOrEqual(home.secs)
})

// The write-ups quoted the header as saying "agent is working · find_space". The page has never
// rendered that sentence — it shows a pulsing dot and the tool's name. Quoting words the page does
// not say is the one thing a judge can check while you are saying them.
it('nothing quotes a header the page does not render', () => {
  for (const [file, text] of [['README.md', readme], ['SUBMISSION.md', submission], ['DEMO.md', demoScript]] as const) {
    expect(text.replace(/\s+/g, ' '), `${file} quotes a header sentence the page never shows`)
      .not.toMatch(/agent is working/)
    // and it still tells the presenter what IS there
    if (/embedded room's (own )?header/.test(text))
      expect(text.replace(/\s+/g, ' '), `${file} points at the header without saying what appears`).toMatch(/find_space/)
  }
  // which is the tool name, rendered on its own
  expect(appSource, 'the header stopped showing the tool that was just used').toMatch(/\{last\.name\}/)
})
