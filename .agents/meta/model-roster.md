
# Model Roster Manager

> This skill helps you manage the agent-to-model mappings in your OpenCode configuration. It displays the current roster, provides model tier references and swap suggestions, then interactively lets you reassign agents to different models by editing oh-my-opencode.json.

## Prerequisites
- Access to ~/.config/opencode/oh-my-opencode.json
- The oh-my-opencode.json file must have a valid "agents" section

## When to Use
- You want to see which models are currently assigned to each agent
- You want to switch an agent to a different model for cost or performance reasons
- You need to understand the available model tiers and their characteristics
- You're experimenting with different model configurations

## When NOT to Use
- You want to modify provider configurations (use provider management skills instead)
- You need to change category model mappings (this skill only handles agent mappings)
- The oh-my-opencode.json file is missing or corrupted

## Guardrails

> ⚠️ **Must NOT:**
> - Modify any section of oh-my-opencode.json other than the "agents" section
> - Change provider configurations or model definitions
> - Alter the "_migrations" section
> - Save the skill without user confirmation of changes

## Quick Start
1. Invoke the skill: `skill(model-roster)`
2. View the current agent→model table
3. Select an agent to reassign
4. Choose a new model from the tiered options
5. Confirm the change and restart OpenCode to apply

## Workflow

### Phase 1: Display Current Roster
- **INPUT:** oh-my-opencode.json file
- **ACTION:** Read the file and extract the "agents" section to display a table showing each agent, its mode (derived from agent name), current model, and variant
- **OUTPUT:** Formatted table printed to console

### Phase 2: Show Model Tier Reference
- **INPUT:** None (uses built-in tier definitions)
- **ACTION:** Display the four model tiers (TIER 1-4) with example models and their characteristics
- **OUTPUT:** Tier reference table printed to console

### Phase 3: Show Swap Suggestions
- **INPUT:** Current agent mappings from Phase 1
- **ACTION:** For each configured agent, show best cheaper swap and best smarter swap based on the tier reference
- **OUTPUT:** Swap suggestions table printed to console

### Phase 4: Interactive Agent Selection
- **INPUT:** None
- **ACTION:** Present a numbered list of agents plus "Cancel" option and ask the user to choose
- **OUTPUT:** Selected agent identifier or cancellation

### Phase 5: Interactive Model Selection
- **INPUT:** Selected agent from Phase 4
- **ACTION:** Present model options from all four tiers with descriptions and ask the user to choose
- **OUTPUT:** Selected model identifier

### Phase 6: Update Configuration
- **INPUT:** Selected agent and model from Phases 4-5
- **ACTION:** 
  - Read oh-my-opencode.json
  - Update the model field for the selected agent
  - Suggest adding/removing variant field as appropriate based on model
  - Write the updated JSON back to the file
- **OUTPUT:** Confirmation message showing old → new model and instruction to restart OpenCode

## Error Handling

| Problem | Action |
|---------|--------|
| oh-my-opencode.json not found or invalid JSON | Show error message and abort operation |
| Selected agent not found in configuration | Show error and return to agent selection |
| Failed to write updated configuration | Show error with details and suggest manual edit |
| User cancels during selection | Exit gracefully without changes |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting to restart OpenCode after changes | Remember that model changes only take effect after restart |
| Trying to modify non-agent sections | This skill only modifies the "agents" section for safety |
| Not checking variant requirements | Some models require variant fields (max, high, xhigh) |
| Using incorrect model identifiers | Always copy exact model strings from the tier reference |

## State Management (optional)
None - this skill operates directly on the configuration file

## Selectors / References (optional)
- Configuration file: ~/.config/opencode/oh-my-opencode.json
- Schema reference: https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/assets/oh-my-opencode.schema.json