
## Task 1: Rubric Table Weights - Type Extensions

### Completed Changes

1. **rubric-api.ts** - Extended interfaces:
   - `RubricCriterion`: Added `category?: string`, `categoryWeight?: number`, `criterionWeight?: number`
   - `SavedRubric`: Added `weightMode?: 'off' | 'category' | 'criterion'`

2. **grading-api.ts** - Extended `BatchGradingRequest`:
   - Added `weightMode?: 'off' | 'category' | 'criterion'` at top level
   - Extended `checklistItems` to include `categoryWeight?: number`

3. **rubric-api.test.ts** - Created compile-time type tests:
   - Test 1: RubricCriterion without new fields (backward compat)
   - Test 2: RubricCriterion with all new fields
   - Test 3: SavedRubric without weightMode (backward compat)

4. **tsconfig.json** - Created minimal config for type checking

### Key Decisions

- All new fields are optional (`?`) to maintain backward compatibility
- Used `satisfies` operator in tests for compile-time type checking
- No runtime code changes - pure type definitions only
- Did not modify `RubricItem` or `Rubric` in `batch-grader.ts` as specified

### Verification

- Type check passes with no new errors
- 47 pre-existing errors in other files (not related to this change)
- All changes committed with conventional commit message


## Task 3: validateWeights() pure utility

### Implementation Pattern
- Map keyed by category string (or undefined) for grouping
- Category mode: record first categoryWeight per unique category key; sum the values
- Criterion mode: group by category, sum criterionWeight per group; error if any group outside 99.5-100.5
- Tolerance: TOLERANCE_LOW = 99.5, TOLERANCE_HIGH = 100.5
- Math.round(sum * 10) / 10 for display-safe rounding in error messages

### Key Gotchas
- Category mode must take ONE weight per category (not per criterion). Multiple criteria in the same category share the same categoryWeight value; summing all of them would multiply-count the category.
- Return { valid: true, errors: [] } (no sum field) for empty arrays.
- undefined category is a valid group key in Map - works correctly by design.
- sum field on valid results: set for category mode, unset for criterion mode when all pass.

### TDD Flow
- Write 16 tests first, all fail with "validateWeights is not a function"
- Implement, all 16 pass, plus 56 pre-existing = 72 total
- Zero new TSC errors (47 pre-existing in unrelated files)

### File Size After Task 3
- rubric-utils.ts: ~211 lines
- rubric-utils.test.ts: ~621 lines
