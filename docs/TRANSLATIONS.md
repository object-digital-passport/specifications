# Translation status

Every document in this repository has a Russian version, or a recorded reason why it
does not. The table below is that record. `tools/check-translations.mjs` reads it in CI,
so a document cannot quietly appear without someone deciding what happens to it in the
other language.

**English is normative.** Where a translation disagrees with the English text, the
translation is the bug. Every Russian file carries that note at its top.

This exists because the gap was not free. `docs/ru/GUIDE.md` told Russian readers for a
month that the live pages talked to the v0.5 registry and that v0.6 would switch over
"once deployed", while v0.6 had been live on Polygon since 24 July and the English guide
said so. Nothing reported it; it was found by accident.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `translated` | A Russian version exists and is kept in step with the English one. |
| `planned` | A Russian version was agreed and has not been written yet. |
| `none: <reason>` | Deliberately not translated. The reason is part of the record. |
| `russian only` | A Russian document with no English original. |

## What CI enforces

**Hard — these fail the build:**

1. An English document that appears in no row. Add it here and pick a status.
2. A row naming a file that does not exist.
3. A file under `docs/ru/` that no row accounts for.

**Soft — reported on every run, never fatal:**

4. Identifiers present in an English document and absent from its translation —
   contract addresses, `v0.N` version strings, field and status-code names. This is the
   check that would have caught the v0.5 incident above.
5. A translation whose last commit is older than its original's.

Soft findings are not fatal because the backlog they describe predates this file and
belongs to issue #118 and its children. Once that backlog is empty, rule 4 should be
promoted to hard.

## The table

| English document | Russian | Status |
| --- | --- | --- |
| `SPEC.md` | `docs/ru/SPEC.md` | translated |
| `README.md` | `README.ru.md` | translated |
| `CHANGELOG.md` | `docs/ru/CHANGELOG.md` | translated |
| `docs/ANDROID_NTAG424DNA_TAGTAMPER.md` | `docs/ru/ANDROID_NTAG424DNA_TAGTAMPER.md` | translated |
| `docs/ANDROID_VERIFIER_MVP.md` | `docs/ru/ANDROID_VERIFIER_MVP.md` | translated |
| `docs/CODE_OF_CONDUCT.md` | `docs/ru/CODE_OF_CONDUCT.md` | translated |
| `docs/CONTRIBUTING.md` | `docs/ru/CONTRIBUTING.md` | translated |
| `docs/EDITION_ISSUER_TOOL.md` | `docs/ru/EDITION_ISSUER_TOOL.md` | translated |
| `docs/EDITION_UNIT_KEYS.md` | `docs/ru/EDITION_UNIT_KEYS.md` | translated |
| `docs/EIP170_STRATEGY.md` | `docs/ru/EIP170_STRATEGY.md` | translated |
| `docs/GLOSSARY.md` | `docs/ru/GLOSSARY.md` | translated |
| `docs/GUIDE.md` | `docs/ru/GUIDE.md` | translated |
| `docs/ISSUER_NFC_FLOW.md` | `docs/ru/ISSUER_NFC_FLOW.md` | translated |
| `docs/OBJECTID_PROFILE.md` | `docs/ru/OBJECTID_PROFILE.md` | translated |
| `docs/ORG_NAMING_AND_SITE.md` | `docs/ru/ORG_NAMING_AND_SITE.md` | translated |
| `docs/PROTOCOL_TRACKS.md` | `docs/ru/PROTOCOL_TRACKS.md` | translated |
| `docs/README.md` | `docs/ru/README-docs.md` | translated |
| `docs/RELEASE_v0.4.1.md` | `docs/ru/RELEASE_v0.4.1.md` | translated |
| `docs/RELEASE_v0.6.md` | `docs/ru/RELEASE_v0.6.md` | translated |
| `docs/REPOSITORY_LAYOUT.md` | `docs/ru/REPOSITORY_LAYOUT.md` | translated |
| `docs/SECURITY.md` | `docs/ru/SECURITY.md` | translated |
| `docs/V0.3.md` | `docs/ru/V0.3.md` | translated |
| `docs/V0.4.md` | `docs/ru/V0.4.md` | translated |
| `docs/V0.5.md` | `docs/ru/V0.5.md` | translated |
| `docs/V0.6.md` | `docs/ru/V0.6.md` | translated |
| `docs/VERSIONING_AND_RELEASES.md` | `docs/ru/VERSIONING_AND_RELEASES.md` | translated |
| `docs/TRANSLATIONS.md` | — | none: a file list this script reads; a second copy in Russian would be one more pair to keep in step, which is the problem this file exists to solve |
| `docs/adr/*` | — | none: decision records are engineering history, and the reasoning a reader needs is in `docs/ru/EDITION_UNIT_KEYS.md` |
| `docs/releases/*` | — | none: short announcements published to GitHub Releases in English, generated against `.github/RELEASE_TEMPLATE.md` |
| `docs/archive/*` | — | none: superseded working documents, kept for history |
| — | `docs/ru/REQUIREMENTS_FIELDS_V0.6.md` | russian only |
| — | `docs/ru/IDEAS_V1.md` | russian only |
| — | `docs/ru/RELEASE_v0.3.md` | russian only |
| — | `docs/ru/RELEASE_v0.4.md` | russian only |

