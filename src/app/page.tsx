'use client'

import { useState } from 'react'
import { generateNames, ALL_VOWELS, ALL_CONSONANTS, DEFAULT_CONSONANTS } from '@/lib/generate'

const ALL_TLDS = ['.com', '.net', '.org', '.io', '.co', '.app', '.dev', '.ai']
const COUNTS = [10, 20, 50, 100, 200]
const MIN_LENGTHS = [3, 4, 5, 6]
const MAX_LENGTHS = [4, 5, 6, 7, 8]

type AvailStatus = 'available' | 'taken' | 'unknown' | 'checking'

interface DomainResult {
  name: string
  tlds: Record<string, AvailStatus>
}

export default function Home() {
  // Main settings
  const [selectedTlds, setSelectedTlds] = useState<string[]>(['.com'])
  const [minLen, setMinLen] = useState(4)
  const [maxLen, setMaxLen] = useState(7)
  const [count, setCount] = useState(20)

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [activeVowels, setActiveVowels] = useState<string[]>(ALL_VOWELS.filter((l) => l !== 'y'))
  const [activeConsonants, setActiveConsonants] = useState<string[]>([...DEFAULT_CONSONANTS])

  // Search state
  const [phase, setPhase] = useState<'idle' | 'checking' | 'done'>('idle')
  const [results, setResults] = useState<DomainResult[]>([])
  const [checked, setChecked] = useState(0)
  const [total, setTotal] = useState(0)

  const toggleTld = (tld: string) =>
    setSelectedTlds((prev) =>
      prev.includes(tld) ? prev.filter((t) => t !== tld) : [...prev, tld]
    )

  const toggleLetter = (letter: string, type: 'vowel' | 'consonant') => {
    if (type === 'vowel') {
      setActiveVowels((prev) =>
        prev.includes(letter) ? prev.filter((l) => l !== letter) : [...prev, letter]
      )
    } else {
      setActiveConsonants((prev) =>
        prev.includes(letter) ? prev.filter((l) => l !== letter) : [...prev, letter]
      )
    }
  }

  const generate = async () => {
    if (selectedTlds.length === 0 || phase === 'checking') return
    if (activeVowels.length === 0 || activeConsonants.length === 0) return

    const effectiveMin = Math.min(minLen, maxLen)
    const effectiveMax = Math.max(minLen, maxLen)
    const names = generateNames(count, effectiveMin, effectiveMax, activeVowels, activeConsonants)
    const tldKeys = selectedTlds.map((t) => t.slice(1))

    const totalChecks = names.length * selectedTlds.length
    setPhase('checking')
    setChecked(0)
    setTotal(totalChecks)
    setResults(
      names.map((name) => ({
        name,
        tlds: Object.fromEntries(selectedTlds.map((tld) => [tld, 'checking' as AvailStatus])),
      }))
    )

    console.log('[client] Generated names:', names)
    console.log('[client] Checking TLDs:', tldKeys)

    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names, tlds: tldKeys }),
      })

      console.log('[client] API response status:', res.status)

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventCount = 0

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            console.log('[client] Stream ended, total events received:', eventCount)
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            let data: Record<string, unknown>
            try {
              data = JSON.parse(line.slice(6))
            } catch (e) {
              console.warn('[client] JSON parse error on line:', line, e)
              continue
            }

            eventCount++
            console.log('[client] event #' + eventCount, data)

            if (data.done) continue

            const tldKey = `.${data.tld as string}`
            setChecked((c) => c + 1)
            setResults((prev) =>
              prev.map((r) =>
                r.name === data.name
                  ? { ...r, tlds: { ...r.tlds, [tldKey]: data.status as AvailStatus } }
                  : r
              )
            )
          }
        }
      } finally {
        setResults((prev) =>
          prev.map((r) => ({
            ...r,
            tlds: Object.fromEntries(
              Object.entries(r.tlds).map(([tld, s]) => [tld, s === 'checking' ? 'unknown' : s])
            ),
          }))
        )
        setPhase('done')
        console.log('[client] Done')
      }
    } catch (e) {
      console.error('[client] Fetch error:', e)
      setPhase('done')
    }
  }

  const availableCount = results.filter((r) =>
    Object.values(r.tlds).some((s) => s === 'available')
  ).length

  const progress = total > 0 ? Math.round((checked / total) * 100) : 0

  // Available domains float to the top as checks come in
  const displayResults = [...results].sort((a, b) => {
    const aAvail = Object.values(a.tlds).some((s) => s === 'available') ? 0 : 1
    const bAvail = Object.values(b.tlds).some((s) => s === 'available') ? 0 : 1
    return aAvail - bAvail
  })

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">

        {/* Header */}
        <header className="mb-12">
          <div className="flex items-baseline gap-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">FindDomain</h1>
            <span className="text-zinc-600 text-sm font-mono">v1</span>
          </div>
          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed max-w-xl">
            Generates readable, pronounceable domain names using phonetic patterns (CVCV, CVCVC…)
            and checks availability in real time via RDAP.
          </p>
        </header>

        {/* Settings panel */}
        <section className="mb-10 rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="p-5 sm:p-6 space-y-6">

            {/* TLD selector */}
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Extensions</p>
              <div className="flex flex-wrap gap-2">
                {ALL_TLDS.map((tld) => {
                  const active = selectedTlds.includes(tld)
                  return (
                    <button
                      key={tld}
                      onClick={() => toggleTld(tld)}
                      className={`px-3.5 py-1.5 rounded text-sm font-mono border transition-all ${
                        active
                          ? 'border-white bg-white text-black font-semibold'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {tld}
                    </button>
                  )
                })}
              </div>
              {selectedTlds.length === 0 && (
                <p className="text-xs text-red-400 mt-2">Select at least one extension.</p>
              )}
            </div>

            {/* Length + count row */}
            <div className="flex flex-wrap gap-6 items-end">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Name length</p>
                <div className="flex items-center gap-2">
                  <select
                    value={minLen}
                    onChange={(e) => setMinLen(Number(e.target.value))}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
                  >
                    {MIN_LENGTHS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span className="text-zinc-500 text-sm">to</span>
                  <select
                    value={maxLen}
                    onChange={(e) => setMaxLen(Number(e.target.value))}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
                  >
                    {MAX_LENGTHS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span className="text-zinc-500 text-sm">chars</span>
                </div>
              </div>

              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Count</p>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
                >
                  {COUNTS.map((n) => <option key={n} value={n}>{n} names</option>)}
                </select>
              </div>

              <button
                onClick={generate}
                disabled={selectedTlds.length === 0 || phase === 'checking'}
                className="px-7 py-2 bg-white text-black text-sm font-semibold rounded hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {phase === 'checking' ? 'Checking…' : 'Generate'}
              </button>
            </div>
          </div>

          {/* Advanced settings toggle */}
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-5 sm:px-6 py-3 border-t border-zinc-800 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          >
            <span className="uppercase tracking-widest">Advanced settings</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
            >
              <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Advanced settings panel */}
          {showAdvanced && (
            <div className="px-5 sm:px-6 py-5 border-t border-zinc-800 space-y-6">

              {/* Vowels — all 5 */}
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-widest">
                    Vowels
                    <span className="normal-case text-zinc-600 ml-2">{activeVowels.length} / {ALL_VOWELS.length}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_VOWELS.map((letter) => {
                    const active = activeVowels.includes(letter)
                    return (
                      <button
                        key={letter}
                        onClick={() => toggleLetter(letter, 'vowel')}
                        className={`w-10 h-10 rounded font-mono text-sm border transition-all ${
                          active
                            ? 'border-zinc-300 bg-zinc-700 text-zinc-100'
                            : 'border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        {letter}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Consonants — all 21 */}
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-widest">
                    Consonants
                    <span className="normal-case text-zinc-600 ml-2">{activeConsonants.length} / {ALL_CONSONANTS.length}</span>
                  </p>
                  <button
                    onClick={() => setActiveConsonants([...DEFAULT_CONSONANTS])}
                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    reset to defaults
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_CONSONANTS.map((letter) => {
                    const active = activeConsonants.includes(letter)
                    return (
                      <button
                        key={letter}
                        onClick={() => toggleLetter(letter, 'consonant')}
                        className={`w-10 h-10 rounded font-mono text-sm border transition-all ${
                          active
                            ? 'border-zinc-300 bg-zinc-700 text-zinc-100'
                            : 'border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        {letter}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Progress bar */}
        {phase === 'checking' && (
          <div className="mb-8">
            <div className="flex justify-between text-xs text-zinc-500 mb-2">
              <span>Checking availability via RDAP…</span>
              <span>{checked} / {total}</span>
            </div>
            <div className="h-px bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-zinc-300 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-zinc-400">
                {phase === 'done'
                  ? <>
                      <span className="text-white font-semibold">{availableCount}</span>
                      {' '}available &nbsp;·&nbsp; {results.length} names checked
                    </>
                  : `Scanning ${results.length} names…`
                }
              </p>
              {phase === 'done' && (
                <button
                  onClick={generate}
                  className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 px-3 py-1 rounded transition-colors"
                >
                  Regenerate
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayResults.map((result) => (
                <DomainCard key={result.name} result={result} />
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {phase === 'idle' && results.length === 0 && (
          <div className="text-center py-20 text-zinc-700">
            <p className="text-4xl mb-4 tracking-widest font-mono">LUMA · NOREL · SOVIN</p>
            <p className="text-sm">Configure and click Generate to find available domains.</p>
          </div>
        )}

      </div>
    </main>
  )
}

/* ─── Domain card ─── */

function DomainCard({ result }: { result: DomainResult }) {
  const statuses = Object.values(result.tlds)
  const hasAvailable = statuses.some((s) => s === 'available')
  const allChecking = statuses.every((s) => s === 'checking')
  const someChecking = statuses.some((s) => s === 'checking')

  return (
    <div
      className={`p-4 rounded-lg border transition-all duration-300 ${
        allChecking
          ? 'border-zinc-800 bg-zinc-900/40'
          : hasAvailable
          ? 'border-zinc-500 bg-zinc-900 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]'
          : 'border-zinc-800 bg-zinc-950'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <p
          className={`font-mono text-base font-bold tracking-widest uppercase transition-colors ${
            allChecking ? 'text-zinc-600' : 'text-zinc-100'
          }`}
        >
          {result.name}
        </p>
        {allChecking && (
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </span>
        )}
        {!allChecking && someChecking && (
          <span className="text-[10px] text-zinc-600 font-mono animate-pulse">scanning…</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(result.tlds).map(([tld, status]) => (
          <TldBadge key={tld} tld={tld} status={status} name={result.name} />
        ))}
      </div>
    </div>
  )
}

/* ─── TLD badge ─── */

function TldBadge({ tld, status, name }: { tld: string; status: AvailStatus; name: string }) {
  const registrarUrl = `https://www.namecheap.com/domains/registration/results/?domain=${name}${tld}`

  if (status === 'checking') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-mono border border-zinc-800 text-zinc-700 bg-zinc-900 animate-pulse select-none">
        {tld}
      </span>
    )
  }

  if (status === 'available') {
    return (
      <a
        href={registrarUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Register on Namecheap"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border border-white bg-white text-black font-semibold hover:bg-zinc-200 active:bg-zinc-300 transition-colors cursor-pointer"
      >
        {tld}
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
          <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </a>
    )
  }

  if (status === 'taken') {
    return (
      <a
        href={registrarUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="View on Namecheap"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-500 transition-colors cursor-pointer group"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden className="shrink-0">
          <path d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <span className="line-through decoration-zinc-700">{tld}</span>
        <svg width="7" height="7" viewBox="0 0 7 7" fill="none" aria-hidden className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <path d="M1 3.5H6M4 1.5L6 3.5L4 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </a>
    )
  }

  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-mono border border-zinc-800 text-zinc-700 select-none">
      {tld}
      <span className="ml-1 text-[10px] text-zinc-700">?</span>
    </span>
  )
}
