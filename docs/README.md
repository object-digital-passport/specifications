# Current ODP 0.7 documentation — ABI 0.7-redesign-8

[English SPEC](../SPEC.md) is normative. Start with [the post-audit-package delta and open decisions](../ODP_07_ABI6_DOCUMENTATION_DELTA.md) (Russian), [current action plan](../ODP_07_ACTION_PLAN.md), [app handoff](../ODP_07_APP_HANDOFF.md), [security](SECURITY.md), [glossary](GLOSSARY.md), [tools](../chain/tools/README.md) and [deployment](../chain/deploy/README.md). [Russian index](ru/README-docs.md).

The [sealed audit package](../review/audit-handoff-abi6/README.md) describes the earlier ABI `0.7-redesign-6` and does not certify the current sources; its hashes and reports are unchanged. The approved `0.7-redesign-7` release bundle (`review/v07-abi7-release/`) is also a past snapshot; `0.7-redesign-8` adds the immutable `previewHash` (SPEC §8, §9, §22.19). Architecture reviews, release decisions, ADRs, old audit/task briefs, v0.6 guides and legacy edition designs below are historical inputs, not instructions for this generation. In particular, profile stop, mint-agent, unit-passport hooks, governance/freeze, a single 72-hour revocation window and mandatory Amoy no longer describe this implementation. Old diagrams and error tables apply only to their named historical line.

The current bundle has `passport.json`, `generation.json`, `receipt.json`, `manifest.json`, and payloads at `files/<sha256hex>`, including the lighter public photo copy when one exists. Reference tools validate extracted entries, not ZIP transport or authenticated chain state. The contracts are deployed on Polygon mainnet on 2026-09-25 (registry `0x3281492981DCD492cc2F7c17398134e1D3B5CA1F`, all addresses in SPEC §7); app readiness and physical issuance are separate open gates. Amoy is not used.

## Historical catalogue and general repository guidance


# Documentation index

*Author: Andrei Chernikov*

