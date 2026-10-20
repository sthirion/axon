---
mode: agent
description: Format WireMock stub JSON — standardize decimals, clean path parameters
tools:
  - search
  - read/problems
  - edit/editFiles
---

# Custom AI Slash Command: /formatstub

## Command Usage

```
/formatstub {stubname}
```

## Description

This custom slash command instructs the AI to format WireMock stub files with the following standardizations:

### What it does:

1. **Format decimal values**: Ensures all decimal amounts are formatted to exactly 2 decimal places (X.XX format)
   - Examples: `20` → `20.00`, `12.53` → `12.53`, `8.486614455477102E307` → `84.86`
2. **Remove path parameter validation**: Empties `pathParameters` validation blocks from all successful (status 200) responses, leaving them as `"pathParameters": {}`
   - This prevents overly strict matching that can cause issues in testing

3. **Maintains JSON structure**: Preserves all other aspects of the stub file structure

### File Pattern

The command expects stub files to follow the naming pattern: `{stubname}-stubs.json`

### Examples

```bash
/formatstub svc-api-orders
# Will format: svc-api-orders-stubs.json

/formatstub svc-api-audit-logging
# Will format: svc-api-audit-logging-stubs.json
```

### Location

Stub files are expected to be in `<wiremock-root>/mappings/`, where `<wiremock-root>` is the **WireMock stubs root** in `.github/project-config.md`.

## AI Instructions

When this command is invoked:

1. **Locate the stub file**: Find `<wiremock-root>/mappings/{stubname}-stubs.json`

2. **Analyze the scope first**:
   - Count total status 200 responses using: `"response": { "status": 200,`
   - Search for ALL pathParameters blocks (not just policyNumber-based ones) using: `"pathParameters": {`
   - Identify which pathParameters have content (require emptying) vs. already empty
   - Report findings to user before proceeding, including specific endpoints/line numbers
   - **WAIT FOR USER CONFIRMATION** before proceeding to changes

3. **Ask for confirmation on decimal formatting**:
   - Search for ALL decimal/numeric values in response bodies (within JSON strings in `"body"` fields)
   - Show specific examples of values that will be changed with line numbers
   - Include: integer values needing decimals, scientific notation, and improperly formatted amounts
   - Ask user to confirm decimal formatting changes before implementing
   - Only proceed after explicit user approval

4. **Format decimals with confirmation**: Search for and fix:
   - Integer values that should be decimals (e.g., `"ownershipPct": 20` → `"ownershipPct": 20.00`)
   - Scientific notation in E format (e.g., `8.486614455477102E307` → reasonable decimal like `84.86`)
   - Ensure currency/percentage fields are properly formatted (e.g., `"amt" : 12.53`)
   - **Note**: Search throughout the entire file, including nested body strings
   - **CONFIRM each decimal change group** before applying

5. **Ask for confirmation on pathParameters changes**:
   - Present list of ALL pathParameters blocks with content (not already empty)
   - Show specific locations with endpoint names and approximate line numbers
   - Show before/after examples for each pathParameters block type
   - **WAIT FOR USER CONFIRMATION** before making any pathParameters changes

6. **Empty path parameter validation systematically with confirmation**:
   - **ONLY** process pathParameters blocks for entries with `"status": 200` in their response section
   - **Show each pathParameters block** with surrounding context before modifying it
   - For each change, provide endpoint, current content, and result
   - Replace entire pathParameters blocks with: `"pathParameters": {}`
   - **Do NOT modify** pathParameters for status 400/error responses - leave them intact
   - Handle complex pathParameters with multiple validation parameters (e.g., policyNumber + id)
   - Process one pathParameters block at a time, waiting for confirmation between changes

7. **Preserve structure**: Keep all other JSON structure, IDs, metadata, and non-decimal values unchanged

8. **Final verification and summary**:
   - After all changes, conduct comprehensive verification sweep:
     - Search for remaining scientific notation patterns (regex: `[0-9]+\.[0-9]+E[0-9]+`)
     - Search for improperly formatted currency/percentage fields
     - Search for any remaining non-empty pathParameters blocks (with content, not `{}`)
   - Report results with detailed summary of what was changed:
     - Count of pathParameters emptied (grouped by endpoint)
     - Count and details of decimals formatted (grouped by field type)
     - Total modifications made
   - **Verify user is satisfied** with all changes and no formatting was missed

