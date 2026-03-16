# Wire Format: JSON Request/Response Schemas

This document defines the exact JSON structures for the POST `/grade` endpoint. The server accepts grading requests from the desktop app and returns scored results with feedback.

---

## Request Schema

**Endpoint:** `POST /grade`

**Description:** Submit a batch of student responses for grading against a rubric.

### Request Body

```json
{
  "provider": "string",
  "apiUrl": "string",
  "apiKey": "string",
  "model": "string",
  "rubric": {
    "essayPrompt": "string",
    "checklistItems": [
      {
        "category": "string",
        "points": "number",
        "items": ["string"]
      }
    ],
    "rubricItems": [
      {
        "category": "string",
        "items": ["string"]
      }
    ],
    "modelText": "string | null",
    "maxScore": "string"
  },
  "students": [
    {
      "index": "number",
      "name": "string",
      "currentScore": "string",
      "hasFeedback": "boolean",
      "response": "string"
    }
  ],
  "config": {
    "customInstructions": "string | null",
    "gradingPhilosophy": "string | null"
  }
}
```

### Field Definitions

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `provider` | string | Yes | AI provider identifier | `"anthropic"`, `"openai"`, `"ollama"` |
| `apiUrl` | string | Yes | Provider API endpoint URL | `"https://api.anthropic.com"` |
| `apiKey` | string | Yes | Authentication token for the provider | `"sk-ant-..."` |
| `model` | string | Yes | Model identifier to use for grading | `"claude-3-5-sonnet-20241022"` |
| `rubric.essayPrompt` | string | Yes | The question/prompt students are answering | `"Explain the relationship between sample size and margin of error..."` |
| `rubric.checklistItems` | array | Yes | Grading checklist with point values | See example below |
| `rubric.checklistItems[].category` | string | Yes | Category name with point value | `"Understanding of Sample Size Effect (3 points)"` |
| `rubric.checklistItems[].points` | number | Yes | Points for this category | `3` |
| `rubric.checklistItems[].items` | array | Yes | Specific criteria to check | `["Explains that larger samples reduce margin of error", ...]` |
| `rubric.rubricItems` | array | Yes | Target answers and key concepts | See example below |
| `rubric.rubricItems[].category` | string | Yes | Category name | `"Key Concepts to Address"` |
| `rubric.rubricItems[].items` | array | Yes | List of target concepts/answers | `["Sample size (n) affects precision of estimates", ...]` |
| `rubric.modelText` | string \| null | No | Model/exemplar response text | `"As sample size increases, the margin of error decreases..."` |
| `rubric.maxScore` | string | Yes | Maximum possible score (numeric string) | `"10"`, `"20"`, `"5.5"` |
| `students` | array | Yes | Array of student responses to grade | See example below |
| `students[].index` | number | Yes | 0-based position in the student list | `0`, `1`, `2` |
| `students[].name` | string | Yes | Student's name | `"Smith, John"` |
| `students[].currentScore` | string | Yes | Current score on the page (may be empty) | `""`, `"5"`, `"7.5"` |
| `students[].hasFeedback` | boolean | Yes | Whether feedback already exists | `true`, `false` |
| `students[].response` | string | Yes | Student's full response text | `"The Central Limit Theorem states that..."` |
| `config.customInstructions` | string \| null | No | Additional grading instructions from user | `"Be lenient on notation"` |
| `config.gradingPhilosophy` | string \| null | No | Grading approach (e.g., "generous", "strict") | `"generous"` |

### Request Example

