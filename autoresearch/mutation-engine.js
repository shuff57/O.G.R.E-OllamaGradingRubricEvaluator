import {
  MUTATION_TYPES,
  hasSimilarMutation,
  validateMutatedConstants,
} from './mutations.js'

const MAX_PROPOSAL_RETRIES = 3

export function parseBullets(gradingPhilosophy) {
  if (typeof gradingPhilosophy !== 'string') {
    return []
  }

  return gradingPhilosophy
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

export function reconstructPhilosophy(bullets) {
  if (!Array.isArray(bullets)) {
    return ''
  }

  return bullets.join('\n')
}

function assertIndexInRange(index, length, fieldName = 'index') {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error(`Invalid ${fieldName}: ${index}`)
  }
}

function assertAllowedMutationType(type) {
  const allowed = new Set(Object.values(MUTATION_TYPES))
  if (!allowed.has(type)) {
    throw new Error(`Invalid mutation type: ${type}`)
  }
}

function cloneConstants(constants) {
  return {
    gradingPhilosophy: constants.gradingPhilosophy,
    scoringScaleDescriptors: constants.scoringScaleDescriptors.map(level => ({ ...level })),
  }
}

function requireText(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
}

function getDescriptorIndexByScore(descriptors, score) {
  return descriptors.findIndex(level => level.score === score)
}

export async function applyMutation(currentConstants, mutation) {
  if (!currentConstants || !mutation) {
    throw new Error('currentConstants and mutation are required')
  }

  assertAllowedMutationType(mutation.type)

  const next = cloneConstants(currentConstants)
  const bullets = parseBullets(next.gradingPhilosophy)
  const target = mutation.target ?? {}

  switch (mutation.type) {
    case MUTATION_TYPES.REPHRASE_BULLET: {
      assertIndexInRange(target.bulletIndex, bullets.length, 'target.bulletIndex')
      requireText(mutation.newText, 'newText')
      bullets[target.bulletIndex] = mutation.newText.trim()
      next.gradingPhilosophy = reconstructPhilosophy(bullets)
      break
    }

    case MUTATION_TYPES.REMOVE_BULLET: {
      assertIndexInRange(target.bulletIndex, bullets.length, 'target.bulletIndex')
      if (bullets.length - 1 < 6) {
        throw new Error('REMOVE_BULLET would violate minimum bullet count (6)')
      }
      bullets.splice(target.bulletIndex, 1)
      next.gradingPhilosophy = reconstructPhilosophy(bullets)
      break
    }

    case MUTATION_TYPES.ADD_BULLET: {
      assertIndexInRange(target.afterIndex, bullets.length, 'target.afterIndex')
      requireText(mutation.newText, 'newText')
      bullets.splice(target.afterIndex + 1, 0, mutation.newText.trim())
      next.gradingPhilosophy = reconstructPhilosophy(bullets)
      break
    }

    case MUTATION_TYPES.MERGE_BULLETS: {
      assertIndexInRange(target.bulletIndex1, bullets.length, 'target.bulletIndex1')
      assertIndexInRange(target.bulletIndex2, bullets.length, 'target.bulletIndex2')
      if (target.bulletIndex1 === target.bulletIndex2) {
        throw new Error('MERGE_BULLETS requires two distinct indices')
      }
      requireText(mutation.mergedText, 'mergedText')

      const lower = Math.min(target.bulletIndex1, target.bulletIndex2)
      const higher = Math.max(target.bulletIndex1, target.bulletIndex2)
      bullets[lower] = mutation.mergedText.trim()
      bullets.splice(higher, 1)
      next.gradingPhilosophy = reconstructPhilosophy(bullets)
      break
    }

    case MUTATION_TYPES.ADJUST_DESCRIPTOR: {
      requireText(mutation.newDescriptor, 'newDescriptor')
      const descriptorIndex = getDescriptorIndexByScore(next.scoringScaleDescriptors, target.score)
      if (descriptorIndex === -1) {
        throw new Error(`Descriptor score not found: ${target.score}`)
      }
      next.scoringScaleDescriptors[descriptorIndex].descriptor = mutation.newDescriptor.trim()
      break
    }

    case MUTATION_TYPES.SHIFT_DESCRIPTOR_THRESHOLD: {
      const fromIndex = getDescriptorIndexByScore(next.scoringScaleDescriptors, target.fromScore)
      const toIndex = getDescriptorIndexByScore(next.scoringScaleDescriptors, target.toScore)
      if (fromIndex === -1 || toIndex === -1) {
        throw new Error(
          `SHIFT_DESCRIPTOR_THRESHOLD score not found: ${target.fromScore} -> ${target.toScore}`,
        )
      }

      const fromDescriptor = next.scoringScaleDescriptors[fromIndex].descriptor
      next.scoringScaleDescriptors[fromIndex].descriptor =
        next.scoringScaleDescriptors[toIndex].descriptor
      next.scoringScaleDescriptors[toIndex].descriptor = fromDescriptor
      break
    }

    case MUTATION_TYPES.REORDER_BULLETS: {
      assertIndexInRange(target.fromIndex, bullets.length, 'target.fromIndex')
      assertIndexInRange(target.toIndex, bullets.length, 'target.toIndex')

      const [moved] = bullets.splice(target.fromIndex, 1)
      bullets.splice(target.toIndex, 0, moved)
      next.gradingPhilosophy = reconstructPhilosophy(bullets)
      break
    }

    default:
      throw new Error(`Invalid mutation type: ${mutation.type}`)
  }

  const validation = validateMutatedConstants(next)
  if (!validation.valid) {
    throw new Error(`Mutated constants invalid: ${validation.reason}`)
  }

  return next
}

