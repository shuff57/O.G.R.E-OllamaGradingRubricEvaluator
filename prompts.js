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
  Do not include markdown formatting or explanations outside the JSON.`;
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
  }
};
