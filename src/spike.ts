// Day-1 spike: which API exists, does late registration work, is the return shape accepted.
const log = (s: string) => (document.getElementById('log')!.textContent += s + '\n')
const mc: any = (navigator as any).modelContext ?? (document as any).modelContext
log(`navigator.modelContext: ${!!(navigator as any).modelContext}`)
log(`document.modelContext: ${!!(document as any).modelContext}`)
if (mc) log(`methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(mc)).join(', ')}`)

let counter = 0
const tool = (name: string) => ({
  name,
  description: `Spike tool ${name}. Returns a counter and the time.`,
  inputSchema: { type: 'object', properties: { note: { type: 'string' } } },
  async execute(args: any) {
    counter++
    log(`${name} called ${JSON.stringify(args)}`)
    return { content: [{ type: 'text', text: JSON.stringify({ name, counter, time: new Date().toISOString(), args }) }] }
  },
})
if (mc?.registerTool) { mc.registerTool(tool('spike_ping')); log('registered spike_ping via registerTool') }
else if (mc?.provideContext) { mc.provideContext({ tools: [tool('spike_ping')] }); log('registered via provideContext') }
else log('NO WebMCP API FOUND')

document.getElementById('late')!.onclick = () => {
  if (mc?.registerTool) { mc.registerTool(tool('spike_late')); log('registered spike_late — ask the agent to call it') }
  else if (mc?.provideContext) { mc.provideContext({ tools: [tool('spike_ping'), tool('spike_late')] }); log('re-provided with spike_late') }
}
