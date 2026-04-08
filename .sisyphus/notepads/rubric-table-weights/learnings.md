
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

