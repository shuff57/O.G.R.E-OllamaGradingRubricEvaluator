const Prompts = {
  /**
   * Generates the prompt for extracting a rubric from selected text.
   * @param {string} selection - The text selected by the user.
   * @returns {string} The formatted prompt for the LLM.
   */
  getRubricExtractionPrompt: (selection) => {
    return `You are a data extraction assistant. 
  Extract grading rubric criteria from the following text.
  Return ONLY a valid JSON object with this structure:
  {
    "rubric": [
      { "criteria": "Criteria Name", "description": "Description of criteria", "points": "Points value (number or string)" }
    ]
  }
  Do not include markdown formatting or explanations.
  
  Text to parse:
  ${selection}`;
  },

  /**
   * Generates the prompt for extracting a rubric from an image.
   * @returns {string} The formatted prompt for the LLM.
   */
  getRubricExtractionFromImagePrompt: () => {
    return `You are a data extraction assistant. 
  Extract grading rubric criteria from the provided image.
  Return ONLY a valid JSON object with this structure:
  {
    "rubric": [
      { "criteria": "Criteria Name", "description": "Description of criteria", "points": "Points value (number or string)" }
    ]
  }
  Do not include markdown formatting or explanations.`;
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
  Do include markdown formatting for the JSON but no explanations outside the JSON.`;
  },

   /**
    * Generates the system instruction for the solver/tutor task.
    * @param {string} rubricText - The context or topic (optional).
    * @returns {string} The system instruction for the LLM.
    */
   getSolverSystemPrompt: (rubricText) => {
     return `You are an expert tutor. Your goal is to guide the student to the solution, but NEVER just give the answer immediately.
     
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

Return ONLY a valid JSON object with this structure:
{
  "rubric": [
    { "criteria": "Short Criteria Name", "description": "Full: ... | Partial: ... | None: ...", "points": 5, "question": 1 }
  ]
}
Do not include markdown formatting or explanations.

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
These are high school seniors, not college students or experts. Grade generously:
- Give full credit for demonstrating understanding, even if the explanation lacks polish
- Award substantial partial credit for correct reasoning with minor errors
- Focus on mathematical thinking and effort, not perfect execution
- Distinguish conceptual misunderstandings (serious) from minor mistakes (not serious)
- Wrong terminology with correct concept = most of the points
- Minor errors or omissions lose at most 1 point per category
- Any substantive attempt that engages with the prompt earns at least 40% of max score

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
   },

   /**
    * Parses batch grading response JSON, handling markdown code blocks.
    * @param {string} responseText - The response text from the LLM.
    * @returns {object} Parsed object with { score, feedback }.
    */
   parseBatchGradingResponse: (responseText) => {
     try {
       // Remove markdown code block if present
       let jsonString = responseText.trim();
       if (jsonString.startsWith('```json')) {
         jsonString = jsonString.replace(/^```json\n?/, '').replace(/\n?```$/, '');
       } else if (jsonString.startsWith('```')) {
         jsonString = jsonString.replace(/^```\n?/, '').replace(/\n?```$/, '');
       }

       const parsed = JSON.parse(jsonString);
       return {
         score: parsed.score,
         feedback: parsed.feedback
       };
     } catch (e) {
       console.error('Error parsing batch grading response:', e);
       throw new Error(`Failed to parse grading response: ${e.message}`);
     }
   }
};
