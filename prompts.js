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
        "criteria": "Criteria Name from rubric",
        "excerpt": "Exact excerpt from student work that relates to this criteria",
        "status": "✅" or "❌",
        "comment": "Justification for the pass/fail based on the student work"
      }
    ]
  }
  Do not include markdown formatting or explanations outside the JSON.`;
  }
};