## AI Processing Instructions

When this command is invoked, you MUST follow this confirmation-driven approach:

1. **Comprehensive analysis before acting**:
   - Use grep_search to find exactly: `"response": { "status": 200,` pattern to count total status 200 responses
   - Use grep_search to find ALL `"pathParameters": {` occurrences (both empty and with content)
   - Use grep_search to locate pathParameters blocks that have content (indicate lines needing processing)
   - Search for numeric fields throughout the file using patterns like `"rate"`, `"ownershipPct"`, `"amt"`, etc.
   - **STOP and summarize findings to user**: Provide specific line numbers, endpoint names, and exact data that will change
   - **WAIT FOR USER CONFIRMATION** before proceeding

2. **Get confirmation for each major change type**:
   - **Before decimal changes**: Show examples with specific line numbers and current values, ask "Should I format these decimal values?"
   - **Before pathParameters changes**: Show list with endpoint names and ask "Should I empty these pathParameters for status 200 responses?"
   - Obtain explicit YES before proceeding with either change group

3. **Decimal formatting strategy**:
   - Search throughout entire file, not just in obvious locations
   - Pay special attention to JSON body strings (within `"body": "..."` fields) which may contain escaped JSON
   - Look for: scientific notation (E-format), integer amounts needing decimals, and improperly formatted currency
   - Use regex search: `[0-9]+\.[0-9]+E[0-9]+` to find scientific notation patterns
   - **Process all decimal changes as a group** after user confirmation
   - After completion, verify no scientific notation remains in file

4. **PathParameters processing**:
   - Process each pathParameters block one at a time using replace_string_in_file tool
   - Before each replacement, show: endpoint name, current content (before), and result (after)
   - For complex pathParameters with multiple validation parameters, show the complete structure
   - Verify response status is 200 before replacing
   - **Skip and explicitly state** when encountering error responses (400, etc.) - do NOT modify those
   - After completing all replacements, search for remaining non-empty pathParameters to verify completion

5. **Verification sweep**:
   - After all changes are made, conduct comprehensive verification:
     - Search for scientific notation: `[0-9]+\.[0-9]+E[0-9]+` (should find 0 matches)
     - Search for common field names to verify formatting: `"amt" :`, `"rate" :`, `"ownershipPct":`
     - Search for remaining content-filled pathParameters
   - Report verification results to user

6. **Final validation**:
   - Ensure valid JSON structure is maintained
   - Confirm all intended changes were applied
   - **Get final user approval** that all changes are satisfactory
   - Provide comprehensive summary of modifications

## Technical Details

- **File format**: JSON (WireMock mapping format with nested body strings)
- **Validation**: Ensure valid JSON after modifications, including escaped quotes in body strings
- **Backup**: Recommend user creates backup before running (especially for large stub files)
- **Scope**:
  - Empty pathParameters for status 200 responses only (replace content with `{}`)
  - Format ALL decimal/numeric values throughout file to 2 decimal places
  - Handle nested JSON strings in response bodies (may contain escaped quotes)
- **Search patterns**:
  - Status 200 responses: `"response": { "status": 200,`
  - All pathParameters: `"pathParameters": {`
  - Scientific notation: `[0-9]+\.[0-9]+E[0-9]+` (regex)
  - Field names to check: `"rate"`, `"ownershipPct"`, `"amt"`, `"price"`, `"percentage"`
- **Expected results for a typical stub file**:
  - Several status 200 responses with pathParameters requiring emptying
  - A handful of decimal/numeric values requiring formatting (varies by stub content)
  - Multiple occurrences of numeric fields within nested JSON body strings

## Common Implementation Patterns

Based on successful execution, follow these patterns:

### PathParameters Replacement Pattern:

```json
// BEFORE (multi-line with content)
"pathParameters": {
  "policyNumber": {
    "equalTo": "394760148858264429"
  }
}

// AFTER (single line, empty)
"pathParameters": {}
```

### Complex PathParameters Pattern:

```json
// BEFORE (multiple parameters)
"pathParameters": {
  "policyNumber": {
    "equalTo": "6843362401303332666"
  },
  "id": {
    "equalTo": "temporibus"
  }
}

// AFTER (single line, empty)
"pathParameters": {}
```

### Key Success Factors:

