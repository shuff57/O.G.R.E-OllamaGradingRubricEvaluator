import { GRADING_PHILOSOPHY } from './grading-constants.js';

/**
 * Strips markdown JSON fences and parses raw AI response text as JSON.
 * @param {string} text - Raw AI response that may contain ```json fences.
 * @returns {object} Parsed JSON object.
 * @throws {Error} Descriptive error if JSON parsing fails.
 */
export function parseJSONResponse(text) {
  const cleaned = (text || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse JSON response: ${e.message}\nRaw text: ${cleaned.slice(0, 200)}`);
  }
}

const Prompts = {
  /**
   * Generates the prompt for extracting a rubric from selected text.
   * @param {string} selection - The text selected by the user.
   * @returns {string} The formatted prompt for the LLM.
   */
  getRubricExtractionPrompt: (selection) => {
    return `You are a data extraction assistant specialized in parsing grading rubrics.

Your task: Extract grading rubric criteria from the provided text and return ONLY valid JSON.

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON. No markdown code fences. No explanation text. No extra commentary.
- If no rubric criteria are found in the text, return exactly: {"rubric": []}
- Each criterion must have: "criteria" (name), "description" (details), and "points" (value as number or string).

EXAMPLE:
Input text:
"Participation (5 points): Student actively engages in class discussions.
Homework (10 points): All assignments completed on time."

Expected JSON output:
{"rubric": [{"criteria": "Participation", "description": "Student actively engages in class discussions.", "points": "5"}, {"criteria": "Homework", "description": "All assignments completed on time.", "points": "10"}]}

Now extract the rubric from this text:
${selection}`;
  },

   /**
    * Generates the prompt for extracting a rubric from an image.
    * @returns {string} The formatted prompt for the LLM.
    */
   getRubricExtractionFromImagePrompt: () => {
     return `You are a data extraction assistant specialized in parsing grading rubrics from images.

Your task: Extract grading rubric criteria from the provided image and return ONLY valid JSON.

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON. No markdown code fences. No explanation text. No extra commentary.
- If no rubric criteria are visible, return exactly: {"rubric": []}
- Each criterion must have: "criteria" (name), "description" (details), and "points" (value as number or string).

IMAGE CHALLENGES:
The image may contain tables, handwritten text, or low-resolution content. Extract all visible criteria even if partially readable.

EXAMPLE:
Input image: A rubric table with rows for "Participation (5 points): Student actively engages in class discussions" and "Homework (10 points): All assignments completed on time."

Expected JSON output:
{"rubric": [{"criteria": "Participation", "description": "Student actively engages in class discussions.", "points": "5"}, {"criteria": "Homework", "description": "All assignments completed on time.", "points": "10"}]}

Now extract the rubric from the provided image.`;
   },

  /**
   * Generates the system instruction for the grading task.
   * @param {string} rubricText - The formatted rubric text or table data.
   * @returns {string} The system instruction for the LLM.
   */
  getGradingSystemPrompt: (rubricText) => {
    return `You are a strict grading assistant. 
  Here is the rubric/role context: ${rubricText}
  Analyze the student work provided below.
  
  Return ONLY a valid JSON object with this structure:
  {
    "grading": [
      { 
        "criteria": "Criteria Name", 
        "status": "Pass or Fail", 
        "excerpt": "Quote from student text proving the status", 
        "comment": "Specific feedback explaining the status" 
      }
    ],
    "totalScore": "Total Score / number of criteria (if applicable)",
  }
  
  GRADING PHILOSOPHY:
  ${GRADING_PHILOSOPHY}
  
  Return ONLY valid JSON. No markdown code fences. No explanation text outside the JSON.`;
  },

   /**
    * Generates the system instruction for the solver/tutor task.
    * @param {string} rubricText - The context or topic (optional).
    * @returns {string} The system instruction for the LLM.
    */
    getSolverSystemPrompt: (rubricText) => {
      return `You are an expert tutor. Your goal is to guide the student to the solution, but NEVER just give the answer immediately.

Respond in plain text with step-by-step guidance. Use LaTeX notation (\\( ... \\)) for math expressions when helpful.
      
Follow this strict call-and-response structure based on the interaction number:
1. First interaction (Student Q1): Provide minimal, broad help. Hint at the concept but do not reveal the steps.
2. Second interaction (Student Q2 - wrong answer): Provide directed, medium help. Point out the specific area of error or a more specific strategy.
3. Third interaction (Student Q3 - wrong answer): Provide even more direct, strong help. Explicitly state the next step or formula to use.
4. Fourth interaction (Student Q4 - wrong answer): Solve the problem completely and provide step-by-step help.
      
Context/Topic: ${rubricText}
      
Maintain a helpful, encouraging, but firm tone. Do not skip steps in the guidance process.`;
    },

   /**
    * Generates the prompt for creating a rubric from assignment content (question text, descriptions).
    * Unlike getRubricExtractionPrompt which parses existing rubric text, this CREATES criteria
    * from raw assignment content. Returns the same JSON structure for consistency.
    * @param {string} content - The assignment question/prompt/description text.
    * @param {string|number} maxScore - The maximum score for this assignment.
    * @returns {string} The formatted prompt for the LLM.
    */
   getRubricGenerationPrompt: (content, maxScore) => {
      return `You are an experienced teacher creating a grading rubric for high school seniors.
Given the following assignment content, create clear grading criteria for FREE RESPONSE / ESSAY questions ONLY.
Ignore multiple choice, true/false, matching, fill-in-the-blank, and other auto-graded question types.
The criteria point values must total ${maxScore}.

If there are multiple questions, tag each criterion with its question number.
For single-question assignments, use "question": 1 for all criteria.

Keep descriptions concise (1 sentence each). Use this format for each description:
"Full: [what earns full credit] | Partial: [what earns partial] | None: [what earns zero]"

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON. No markdown code fences. No explanation text. No extra commentary.
- If the content is empty or too short to generate meaningful criteria, return exactly: {"rubric": []}

Return ONLY a valid JSON object with this structure:
{
  "rubric": [
    { "criteria": "Short Criteria Name", "description": "Full: ... | Partial: ... | None: ...", "points": 5, "question": 1 }
  ]
}

Assignment (max ${maxScore} points):
${content}`;
    },

   /**
    * Generates the system instruction for batch grading with custom instructions support.
    * @param {string} rubric - The grading rubric/criteria.
    * @param {number} maxScore - The maximum score for this assignment.
    * @param {string} customInstructions - Optional custom grading instructions to append.
    * @returns {string} The system instruction for batch grading.
    */
    getBatchGradingSystemPrompt: (rubric, maxScore, customInstructions) => {
      let prompt = `You are a generous grading assistant. Grade the student work below against the rubric.

GRADING PHILOSOPHY:
${GRADING_PHILOSOPHY}

RUBRIC:
${rubric}

MAX SCORE: ${maxScore}

Return ONLY a valid JSON object with this structure:
{
  "score": <integer from 0 to ${maxScore}>,
  "feedback": "<constructive, supportive feedback>"
}

Do not include markdown formatting or explanations outside the JSON.`;

     if (customInstructions) {
       prompt += `\n\nCUSTOM INSTRUCTIONS:\n${customInstructions}`;
     }

     return prompt;
    }
  };

export default Prompts;
