const DEFAULT_WEIGHTS = {
  generosityShift: 0.30,
  runVariance: 0.25,
  edgeCaseReliability: 0.20,
  within1Rate: 0.15,
  promptConciseness: 0.10,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values) {
  if (!values || values.length <= 1) return 0;
  const avg = mean(values);
  const sumSquaredDeviations = values.reduce((sum, value) => {
    const deviation = value - avg;
    return sum + deviation * deviation;
  }, 0);
  return sumSquaredDeviations / (values.length - 1);
}

export function computeMAE(predicted, gold) {
  if (!predicted.length || !gold.length) return 0;
  const length = Math.min(predicted.length, gold.length);
  let totalAbsoluteError = 0;
  for (let i = 0; i < length; i += 1) {
    totalAbsoluteError += Math.abs(predicted[i] - gold[i]);
  }
  return totalAbsoluteError / length;
}

export function computeWithin1Rate(predicted, gold) {
  if (!predicted.length || !gold.length) return 0;
  const length = Math.min(predicted.length, gold.length);
  let withinCount = 0;
  for (let i = 0; i < length; i += 1) {
    if (Math.abs(predicted[i] - gold[i]) <= 1) {
      withinCount += 1;
    }
  }
  return withinCount / length;
}

export function computeUndergradePenalty(predicted, gold) {
  const length = Math.min(predicted.length, gold.length);
  let totalPenalty = 0;
  for (let i = 0; i < length; i += 1) {
    const diff = predicted[i] - gold[i];
    if (diff < 0) {
      totalPenalty += Math.abs(diff) * 2;
    } else {
      totalPenalty += diff;
    }
  }
  return totalPenalty;
}

export function computeGenerosityShift(predicted, gold, threshold = 7) {
  const length = Math.min(predicted.length, gold.length);
  const predictedStrong = [];
  const goldStrong = [];

  for (let i = 0; i < length; i += 1) {
    if (gold[i] >= threshold) {
      predictedStrong.push(predicted[i]);
      goldStrong.push(gold[i]);
    }
  }

  if (goldStrong.length === 0) return 0;
  return mean(predictedStrong) - mean(goldStrong);
}

export function computeRunVariance(multiRunScores) {
  if (!multiRunScores || multiRunScores.length === 0) return 0;
  const studentCount = multiRunScores[0]?.length ?? 0;
  if (studentCount === 0) return 0;

  let totalVariance = 0;
  for (let studentIndex = 0; studentIndex < studentCount; studentIndex += 1) {
    const scoresAcrossRuns = multiRunScores
      .map((run) => run[studentIndex])
      .filter((score) => typeof score === 'number' && Number.isFinite(score));
    totalVariance += sampleVariance(scoresAcrossRuns);
  }

  return totalVariance / studentCount;
}

export function computeEdgeCaseReliability(multiRunScores, edgeIndices) {
  if (!multiRunScores || multiRunScores.length === 0) return 0;
  if (!edgeIndices || edgeIndices.length === 0) return 0;

  let totalVariance = 0;
  for (const edgeIndex of edgeIndices) {
    const scoresAcrossRuns = multiRunScores
      .map((run) => run[edgeIndex])
      .filter((score) => typeof score === 'number' && Number.isFinite(score));
    totalVariance += sampleVariance(scoresAcrossRuns);
  }

  return totalVariance / edgeIndices.length;
}

export function computePromptConciseness(promptLength, baselineLength) {
  if (!promptLength || promptLength <= 0) return 0;
  return baselineLength / promptLength;
}

export function computeComposite(components, weights = DEFAULT_WEIGHTS) {
  const normalizedGenerosityShift = clamp(0.5 + components.generosityShift / 6, 0, 1);
  const normalizedRunVariance = clamp(1 - components.runVariance / 4, 0, 1);
  const normalizedEdgeCaseReliability = clamp(1 - components.edgeCaseReliability / 4, 0, 1);
  const normalizedWithin1Rate = clamp(components.within1Rate, 0, 1);
  const normalizedPromptConciseness = clamp(components.promptConciseness, 0, 2) / 2;

  return (
    normalizedGenerosityShift * weights.generosityShift +
    normalizedRunVariance * weights.runVariance +
    normalizedEdgeCaseReliability * weights.edgeCaseReliability +
    normalizedWithin1Rate * weights.within1Rate +
    normalizedPromptConciseness * weights.promptConciseness
  );
}