export function buildMutationPrompt(currentConstants, mutationLog, goals = []) {
  const bullets = parseBullets(currentConstants?.gradingPhilosophy ?? '')
  const descriptors = currentConstants?.scoringScaleDescriptors ?? []
  const goalList = [
    'Grade ~1 point higher for well-defined responses (gold score ≥7)',
    'Handle edge cases (blank, exceptional, borderline) more reliably',
    'Make the prompt more concise — remove redundancy, merge overlapping bullets',
    'Improve determinism — reduce ambiguity that causes score variance',
    ...goals,
  ]

  return [
    'You are optimizing grading prompt constants using STRUCTURED mutations only.',
    '',
    'Optimization goals:',
    ...goalList.map(goal => `- ${goal}`),
    '',
    'Allowed mutation types:',
    '- REPHRASE_BULLET',
    '- REMOVE_BULLET',
    '- ADD_BULLET',
    '- MERGE_BULLETS',
    '- ADJUST_DESCRIPTOR',
    '- SHIFT_DESCRIPTOR_THRESHOLD',
    '- REORDER_BULLETS',
    '',
    'Current grading philosophy bullets:',
    ...bullets.map((bullet, i) => `${i}: ${bullet}`),
    '',
    'Current scoring scale descriptors:',
    ...descriptors.map(level => `${level.score}: ${level.descriptor}`),
    '',
    'Mutation log (avoid proposing similar type+target):',
    JSON.stringify(mutationLog ?? [], null, 2),
    '',
    'Return JSON ONLY. No markdown fences. Use this schema:',
    '{',
    '  "type": "REMOVE_BULLET",',
    '  "target": {"bulletIndex": 3},',
    '  "description": "why this mutation helps"',
    '}',
    '',
    'For REPHRASE_BULLET or ADD_BULLET include "newText".',
    'For MERGE_BULLETS include "mergedText".',
    'For ADJUST_DESCRIPTOR include "newDescriptor".',
    'For SHIFT_DESCRIPTOR_THRESHOLD include target {"fromScore": number, "toScore": number}.',
    'For REORDER_BULLETS include target {"fromIndex": number, "toIndex": number}.',
  ].join('\n')
}

function extractTextFromAnthropicResponse(data) {
  if (!data) {
    return null
  }

  const blocks = Array.isArray(data.content) ? data.content : []
  const textBlocks = blocks.filter(block => block?.type === 'text' && typeof block.text === 'string')
  if (textBlocks.length === 0) {
    return null
  }
  return textBlocks.map(block => block.text).join('\n').trim()
}

function tryParseJsonFromText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null
  }

  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {}

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1])
    } catch {
      return null
    }
  }

  return null
}

async function callAnthropicForMutation(prompt, config) {
  if (!config?.apiKey || !config?.model) {
    throw new Error('config.apiKey and config.model are required for Anthropic mutation proposal')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(`Anthropic request failed (${response.status}): ${bodyText}`)
  }

  const data = await response.json()
  return extractTextFromAnthropicResponse(data)
}

function normalizeMutationCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  if (!candidate.type || typeof candidate.type !== 'string') {
    return null
  }

  if (!candidate.target || typeof candidate.target !== 'object') {
    return null
  }

  try {
    assertAllowedMutationType(candidate.type)
  } catch {
    return null
  }

  return candidate
}

export async function proposeMutation(currentConstants, mutationLog, config, llmProvider = null) {
  let workingLog = Array.isArray(mutationLog) ? [...mutationLog] : []

  for (let attempt = 0; attempt < MAX_PROPOSAL_RETRIES; attempt += 1) {
    const prompt = buildMutationPrompt(currentConstants, workingLog, config?.goals ?? [])

    let rawResponse
    if (llmProvider) {
      rawResponse = await llmProvider({ prompt, config, attempt })
    } else {
      rawResponse = await callAnthropicForMutation(prompt, config)
    }

    const candidateObj =
      typeof rawResponse === 'string' ? tryParseJsonFromText(rawResponse) : rawResponse
    const candidate = normalizeMutationCandidate(candidateObj)
    if (!candidate) {
      return null
    }

    if (hasSimilarMutation(workingLog, candidate)) {
      workingLog = [
        ...workingLog,
        {
          type: candidate.type,
          target: candidate.target,
          description: candidate.description ?? 'duplicate proposal rejected',
          result: 'duplicate_rejected',
          timestamp: Date.now(),
        },
      ]
      continue
    }

    return candidate
  }

  return null
}
