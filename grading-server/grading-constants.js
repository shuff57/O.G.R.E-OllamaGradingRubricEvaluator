// Shared grading philosophy constant — imported by all prompt builders
export const GRADING_PHILOSOPHY = `Grade each response against the rubric criteria provided:
- Award credit proportional to how thoroughly each rubric criterion is met, not response length
- Evaluate what the student demonstrated, not what they omitted
- Use the full scoring range (0-10) as defined by the scoring anchors — do not compress toward the middle
- Treat scoring-scale descriptors as calibration references when assigning a score
- Off-topic, empty, or nonsensical responses receive a score of 0
- When no custom instructions are provided, grade solely on rubric alignment
- Instructor custom instructions (if any) take absolute precedence over this base philosophy
- A concise answer that addresses all rubric criteria is equivalent to a longer one that does the same`

// Unified scoring scale descriptors (0-10) — neutral language, ≤15 words per level
// Used by both buildBatchPrompt and buildSingleGradePrompt
export const SCORING_SCALE_DESCRIPTORS = [
  { score: 0, descriptor: 'No submission or completely blank' },
  { score: 1, descriptor: 'Off-topic: response does not address the question at all' },
  { score: 2, descriptor: 'Minimal effort: mentions the topic but shows almost no understanding' },
  { score: 3, descriptor: 'Very limited: some awareness of concepts but largely incomplete' },
  { score: 4, descriptor: 'Partial: shows basic familiarity but misses most key criteria' },
  { score: 5, descriptor: 'Developing: demonstrates partial understanding, covers some key points' },
  { score: 6, descriptor: 'Approaching: addresses main ideas but with notable gaps or errors' },
  { score: 7, descriptor: 'Competent: addresses most rubric criteria adequately' },
  { score: 8, descriptor: 'Proficient: correctly addresses all rubric criteria' },
  { score: 9, descriptor: 'Strong: thorough and accurate with clear explanation' },
  { score: 10, descriptor: 'Excellent: comprehensive, precise, and clearly communicated' },
];
