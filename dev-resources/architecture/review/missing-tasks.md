# Missing Tasks from Assignment Specification

This document tracks requirements from `dev-resources/specs/doc.md` that are not yet covered in the current architecture review tasks.

## Critical Missing Requirements

### N. Implement Dark/Light Mode

**Spec Requirement:** "Implement dark/light mode"
**Status:** ❌ Not in original tasks.md
**Priority:** MEDIUM
**Dependencies:** [M]
**Rationale:** User preference feature explicitly required in spec. Includes system preference detection.

### Q. Implement MSAL Authentication

**Spec Requirement:** "Implement authentication using MSAL"
**Status:** ❌ Not in original tasks.md
**Priority:** CRITICAL
**Dependencies:** [J]
**Rationale:** Core authentication mechanism required by spec. Must integrate with Microsoft Identity Platform.

### R. Create Comprehensive Project Documentation

**Spec Requirement:** "Complete source code with proper comments"
**Status:** ❌ Not in original tasks.md
**Priority:** MEDIUM
**Dependencies:** [All tasks]
**Rationale:** Deliverable requirement. Code should be well-documented with JSDoc comments and inline explanations.

### S. Prepare Project Walkthrough Documentation

**Spec Requirement:** "Project walkthrough documentation"
**Status:** ❌ Not in original tasks.md
**Priority:** MEDIUM
**Dependencies:** [All tasks]
**Rationale:** Deliverable requirement. Should include architecture overview, setup instructions, and feature explanations.

### T. Record Short Video Demonstration

**Spec Requirement:** "Short video demonstration"
**Status:** ❌ Not in original tasks.md
**Priority:** LOW
**Dependencies:** [All tasks]
**Rationale:** Deliverable requirement. Video showcasing key features and user flows.

---

## Implementation Notes

### Zustand vs Redux

The architecture plan uses existing Redux setup instead of Zustand because:

- Redux already exists in the codebase
- Consistent with project's established patterns
- Sufficient for the complexity level of this application

This deviation is documented in the architecture plan.

---

## Action Items

1. **Add missing tasks N, Q, R, S, T to tasks.md** with proper dependencies
2. **Update roadmap.md** to include new tasks in proper phase order
3. **Ensure MSAL authentication (Task Q)** is prioritized early as it's critical
4. **Document deliverables timeline (Tasks R, S, T)** near project completion

---

## Suggested Task Order Integration

**Phase 0 - Foundations:**

- J (Repo reorg)
- Q (MSAL auth)
- N (Dark mode)

**Phase 1 - Security:**

- E, F, D, C (Existing security tasks)

**Phase 2-3 - Features:**

- H, I, G, A, B (Existing tasks)

**Phase 4 - Compliance & Deliverables:**

- K (Accessibility)
- R (Code documentation)
- S (Walkthrough docs)
- T (Video demo)
