# AI Agent Development Workflow

This document outlines the structured workflow for using AI agents to assist in the development process. The prompts for each stage of the workflow are located in the `dev-resources` directory.

> **Note:** Before you start, make sure to provide the project specifications in PDF format:

1. Convert the specs to PDF
2. Name the file `doc.pdf`
3. Place it in the `dev-resources/specs` directory.

## 1. Architecture

The architecture stage is for designing the high-level structure of the application.

### 1.1. Generate Architecture

- **Purpose:** To create a complete, high-level software architecture design.
- **Prompt:** `dev-resources/architecture/prompt.md`
- **Output:** `dev-resources/architecture/output.md`

To generate the architecture, you will use an AI agent with the `dev-resources/architecture/prompt.md` file. The agent will use the specifications in `dev-resources/specs/doc.pdf` to create the architecture plan.

> **Note:** Many prompts instruct the AI agent to persist its final deliverable with `pnpm write-output`, so the helper handles file creation and backups automatically.

### 1.2. Review Architecture

- **Purpose:** To review the generated architecture for quality, completeness, and adherence to standards.
- **Prompt:** `dev-resources/architecture/review/prompt.md`
- **Output:** `dev-resources/architecture/review/output.md`

Once the architecture is generated, it should be reviewed. Use the `dev-resources/architecture/review/prompt.md` with an AI agent to perform the review.

## 2. Implementation

The implementation stage is for creating a detailed plan for how to build a specific component or feature.

### 2.1. Generate Implementation Plan

- **Purpose:** To create a detailed, step-by-step implementation plan for a developer to execute.
- **Prompt:** `dev-resources/implementation/prompt.md`
- **Output:** `dev-resources/implementation/output.md`

Use the `dev-resources/implementation/prompt.md` with an AI agent to generate a detailed implementation plan for a specific component. The agent will use the architecture defined in `dev-resources/architecture/output.md` as a reference.

### 2.2. Review Implementation Plan

- **Purpose:** To review the implementation plan to ensure it is clear, robust, and aligned with the project's architecture and standards.
- **Prompt:** `dev-resources/implementation/review/prompt.md`
- **Output:** `dev-resources/implementation/review/output.md`

After the implementation plan is generated, it should be reviewed. Use the `dev-resources/implementation/review/prompt.md` with an AI agent to perform the review.

## 3. Bug Fixes

The bug fixing stage is for analyzing and fixing bugs in the codebase.

- **Purpose:** To analyze a bug report, identify the root cause, and generate a precise code fix.
- **Prompt:** `dev-resources/bugs/prompt.md`
- **Output:** `dev-resources/bugs/output.md`

To fix a bug, use the `dev-resources/bugs/prompt.md` with an AI agent. The agent will analyze the bug report and the relevant source code to generate a fix.

_Tip: If you already know the change set you want to review, it can be faster to inspect the file diffs directly; the output file simply keeps an auditable record._

## 4. Testing

The testing stage is for creating tests for components.

- **Purpose:** To create a comprehensive test suite for a given React component.
- **Prompt:** `dev-resources/testing/prompt.md`
- **Output:** `dev-resources/testing/output.md`

To generate tests for a component, use the `dev-resources/testing/prompt.md` with an AI agent. The agent will use the component's source code and implementation plan to create the tests.

_As with bug fixes, reviewing tests straight from the diff is acceptable when convenient, but the saved output remains the canonical artifact._
