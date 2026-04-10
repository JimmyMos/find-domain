const patterns: Record<number, string[]> = {
  3: ['CVC', 'VCV'],
  4: ['CVCV', 'VCVC'],
  5: ['CVCVC', 'VCVCV', 'CVCCV', 'CVVCV'],
  6: ['CVCVCV', 'VCVCVC', 'CVCCVC', 'CVCVVC'],
  7: ['CVCVCVC', 'CVCCVCV', 'VCVCVCV', 'CVCVCCV'],
  8: ['CVCVCVCV', 'CVCCVCVC', 'VCVCVCVC', 'CVCVCVVC'],
}

// y is treated as a vowel
export const ALL_VOWELS = ['a', 'e', 'i', 'o', 'u', 'y']

// All consonants in alphabetical order (y excluded — it's a vowel)
export const ALL_CONSONANTS = [
  'b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm',
  'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'z',
]

// Default subset: fluid consonants that produce readable, brandable names
export const DEFAULT_CONSONANTS = ['b', 'c', 'd', 'f', 'g', 'l', 'm', 'n', 'p', 'r', 's', 't']

function fromPattern(pattern: string, vowels: string[], consonants: string[]): string {
  return pattern
    .split('')
    .map((c) =>
      c === 'V'
        ? vowels[Math.floor(Math.random() * vowels.length)]
        : consonants[Math.floor(Math.random() * consonants.length)]
    )
    .join('')
}

function isReadable(name: string, vowels: string[]): boolean {
  let streak = 0
  for (const c of name) {
    if (!vowels.includes(c)) {
      streak++
      if (streak >= 3) return false
    } else {
      streak = 0
    }
  }
  return true
}

export function generateNames(
  count: number,
  min: number,
  max: number,
  vowels: string[] = ALL_VOWELS,
  consonants: string[] = DEFAULT_CONSONANTS
): string[] {
  if (vowels.length === 0 || consonants.length === 0) return []

  const names = new Set<string>()
  const lengths = Array.from({ length: max - min + 1 }, (_, i) => min + i)

  let attempts = 0
  while (names.size < count && attempts < count * 30) {
    attempts++
    const len = lengths[Math.floor(Math.random() * lengths.length)]
    const opts = patterns[len] ?? patterns[5]
    const pattern = opts[Math.floor(Math.random() * opts.length)]
    const name = fromPattern(pattern, vowels, consonants)
    if (isReadable(name, vowels)) names.add(name)
  }

  return Array.from(names)
}
