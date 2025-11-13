---
name: Apply Implementation Review Feedback
description: Applies recommended changes from an implementation plan review to update the implementation plan.
---

# Apply Implementation Review Feedback Instructions

You are a **Senior Software Engineer**. Your task is to take the feedback from a completed implementation plan review and apply all recommended changes to update the implementation plan accordingly. Follow these guidelines:

- Reference all attached context files as your authoritative sources.
- **Read the Review Output**: Carefully review all issues, gaps, and recommendations in `dev-resources/implementation/review/output.md`.
- **Verify Understanding**: Ensure you understand each issue before making changes.
- **Apply Systematically**: Address each item in the "Actionable Feedback & Issues" section methodically.
- **Maintain Compliance**: Ensure all updates continue to comply with `.github/copilot-instructions.md` and `dev-resources/architecture/output.md`.
- **Be Thorough**: Don't skip issues marked as minor - all feedback should be addressed.
- **Document Changes**: Clearly explain what was changed and why when presenting the updated plan.

Proceed to apply the review feedback as specified below.

## CONTEXT FILES

You MUST use the attached context files as your "source of truth":

1. **`dev-resources/implementation/review/output.md`**: The completed review containing all issues, recommendations, and feedback that must be addressed.
2. **`dev-resources/implementation/output.md`**: The original implementation plan that needs to be updated based on the review feedback.
3. **`.github/copilot-instructions.md`**: The coding standards that all changes must comply with.
4. **`dev-resources/architecture/output.md`**: The approved architecture that all changes must align with.
5. **`dev-resources/implementation/review/format.md`**: Reference for understanding the review structure (optional, for context).

## YOUR TASK

You will systematically apply all feedback from the implementation plan review to create an updated implementation plan.

### Process

1. **Review Analysis**
   - Read the entire review output carefully
   - Note all items in the "Compliance Checklist" marked with ✗ or ⚠️
   - List all items in "Actionable Feedback & Issues"
   - Prioritize issues by severity (security/architecture issues first)

2. **Apply Changes**
   - Address each issue systematically, starting with highest priority
   - For each issue:
     - Locate the relevant section in the implementation plan
     - Make the recommended change
     - Verify the change doesn't introduce new issues
     - Ensure the change maintains consistency with the rest of the plan

3. **Verification**
   - After all changes are applied, verify:
     - All compliance checklist items would now be ✓
     - All actionable feedback items have been addressed
     - The plan still follows the structure from `dev-resources/implementation/prompt.md`
     - No new inconsistencies were introduced

4. **Documentation**
   - Provide a summary of all changes made
   - Reference the specific feedback items that were addressed
   - Note any decisions made where clarification was needed

### Expected Output

Your response should include:

1. **Change Summary**: A bulleted list of all changes made, organized by section, with references to the feedback item numbers that were addressed.

2. **Updated Implementation Plan**: The complete, revised implementation plan with all feedback applied. This should follow the exact structure required by `dev-resources/implementation/prompt.md`.

3. **Notes** (if applicable): Any clarifications, assumptions, or decisions made during the update process, especially for feedback items that required interpretation.

## IMPORTANT NOTES

- **Be Complete**: Address ALL issues from the review, not just the major ones
- **Stay Aligned**: Every change must maintain compliance with coding standards and architecture
- **Be Clear**: Make it obvious what changed and why
- **Preserve Quality**: Don't introduce new issues while fixing old ones
- **Ask if Unclear**: If a feedback item is ambiguous, note it and provide your best interpretation with rationale

## SUCCESS CRITERIA

The updated implementation plan should:

- ✓ Address all items from the review's "Actionable Feedback & Issues" section
- ✓ Pass all items in the "Compliance Checklist"
- ✓ Maintain the required structure and level of detail
- ✓ Be immediately actionable for implementation
- ✓ Include all necessary technical details (schemas, pseudo-code, error handling, etc.)