```json
{
  "provider": "anthropic",
  "apiUrl": "https://api.anthropic.com",
  "apiKey": "sk-ant-v7-...",
  "model": "claude-3-5-sonnet-20241022",
  "rubric": {
    "essayPrompt": "Explain the relationship between sample size and margin of error in statistical inference. Use the Central Limit Theorem to support your explanation.",
    "checklistItems": [
      {
        "category": "Understanding of Sample Size Effect (3 points)",
        "points": 3,
        "items": [
          "Explains that larger samples reduce margin of error",
          "Mentions inverse relationship (as n increases, margin decreases)",
          "Uses correct mathematical relationship (margin ∝ 1/√n)"
        ]
      },
      {
        "category": "Central Limit Theorem Connection (4 points)",
        "points": 4,
        "items": [
          "States that CLT describes sampling distribution behavior",
          "Explains that standard error decreases with sample size",
          "Connects standard error to margin of error calculation"
        ]
      },
      {
        "category": "Mathematical Precision (2 points)",
        "points": 2,
        "items": [
          "Uses correct notation (n, σ, standard error)",
          "Shows formula or explains proportionality clearly"
        ]
      },
      {
        "category": "Clear Communication (1 point)",
        "points": 1,
        "items": [
          "Response is organized and easy to follow",
          "Uses appropriate statistical terminology"
        ]
      }
    ],
    "rubricItems": [
      {
        "category": "Key Concepts to Address",
        "items": [
          "Sample size (n) affects precision of estimates",
          "Standard error = σ/√n",
          "Margin of error = (critical value) × (standard error)",
          "Larger n → smaller SE → smaller margin of error",
          "CLT ensures normal sampling distribution for large n"
        ]
      }
    ],
    "modelText": "As sample size increases, the margin of error decreases because the standard error of the mean becomes smaller. The Central Limit Theorem tells us that the sampling distribution of the mean approaches a normal distribution as n grows, with standard error σ/√n. Since margin of error is calculated as z* × (σ/√n), increasing n reduces the standard error and thus shrinks the margin of error. This inverse relationship (proportional to 1/√n) means we need to quadruple the sample size to cut the margin in half.",
    "maxScore": "10"
  },
  "students": [
    {
      "index": 0,
      "name": "Student A - Excellent",
      "currentScore": "",
      "hasFeedback": false,
      "response": "The Central Limit Theorem states that as sample size n increases, the sampling distribution of the mean approaches normality with standard error σ/√n. This directly affects margin of error because MOE = z* × SE. When we increase n, the denominator √n gets larger, making SE smaller. Since margin of error is proportional to SE, it also decreases. For example, to cut the margin in half, we need to quadruple the sample size (because √4 = 2). This inverse square root relationship is fundamental to survey design - larger samples give more precise estimates with tighter confidence intervals."
    },
    {
      "index": 1,
      "name": "Student B - Very Good",
      "currentScore": "",
      "hasFeedback": false,
      "response": "Larger sample sizes reduce the margin of error. The Central Limit Theorem shows that the standard error equals σ/√n, so when n increases, SE decreases. Margin of error depends on standard error (MOE = critical value × SE), so smaller SE means smaller margin. That's why statisticians prefer large samples - they get more accurate estimates of population parameters. The relationship is inversely proportional to the square root of n."
    },
    {
      "index": 2,
      "name": "Student C - Good",
      "currentScore": "",
      "hasFeedback": false,
      "response": "Sample size affects margin of error through the Central Limit Theorem. When you have a bigger sample, your estimates are more accurate because the standard error gets smaller. The formula for standard error has √n in the denominator, so larger n makes it smaller. This makes the margin of error smaller too. That's why polls with 1000 people are more reliable than polls with 100 people."
    }
  ],
  "config": {
    "customInstructions": null,
    "gradingPhilosophy": "generous"
  }
}
```

---

## Response Schema

**Status Code:** `200 OK`

**Description:** Successful grading response with scores, feedback, and statistics.

### Response Body

```json
{
  "results": [
    {
      "index": "number",
      "name": "string",
      "score": "number",
      "feedback": "string",
      "flags": ["string"]
    }
  ],
  "anchors": {
    "excellent": {
      "score": "number",
      "description": "string"
    },
    "adequate": {
      "score": "number",
      "description": "string"
    },
    "minimal": {
      "score": "number",
      "description": "string"
    }
  },
  "stats": {
    "totalGraded": "number",
    "averageScore": "number",
    "minScore": "number",
    "maxScore": "number",
    "standardDeviation": "number"
  },
  "errors": ["string"]
}
```

