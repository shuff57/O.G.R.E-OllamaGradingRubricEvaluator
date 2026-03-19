export const MUTATION_TYPES = {
  REPHRASE_BULLET: 'REPHRASE_BULLET',
  REMOVE_BULLET: 'REMOVE_BULLET',
  ADD_BULLET: 'ADD_BULLET',
  MERGE_BULLETS: 'MERGE_BULLETS',
  ADJUST_DESCRIPTOR: 'ADJUST_DESCRIPTOR',
  SHIFT_DESCRIPTOR_THRESHOLD: 'SHIFT_DESCRIPTOR_THRESHOLD',
  REORDER_BULLETS: 'REORDER_BULLETS',
}

export function createMutationLog() {
  return []
}

export function appendMutation(log, entry) {
  return [...log, { ...entry, timestamp: entry.timestamp ?? Date.now() }]
}

export function hasSimilarMutation(log, proposedMutation) {
  return log.some(
    entry =>
      entry.type === proposedMutation.type &&
      JSON.stringify(entry.target) === JSON.stringify(proposedMutation.target),
  )
}

export function getMutationHistory(log, type = null) {
  if (type === null) {
    return log
  }

  return log.filter(entry => entry.type === type)
}

export function validateMutatedConstants(constants) {
  if (!constants) {
    return { valid: false, reason: 'constants is null/undefined' }
  }

  if (!constants.gradingPhilosophy || typeof constants.gradingPhilosophy !== 'string') {
    return { valid: false, reason: 'gradingPhilosophy must be a non-empty string' }
  }

  if (constants.gradingPhilosophy.trim().length === 0) {
    return { valid: false, reason: 'gradingPhilosophy cannot be empty' }
  }

  if (!Array.isArray(constants.scoringScaleDescriptors)) {
    return { valid: false, reason: 'scoringScaleDescriptors must be an array' }
  }

  const scores = constants.scoringScaleDescriptors.map(d => d.score)
  for (let i = 0; i <= 10; i++) {
    if (!scores.includes(i)) {
      return {
        valid: false,
        reason: `Missing score level ${i} in scoringScaleDescriptors`,
      }
    }
  }

  const uniqueScores = new Set(scores)
  if (uniqueScores.size !== scores.length) {
    return { valid: false, reason: 'Duplicate score levels in scoringScaleDescriptors' }
  }

  return { valid: true }
}
