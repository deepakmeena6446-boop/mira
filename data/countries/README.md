# Country registry

`registry.json` is MIRA's one list of countries. Nothing else in the codebase may keep its own list of countries.

It holds **identity only**:
- ISO 3166-1 alpha-2 and alpha-3 codes;
- the canonical English name and common aliases;
- the international calling code (ITU E.164);
- the classification: `un_member`, `un_observer_state` or `territory`, with `parent` for territories.

It covers all 195 sovereign states: the 193 UN member states plus the Holy See and the State of Palestine. It also lists the few territories that have an emergency profile (currently Hong Kong). The sources are listed at the top of the file.

**Emergency information never comes from this file.** It comes only from a cited profile in `data/locales/<ISO>.json`. A country in the registry with no profile is `UNVERIFIED`:
- MIRA shows no number there;
- it says "Local emergency information has not yet been verified by MIRA";
- it never substitutes 112, 911 or another country's number.

Being in the registry also says nothing about routes, lighting, Help Points or safety updates there. Those capabilities depend on their own sources and are reported separately (`CountryContext.capabilities`).

After changing the registry or any profile, regenerate the coverage report:

```
npx tsx --tsconfig tsconfig.json scripts/country-coverage.ts
```

It writes `docs/COUNTRY_COVERAGE.md`. `tests/unit/country-registry.test.ts` checks every rule above.