### Field Definitions

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `results` | array | Array of graded student results | See example below |
| `results[].index` | number | 0-based position matching request | `0`, `1`, `2` |
| `results[].name` | string | Student name (from request) | `"Student A - Excellent"` |
| `results[].score` | number | Numeric score (0 to maxScore, allows 0.5 increments) | `9.5`, `7.0`, `0` |
| `results[].feedback` | string | Constructive feedback for the student | `"Excellent work! You thoroughly addressed..."` |
| `results[].flags` | array | Quality flags for review (empty if none) | `["high_score_sparse_response"]`, `[]` |
| `anchors.excellent.score` | number | Score for excellent-quality response | `9.5` |
| `anchors.excellent.description` | string | Description of excellent anchor | `"Addresses all rubric criteria explicitly..."` |
| `anchors.adequate.score` | number | Score for adequate-quality response | `6.8` |
| `anchors.adequate.description` | string | Description of adequate anchor | `"Addresses 70-80% of rubric criteria..."` |
| `anchors.minimal.score` | number | Score for minimal-quality response | `2.8` |
| `anchors.minimal.description` | string | Description of minimal anchor | `"Addresses only 1-2 criteria partially..."` |
| `stats.totalGraded` | number | Count of students graded | `3` |
| `stats.averageScore` | number | Mean score across all graded students | `7.83` |
| `stats.minScore` | number | Lowest score | `0` |
| `stats.maxScore` | number | Highest score | `10` |
| `stats.standardDeviation` | number | Standard deviation of scores | `1.45` |
| `errors` | array | Array of error messages (empty if no errors) | `[]`, `["Failed to grade Student D: timeout"]` |

### Response Example

```json
{
  "results": [
    {
      "index": 0,
      "name": "Student A - Excellent",
      "score": 9.5,
      "feedback": "Excellent work! You thoroughly addressed all rubric criteria. Your explanation of the inverse square root relationship (margin ∝ 1/√n) demonstrates strong mathematical understanding. You correctly connected the Central Limit Theorem to standard error and margin of error, and your example about quadrupling sample size to cut the margin in half shows deep conceptual mastery. This is exemplary work.",
      "flags": []
    },
    {
      "index": 1,
      "name": "Student B - Very Good",
      "score": 8.5,
      "feedback": "Very good response! You correctly explained the inverse relationship between sample size and margin of error, and you properly connected the Central Limit Theorem to standard error (σ/√n). Your reasoning about why statisticians prefer large samples is sound. To strengthen your response, consider including the specific mathematical relationship (margin ∝ 1/√n) or a concrete example like the quadrupling effect.",
      "flags": []
    },
    {
      "index": 2,
      "name": "Student C - Good",
      "score": 7.0,
      "feedback": "Good effort! You correctly identified that larger samples reduce margin of error and explained the role of √n in the standard error formula. Your poll example (1000 vs 100 people) effectively illustrates the concept. However, you could strengthen your response by explicitly mentioning the Central Limit Theorem's role in ensuring the sampling distribution is normal, and by explaining the specific mathematical relationship (margin ∝ 1/√n).",
      "flags": []
    }
  ],
  "anchors": {
    "excellent": {
      "score": 9.5,
      "description": "Addresses all rubric criteria explicitly. Uses terminology from model response. Shows deep understanding with precise explanations. Covers: Understanding of Sample Size Effect, Central Limit Theorem Connection, Mathematical Precision, Clear Communication. Matches model response quality."
    },
    "adequate": {
      "score": 6.8,
      "description": "Addresses 70-80% of rubric criteria. May have minor errors or omissions in 1-2 categories. Core concept understood but lacks depth or precision. Strong on: Sample Size Effect and CLT Connection. Needs improvement: Mathematical Precision or Communication."
    },
    "minimal": {
      "score": 2.8,
      "description": "Addresses only 1-2 criteria partially. Significant gaps or misconceptions. Shows awareness but lacks explanation or depth. Shows basic awareness of sample size effect. Missing: CLT connection, mathematical precision, clear communication. May contain misconceptions."
    }
  },
  "stats": {
    "totalGraded": 3,
    "averageScore": 8.33,
    "minScore": 7.0,
    "maxScore": 9.5,
    "standardDeviation": 1.08
  },
  "errors": []
}
```

---

## Error Response Schema

**Status Code:** `400 Bad Request`, `401 Unauthorized`, `500 Internal Server Error`