### Notes on the last three rows

`docs/ru/REQUIREMENTS_FIELDS_V0.6.md` was written in Russian as working material for the
v0.6 storage model and never had an English original.

`docs/ru/RELEASE_v0.3.md` and `docs/ru/RELEASE_v0.4.md` describe what changed between
reference lines, at a level of detail no English file in this repository matches —
`docs/V0.3.md` and `docs/V0.4.md` are pointer stubs, and `docs/releases/v0.3.md` and
`docs/releases/v0.4.md` are short public announcements. Whether they should be paired with
something, retitled, or given English counterparts is part of issue #118.

## Running it yourself

```bash
node tools/check-translations.mjs
```

Add `--all` to list every soft finding instead of the first few per file.

## Redesigned generation review

| English | Russian | Status |
| --- | --- | --- |
| `ODP_07_CONTRACT_REVIEW.md` | — | none: historical Russian audit input |
| `ODP_07_RELEASE_DECISIONS.md` | — | none: historical Russian audit input |
| `ODP_ASTRA_AUDIT_BRIEF.md` | — | none: historical Russian audit input |
| `ODP_CONCERNS_SATELLITE.md` | — | none: historical Russian audit input |
| `ODP_REGISTRY_REDESIGN.md` | — | none: historical Russian audit input |
| `ODP_ASTRA_REVIEW.md` | — | none: independent review authored in Russian |
| `ODP_07_IMPLEMENTATION.md` | — | none: implementation report authored in Russian |

The current `docs/ru/SPEC.md` is a migration pointer. Its full old translation is archived;
full translation of the rewritten normative SPEC is pending. Historical guides do not define the redesigned ABI.

| `ODP_07_ACTION_PLAN.md` | — | russian only |
| `ODP_07_APP_HANDOFF.md` | — | russian only |
| `ODP_07_ARCHITECTURE_OPTIONS.md` | — | russian only |
| `ODP_07_ARCHITECTURE_REVIEW.md` | — | russian only |
| `ODP_V1_ACTION_PLAN.md` | — | russian only |

| `ODP_07_INDEPENDENT_AUDIT_TASK.md` | — | russian only |
| `ODP_07_CONSOLIDATED_REMEDIATION_PLAN.md` | — | russian only |
| `ODP_07_ABI6_DOCUMENTATION_DELTA.md` | — | russian only |

The delta report is written in Russian with an English summary at the top, like the other documents in
this block. It records what changed after the sealed `0.7-redesign-6` audit package; the normative English
text remains `SPEC.md`.