*Friendly explainers (Quick Start, verification, NFC seals, Object ID, FAQ — 🇬🇧/🇷🇺) live on the [project Wiki](https://github.com/object-digital-passport/specifications/wiki).*

## Start here

| Document | Purpose |
|----------|---------|
| **[`TRANSLATIONS.md`](TRANSLATIONS.md)** | Which documents have a Russian version, which are planned, and which deliberately do not. Enforced by `tools/check-translations.mjs` in CI. |
| **[`REPOSITORY_LAYOUT.md`](REPOSITORY_LAYOUT.md)** | Where `SPEC.md`, `schema/`, `chain/`, `docs/` and `tools/` live, and what moved out. RU: [`ru/REPOSITORY_LAYOUT.md`](ru/REPOSITORY_LAYOUT.md). |
| **[`ORG_NAMING_AND_SITE.md`](ORG_NAMING_AND_SITE.md)** | Repository names in the c2pa-org style, and how to shorten the published site address. Mostly applied on 2026-08-22/23 — the outcome section records what it cost and where the reasoning was wrong. RU: [`ru/ORG_NAMING_AND_SITE.md`](ru/ORG_NAMING_AND_SITE.md). |
| **[`releases/`](releases/)** | **Start here for “what changed and does it affect me”** — one short, jargon-free note per version. Written to [`.github/RELEASE_TEMPLATE.md`](../.github/RELEASE_TEMPLATE.md). |
| **[`GUIDE.md`](GUIDE.md)** | Historical v0.6 overview and glossary; use [`GLOSSARY.md`](GLOSSARY.md) for the current generation. |
| **[`SPEC.md`](../SPEC.md)** (root) | **Normative** protocol: `passport.json`, on-chain fields, verification, **§15 `.odpass`**. |
| **[`V0.6.md`](V0.6.md)** | Historical v0.6 line (on-chain generation **6**, deployed on Polygon mainnet): on-chain card, `anchors[]`, append-only events. RU: [`ru/V0.6.md`](ru/V0.6.md). |
| **[`RELEASE_v0.6.md`](RELEASE_v0.6.md)** | v0.6 release notes: deployed addresses, EIP-170 numbers, `ODPAuthorAttestation`, JSON Schema and docs updates. RU: [`ru/RELEASE_v0.6.md`](ru/RELEASE_v0.6.md). |
| **[`REQUIREMENTS_FIELDS_V0.6.md`](ru/REQUIREMENTS_FIELDS_V0.6.md)** | v0.6 storage-model design rationale and field tables (in Russian). |
| **[`chain/deploy/README.md`](../chain/deploy/README.md)** | Pinned-release deployment, manifest/resume, Polygon mainnet authorization boundary. |
| **[`VERSIONING_AND_RELEASES.md`](VERSIONING_AND_RELEASES.md)** | Git tags, `main`, hotfix vs feature branches. RU: [`ru/VERSIONING_AND_RELEASES.md`](ru/VERSIONING_AND_RELEASES.md). |
| **[`ISSUER_NFC_FLOW.md`](ISSUER_NFC_FLOW.md)** | Required mint order for a physical passport with an NTAG 424 seal: scan the chip before minting, publish a non-master key. RU: [`ru/ISSUER_NFC_FLOW.md`](ru/ISSUER_NFC_FLOW.md). |
| **[`GLOSSARY.md`](GLOSSARY.md)** | Terms of the current generation, and the list of terms that no longer apply. RU: [`ru/GLOSSARY.md`](ru/GLOSSARY.md). |
| **[`SECURITY.md`](SECURITY.md)** | Threat model & trust boundaries. RU: [`ru/SECURITY.md`](ru/SECURITY.md). |
| **[`ANDROID.md`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/docs/ANDROID.md)** | Web handoff + trust boundaries for an NFC verifier app. No such app is published yet — see [GUIDE.md](GUIDE.md#reading-an-nfc-seal). |
| **[`ANDROID_NTAG424DNA_TAGTAMPER.md`](ANDROID_NTAG424DNA_TAGTAMPER.md)** | Practical NTAG424 TagTamper workflow (ODP web + carrier + companion). |
| **[`PROTOCOL_TRACKS.md`](PROTOCOL_TRACKS.md)** | Current implemented/deferred boundaries; legacy track decisions superseded. RU: [`ru/PROTOCOL_TRACKS.md`](ru/PROTOCOL_TRACKS.md). |
| **[`EIP170_STRATEGY.md`](EIP170_STRATEGY.md)** | Bytecode size limit options before mainnet deploy. RU: [`ru/EIP170_STRATEGY.md`](ru/EIP170_STRATEGY.md). |

## Historical / planning

| Document | Purpose |
|----------|---------|
| [`V0.5.md`](V0.5.md) | Historical v0.5 line (on-chain generation **5**) — deployed to Polygon mainnet, never tagged, superseded by v0.6. See [`releases/v0.5.md`](releases/v0.5.md). RU: [`ru/V0.5.md`](ru/V0.5.md). |
| [`V0.3.md`](V0.3.md) | v0.3 vs v0.2. RU: [`ru/V0.3.md`](ru/V0.3.md); RU release note: [`ru/RELEASE_v0.3.md`](ru/RELEASE_v0.3.md). |
| [`V0.4.md`](V0.4.md) | Historical v0.4 line notes. RU: [`ru/V0.4.md`](ru/V0.4.md). |
| [`RELEASE_v0.4.1.md`](RELEASE_v0.4.1.md) | v0.4.1 patch notes. RU: [`ru/RELEASE_v0.4.1.md`](ru/RELEASE_v0.4.1.md). |
| [`archive/DOCS_REVIEW_PLAN_v0.5.md`](archive/DOCS_REVIEW_PLAN_v0.5.md) | Completed planning note (README/SPEC/docs pass). |
| [`ANDROID_VERIFIER_MVP.md`](ANDROID_VERIFIER_MVP.md) | Short MVP scope; [`ANDROID_COMPANION_APP.md`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/docs/ANDROID_COMPANION_APP.md) redirects to companion repo. RU: [`ru/ANDROID_VERIFIER_MVP.md`](ru/ANDROID_VERIFIER_MVP.md). |
| [`EDITION_ISSUER_TOOL.md`](EDITION_ISSUER_TOOL.md) | **Historical handoff, superseded** for the issuer-side edition tool: algorithms, byte-level encodings, outputs, ceremony, contract call, and the known-answer vectors to check against. RU: [`ru/EDITION_ISSUER_TOOL.md`](ru/EDITION_ISSUER_TOOL.md). |
| [`EDITION_UNIT_KEYS.md`](EDITION_UNIT_KEYS.md) | **v0.7 draft** — edition passports + per-unit activation keys for mass-produced series (B profile). RU: [`ru/EDITION_UNIT_KEYS.md`](ru/EDITION_UNIT_KEYS.md). |
| [`ru/IDEAS_V1.md`](ru/IDEAS_V1.md) | Informal v1 directions (not spec). Written in Russian; no English version. |
| [`OBJECTID_PROFILE.md`](OBJECTID_PROFILE.md) | Optional profile mapping the nine Object ID categories onto `passport.json`, plus the publish-on-incident privacy model. RU: [`ru/OBJECTID_PROFILE.md`](ru/OBJECTID_PROFILE.md). |
| [`community/discussion-passport-ui-v0.4-EN.md`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/docs/community/discussion-passport-ui-v0.4-EN.md) | Draft GitHub Discussion (EN). |

## `.odpass` bundle (current pointer)

- [SPEC §15](../SPEC.md#15-odpass-bundle), [bundle format](../schema/bundle-0.7/README.md): four root JSON files and `files/` payloads.
- [Reference tools](../chain/tools/README.md): `bundle.mjs` checks extracted entries and the edition list/tree. `mint.py` is retired and fails deliberately.
- Hosting is optional transport for unchanged bytes. Safe ZIP, remote-fetch policy and app integration require separate implementation/acceptance.

---

*Short entry: root [`README.md`](../README.md). Russian index: [`ru/README-docs.md`](ru/README-docs.md).*