**Description:** Error response when request validation fails or grading encounters an error.

### Error Response Body

```json
{
  "error": "string",
  "code": "string",
  "details": {
    "field": "string",
    "message": "string"
  }
}
```

### Field Definitions

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `error` | string | Human-readable error message | `"Invalid request body"` |
| `code` | string | Machine-readable error code | `"INVALID_REQUEST"`, `"AUTH_FAILED"`, `"PROVIDER_ERROR"` |
| `details` | object | Optional additional error context | See examples below |
| `details.field` | string | Field that caused the error (if applicable) | `"rubric.maxScore"` |
| `details.message` | string | Detailed explanation | `"maxScore must be a numeric string"` |

### Error Response Examples

**Example 1: Missing Required Field**
```json
{
  "error": "Invalid request body",
  "code": "INVALID_REQUEST",
  "details": {
    "field": "rubric.maxScore",
    "message": "maxScore is required and must be a numeric string"
  }
}
```

**Example 2: Authentication Failure**
```json
{
  "error": "Authentication failed",
  "code": "AUTH_FAILED",
  "details": {
    "field": "apiKey",
    "message": "Invalid API key for provider 'anthropic'"
  }
}
```

**Example 3: Provider Error**
```json
{
  "error": "Provider request failed",
  "code": "PROVIDER_ERROR",
  "details": {
    "field": "provider",
    "message": "OpenAI API returned 429: Rate limit exceeded. Retry after 60 seconds."
  }
}
```

**Example 4: Empty Students Array**
```json
{
  "error": "Invalid request body",
  "code": "INVALID_REQUEST",
  "details": {
    "field": "students",
    "message": "students array must contain at least 1 student"
  }
}
```

---

## Field Constraints & Validation Rules

### Request Validation

| Field | Constraint | Validation |
|-------|-----------|-----------|
| `provider` | Non-empty string | Must be one of: `"anthropic"`, `"openai"`, `"ollama"`, `"gemini"`, `"github"` |
| `apiUrl` | Valid URL | Must be a valid HTTPS URL (or HTTP for localhost) |
| `apiKey` | Non-empty string | Must not be empty or whitespace-only |
| `model` | Non-empty string | Must not be empty |
| `rubric.essayPrompt` | Non-empty string | Must not be empty |
| `rubric.maxScore` | Numeric string | Must parse to a positive number (e.g., `"10"`, `"5.5"`) |
| `rubric.checklistItems` | Non-empty array | Must contain at least 1 item |
| `rubric.checklistItems[].points` | Positive number | Must be > 0 |
| `students` | Non-empty array | Must contain at least 1 student |
| `students[].index` | Non-negative integer | Must be >= 0 and < array length |
| `students[].name` | Non-empty string | Must not be empty |
| `students[].response` | String (may be empty) | Empty string is valid (represents no response) |

### Response Validation

| Field | Constraint | Validation |
|-------|-----------|-----------|
| `results[].score` | Float 0 to maxScore | Must be >= 0 and <= maxScore from request; allows 0.5 increments |
| `results[].feedback` | Non-empty string | Must not be empty; should be constructive and educational |
| `results[].flags` | String array | Each flag is a machine-readable code (e.g., `"high_score_sparse_response"`) |
| `stats.averageScore` | Float | Calculated as sum(scores) / count |
| `stats.standardDeviation` | Float >= 0 | Calculated using population standard deviation formula |

---

## Notes

- **Score Precision:** Scores support 0.5 increments (e.g., 7.0, 7.5, 8.0) for fine-grained grading.
- **Feedback Format:** Feedback may include LaTeX math delimiters `\( ... \)` for inline math (e.g., `\(\bar{x}\)` for sample mean).
- **Flags:** Quality flags are used for outlier detection and second-pass review. Common flags:
  - `"high_score_sparse_response"` — Score > 75% of max but response < 50 words
  - `"low_score_detailed_response"` — Score < 35% of max but response > 200 words
  - `"empty_with_points"` — Response < 10 words but score > 0
  - `"statistical_outlier"` — Score is > 2 standard deviations from mean
- **Error Codes:** Use standard HTTP status codes (400, 401, 500) with machine-readable error codes in the response body.
