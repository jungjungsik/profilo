# Hiring Plan

**Date:** 2026-05-21
**Author:** CEO 2

---

## Thesis

We are at zero-to-one. The single highest-leverage hire is a Founding Engineer who can own technical execution end-to-end. Every other hire waits until we have product-market signal.

---

## Hire #1: Founding Engineer

**Status:** Pending board approval (approval ID: ca9f4d8a-a590-42ec-b6f3-5b91fee720fa)

**Why this role first:**
- No product ships without engineering
- A generalist who can do frontend + backend + infra covers us for the first 12-18 months
- Hiring a specialist too early locks us into wrong architecture

**Profile:**
- 3+ years building full-stack web products
- TypeScript / Node.js / React proficient
- Comfortable with SQL, basic infra (Docker, CI/CD)
- Has shipped something real that real users used
- Communicates blockers fast; doesn't gold-plate

**What they will own:**
- All feature development in the Onboarding project
- Technical architecture decisions (with CEO input on tradeoffs)
- Test coverage on critical paths
- Performance and reliability of what they ship

**What they will NOT own (yet):**
- Hiring decisions (CEO retains this until Series A)
- Product prioritization (CEO retains this)
- Infrastructure spend without approval

---

## Roadmap: Next 90 Days

Priority order. Each item becomes an issue assigned to Founding Engineer once the hire is approved.

### Sprint 1 (Weeks 1-2): Foundation
1. Set up development environment and CI/CD pipeline
2. Implement core authentication (sign up, login, session management)
3. Basic data model for users and core entities

### Sprint 2 (Weeks 3-4): Core Product
4. Build primary user flow (onboarding to first value moment)
5. UX/UI audit remediation — implement top 3 fixes from JUN-1 findings
6. Error handling and basic observability (logging, alerting)

### Sprint 3 (Weeks 5-8): Polish and Retention
7. Performance pass (load time targets: <2s on 3G)
8. Mobile responsiveness
9. User analytics integration (event tracking)
10. Email notifications for key triggers

### Sprint 4 (Weeks 9-12): Growth Infrastructure
11. A/B testing infrastructure
12. Admin panel for internal ops
13. API documentation (if we have external integrations)

---

## Hiring Rules

1. **No second engineer until Founding Engineer is 60 days in and we have clear second-hire need.**
2. **CEO approves all hires until 10-person team.**
3. **Favor people who've shipped over people who've planned.**
4. **Reject fast on culture mismatch. Slow down on technical gaps that coaching can fix.**

---

## Next Hire (Conditional)

Will reassess at Day 60 based on:
- Product velocity: Are we hitting sprint goals?
- Technical debt: Is the codebase becoming a bottleneck?
- User growth: Do we need specialized skills (data, mobile, security)?

Likely next hire: **Product Designer** or **Second Engineer** depending on which is the binding constraint.

---

## Open Questions (Blocking Nothing Now)

- What's the company name / brand? (Needed before public-facing work)
- What is the target user? (Shapes UX/UI priority in JUN-1)
- What is the monetization model? (Shapes what we instrument and optimize)
