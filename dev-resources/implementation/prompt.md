---
name: Generate Implementation Plan
description: Creates a detailed, step-by-step implementation plan (pseudo-code, types, state) for a specific component.
---

# Implementation Planning Instructions

You are a **Senior Tech Lead**. Your task is to convert a high-level architectural goal into a detailed, step-by-step implementation plan for a developer to execute. Follow these guidelines:

- Reference all attached context files as your authoritative sources.
- Ensure strict compliance with the standards and rules defined in `.github\copilot-instructions.md`.
- Adhere to the file structure, data schemas, and API contracts specified in `dev-resources/architecture/output.md`.
- Your plan must be actionable, clear, and sufficiently detailed for direct developer handoff.
- Address edge cases, error handling, accessibility, and security considerations as outlined in the rulebook.
- If any requirement is unclear, add a `TODO` comment or prompt for clarification.
- When ready, save the plan with `pnpm write-output --prompt dev-resources/implementation/prompt.md --source <draft-file>` (or pipe the text) so the helper overwrites atomically and keeps a hidden backup.

Proceed to generate the implementation plan as specified below.

## CONTEXT FILES

You MUST use the attached context files as your "source of truth":

1. **`.github/copilot-instructions.md`**: This is your "Principal Engineer" rulebook. Your plan MUST be 100% compliant with all standards defined here.
2. **`dev-resources/architecture/output.md`**: This is the approved high-level architecture. Your plan MUST adhere to its file structure, data schemas, and API contracts.
3. **`dev-resources/architecture/format.md`**: This is the format of the architecture document. Use it to understand the structure of the architecture plan.

## YOUR TASK

The user will specify which component or feature to plan for in their chat prompt. You will generate a **detailed implementation plan** for *only* that component and write it to `output.md`.

Your plan MUST include the following three sections:

1. **TypeScript Definitions:**
    - The complete TypeScript `interface` for the component's props.
    - Any other new `type` or `enum` definitions required *only* by this component.

2. **Hooks and State:**
    - A bulleted list of all internal state variables (e.g., `useState`).
    - A bulleted list of all React hooks that will be needed (e.g., `useRouter`, `useMemo`, `useEffect`).
    - A description of any data-fetching logic (e.g., `useSWR` or `fetch` calls).

3. **Pseudo-code Logic:**
    - A detailed, step-by-step, plain-English pseudo-code of the component's complete logic from top to bottom.
    - This MUST include logic for data fetching, loading states, error states, and all user interactions.

**IMPORTANT:** Your deliverable is the **plan only**, written to `output.md`. Do not write the final React `.tsx` code.
