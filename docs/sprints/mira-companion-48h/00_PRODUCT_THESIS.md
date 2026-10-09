# Mira companion: frozen 48-hour product thesis

Status: implementation contract. Prepared 9 October 2026 (Asia/Calcutta).
Base audited: `7ac26b3fe893962777cb70a5904b6241fbdf087c`.
Branch: `sprint/mira-companion-48h`. This package changes documentation only.

Read all six numbered documents before implementation. Scope and acceptance live in
[01](01_SPRINT_SCOPE.md) and [04](04_ACCEPTANCE_TESTS.md); execute [05](05_EXECUTION.md).
These documents supersede older product layouts for this sprint only. They do not
authorise production deployment, a rewrite, or expansion into the full vision.

## Product in plain language

Mira is a women-centred companion for understanding what matters when stepping out
and choosing a useful next action. It combines the person's circumstances and
explicit preferences with available local information. Community knowledge can
improve that information; AI can make it easier to ask for and understand.

**Promise: “Step out with confidence. Mira helps you know what matters and what to
do next.”** Confidence means informed agency, not a promise of personal safety.

The first release should help someone say “I know what I can check or do next,”
even when sources cannot answer every question. It must not imply that a quiet
screen, an empty report list, daylight, or mapped lighting establishes safety.

## Problem and first audience

Women often assemble mobility decisions across maps, messages, local knowledge,
and transport information. Practical uncertainty, unwanted attention, unfamiliar
places, accessibility, time, cost, and coordinating with others can interact.
Different women and circumstances require different answers. Do not assume every
outing is primarily about danger or that every woman wants monitoring.

Optimise the sprint for adult women preparing an ordinary outing, an early run,
an evening return, or a visit to an unfamiliar place. They may ask about nearby
context without having a destination. Named-place entry must work without GPS;
guest use must demonstrate value before sign-in. Pilot graph coverage is local;
the interface must remain honest elsewhere. Do not claim broad local intelligence
from the country registry or a configured provider key.

## Research used and decisions made

The Astra research report is available in the preceding project chat, not as a
verified research file in this checkout. Its relevant findings were reviewed:
mobility involves convenience and constraints as well as safety; generic AI local
advice competes with existing maps; repeat usefulness matters more than DAU;
community value requires accurate downstream reuse; and arrival/return details
are a promising functional hypothesis. These are research and proposals, not
validated Mira user interviews or binding requirements.

Adopt the evidence discipline, restrained interaction, and testable usefulness.
Use arrival and return as scenarios within a broader companion experience. Do
not redefine Mira as solely a journey-logistics app, require a route for nearby
questions, invent a daily habit, or undertake new field research in this build.
This sprint does not validate retention, safety impact, or a defensible category.

## The smallest meaningful product

Deliver three connected experiences using the current application:

1. **Ask or specify:** a clear Home entry for an outing or nearby context, without
   a dashboard, compulsory onboarding, or pre-emptive location request.
2. **Understand and act:** a short, evidence-bound response; progressive source
   detail; and one or two appropriate existing next actions. Planning, nearby
   context, and assistance remain distinct when their evidence differs.
3. **Return and improve:** resume the temporary plan or an eligible saved plan;
   optionally correct a relevant place or submit a private observation. Never
   imply a private report has already informed other people.

The differentiated promise is relevant synthesis plus useful actions with
transparent limits. It is not a claim that maps, messaging, or other safety apps
cannot do any of these things. Use existing providers and navigation handoffs.

## Product principles

- Agency first: offer choices and explain trade-offs; do not scold or restrict.
- Useful before exhaustive: normally at most three relevant items and two primary
  actions. Necessary error, privacy, and evidence qualifications remain visible.
- State the basis: distinguish published/listed facts, community observations,
  estimates/calculations, unknowns, and failed checks.
- Personality through care and precision: warm, brief, never possessive or
  falsely vigilant. No “I am watching over you” or “you are safe with Mira.”
- Ask permissions at the action needing them. Existing explicit location opt-in
  may be honoured, but never treat a destination as the user's current position.
- No safety paywall, forced contribution, public location feed, or score.
- Preserve accessibility, help access, consent, deletion, expiry, and existing
  working journey infrastructure while simplifying the main experience.

## Community and AI

Community is a source of situated knowledge, not decorative counts. Reuse current
place confirmations, corrections, corroboration, conflict and expiry rules.
Surface only information whose source, geographic scope, and freshness can be
represented accurately. Keep private incident reports and public/structured
observations distinct. Men and other contributors can help under the same rules;
no new social features or gender verification are needed.

AI helps interpret a request and explain supplied evidence. It does not establish
live conditions, service operation, staffing, emergency numbers, or personal
safety. Deterministic answers and forms are first-class fallbacks. Model absence
must not prevent the three experiences above when their other dependencies work.

## Deliberate exclusions

No native app, proprietary model, new emergency dispatch, universal safety score,
new social network, gamification, monetisation, new data-vendor programme, large
map infrastructure, microservices, public-report publication rollout, or production
deployment. Do not collect habitual movement history to make the sprint feel
personalised. Do not invent local news, entrance data, schedules, or testimonials.

The long-term mission remains broader. This sprint advances it by making the
existing capabilities feel like one dependable companion, with honest boundaries
and a working reason to return.
