export const runtime = 'edge'

type AvailStatus = 'available' | 'taken' | 'unknown'

// TLDs with reliable, official RDAP endpoints
const RDAP_BASE: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/domain/',
  net: 'https://rdap.verisign.com/net/v1/domain/',
  org: 'https://rdap.publicinterestregistry.org/rdap/domain/',
  app: 'https://www.registry.google/rdap/domain/',
  dev: 'https://www.registry.google/rdap/domain/',
}

// For ccTLDs without reliable RDAP we use DNS-over-HTTPS.
// NXDOMAIN (Status 3) from the TLD nameserver = not in registry = available.
// Any other response = registered = taken.
async function checkViaDNS(domain: string): Promise<AvailStatus> {
  const url = `https://cloudflare-dns.com/dns-query?name=${domain}&type=NS`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/dns-json' },
    })
    if (!res.ok) {
      console.log(`[dns] ${domain} → HTTP ${res.status}`)
      return 'unknown'
    }
    const data: { Status: number; Answer?: unknown[] } = await res.json()
    console.log(`[dns] ${domain} → Status ${data.Status}, answers: ${data.Answer?.length ?? 0}`)
    if (data.Status === 3) return 'available' // NXDOMAIN
    return 'taken'
  } catch (err) {
    console.log(`[dns] ${domain} → ERROR ${String(err)}`)
    return 'unknown'
  }
}

async function checkViaRDAP(domain: string, url: string): Promise<AvailStatus> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/rdap+json' },
      redirect: 'follow',
    })
    console.log(`[rdap] ${domain} → HTTP ${res.status}`)
    if (res.status === 404) return 'available'
    if (res.ok) return 'taken'
    return 'unknown'
  } catch (err) {
    console.log(`[rdap] ${domain} → ERROR ${String(err)}`)
    return 'unknown'
  }
}

async function checkDomain(sld: string, tld: string): Promise<AvailStatus> {
  const domain = `${sld}.${tld}`
  const rdapBase = RDAP_BASE[tld]

  if (rdapBase) {
    return checkViaRDAP(domain, `${rdapBase}${domain}`)
  }

  // Fallback: DNS for ccTLDs and any other TLD without known RDAP
  return checkViaDNS(domain)
}

export async function POST(req: Request) {
  const { names, tlds }: { names: string[]; tlds: string[] } = await req.json()
  console.log(`[check] START — ${names.length} names × ${tlds.length} tlds = ${names.length * tlds.length} tasks`)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const tasks = names.flatMap((name) => tlds.map((tld) => ({ name, tld })))

      const CONCURRENCY = 10
      let idx = 0
      const next = () => (idx < tasks.length ? tasks[idx++] : null)

      const worker = async () => {
        let task
        while ((task = next())) {
          const status = await checkDomain(task.name, task.tld)
          emit({ name: task.name, tld: task.tld, status })
        }
      }

      try {
        await Promise.all(Array.from({ length: CONCURRENCY }, worker))
      } catch (err) {
        console.log(`[check] pool error: ${String(err)}`)
      }

      console.log(`[check] DONE`)
      emit({ done: true })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