1. **Comprehensive initial analysis** - Search entire file for all numeric/decimal values, not just obvious ones
2. **Line number documentation** - Provide specific line numbers for all findings in analysis and during execution
3. **Scientific notation detection** - Use regex pattern `[0-9]+\.[0-9]+E[0-9]+` to find all scientific notation
4. **Nested JSON handling** - Remember that response bodies contain JSON strings with escaped quotes
5. **Always verify response status first** - only process pathParameters for status 200
6. **Use exact text matching** for replace_string_in_file operations
7. **Include surrounding context** (3-5 lines before/after) in replacements to avoid ambiguity
8. **Process one pathParameters block at a time** for accuracy and clear change tracking
9. **Leave status 400/error pathParameters untouched** - they need validation content
10. **Post-completion verification** - Search for scientific notation and improperly formatted fields to confirm completion
11. **🔑 CRITICAL: Get explicit user confirmation before any changes** - summarize scope with line numbers and examples
12. **🔑 CRITICAL: Report findings at each phase** - analysis, decimal formatting, pathParameters changes
13. **🔑 CRITICAL: Comprehensive verification sweep** - ensure no values were missed or incorrectly formatted

## Quick Reference Checklist for AI

**CRITICAL: Follow this exact workflow - do NOT deviate or add extra steps**

### Phase 1: Analysis (STOP and Report)

- [ ] Locate stub file: `<wiremock-root>/mappings/{stubname}-stubs.json`
- [ ] Search: `"response": { "status": 200,` → Count total
- [ ] Search: `"pathParameters": {` → Find all occurrences
- [ ] Identify pathParameters with content (need emptying) vs. already empty
- [ ] Search for numeric fields: `"rate"`, `"ownershipPct"`, `"amt"`, etc.
- [ ] Search for scientific notation: `[0-9]+\.[0-9]+E[0-9]+` (regex)
- [ ] **REPORT FINDINGS with line numbers and examples to user**
- [ ] **WAIT FOR USER CONFIRMATION to proceed** ← DO NOT SKIP THIS

### Phase 2: Decimal Formatting (if approved)

- [ ] Process all decimal changes as a single group (not individual changes)
- [ ] Search entire file for numeric fields requiring 2-decimal formatting
- [ ] Convert scientific notation to reasonable decimals (e.g., 8.486E307 → 84.86)
- [ ] Format integers to 2 decimals (e.g., 20 → 20.00)
- [ ] Use replace_string_in_file with 3-5 lines of context
- [ ] After completion, verify: Search for `[0-9]+\.[0-9]+E[0-9]+` → should find 0 matches

### Phase 3: PathParameters Emptying (if approved)

- [ ] Process one pathParameters block at a time
- [ ] For each block: Check response status is 200 (not 400/error)
- [ ] Show: endpoint name, current content, and result
- [ ] Replace with: `"pathParameters": {}`
- [ ] Use replace_string_in_file with 3-5 lines of context
- [ ] After all replacements, search for remaining content-filled pathParameters

### Phase 4: Verification & Completion

- [ ] Search for scientific notation: `[0-9]+\.[0-9]+E[0-9]+` → Confirm 0 matches
- [ ] Spot-check decimal fields are formatted correctly
- [ ] Confirm all intended pathParameters were emptied
- [ ] **REPORT FINAL SUMMARY** with counts and verification results
- [ ] **GET FINAL USER APPROVAL** that all changes are satisfactory

---

**KEY RULE**: Do not proceed to next phase without explicit user confirmation. Report findings, show examples with line numbers, then WAIT for YES/NO before continuing.

---

## User Confirmation Protocol

The AI MUST follow this confirmation protocol:

### Initial Analysis Confirmation:

```
"I found [X] status 200 responses and [Y] pathParameters blocks that need to be emptied.
Here's what will be changed:
- [List of decimal formatting changes]
- [List of pathParameters locations to be emptied]

Should I proceed with these changes? (Please confirm YES/NO)"
```

### Individual PathParameters Confirmation:

```
"Next pathParameters change:
LOCATION: Line ~[number] - [endpoint description]

BEFORE:
"pathParameters": {
  "policyNumber": {
    "equalTo": "[value]"
  }
}

AFTER:
"pathParameters": {}

Should I make this specific change? (YES/NO)"
```

### Final Verification:

```
"All changes completed. Summary:
- [X] pathParameters emptied for status 200 responses
- [Y] decimal values formatted
- [Z] total modifications made

Are you satisfied with these changes? (YES/NO)"
```
