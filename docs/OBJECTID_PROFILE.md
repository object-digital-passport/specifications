> **Historical / superseded for ABI `0.7-redesign-7`.** This optional draft is not an implemented ABI6 theft/status feature. Any added JSON fields must satisfy the current schema; no mutable object-event API exists in core. Current rules: [SPEC](../SPEC.md), [app handoff](../ODP_07_APP_HANDOFF.md), [glossary](GLOSSARY.md), [documentation delta](../ODP_07_ABI6_DOCUMENTATION_DELTA.md). No wallet or external-network actions are authorized by this page.

# ODP Object ID Compatibility Profile · v0.5 draft

*Optional profile. Normative core rules remain in [`SPEC.md`](../SPEC.md).*

> **This profile describes the closed v0.5 line.** It maps the Object ID categories onto a
> separate `objectId` block, which existed only in the v0.5 document shape. The v0.7 line does
> not carry that block: the same identification categories are first-class fields and anchors of
> `passport.json` itself — see [`SPEC.md` §9](../SPEC.md#9-passport-json) and
> [`schema/passport-0.7.schema.json`](../schema/passport-0.7.schema.json). The text below is kept
> as written for the line it documents.

## Purpose

This profile makes an ODP passport serve **two complementary goals** with one document:

1. **Authenticity** (ODP core): is the object in front of you the registered original?
   Answered by on-chain anchors — `dataHash`, `fileHash`, image hashes, seal verification (SPEC §10–§11) — plus institutional proofs (`submitProof`).
2. **Theft documentation and recovery** (Object ID): if the object is lost or stolen, is there a
   description good enough for police, customs, insurers, and databases such as INTERPOL's stolen-art registry?
   Answered by the Object ID checklist data captured below, cryptographically timestamped at mint.

The two goals reinforce each other: the same *distinguishing features* that let an investigator
identify a recovered painting also let an expert distinguish an original from a physical copy.
A counterfeit may carry a cloned label or a copied QR code — it will not carry the original's
repaired 3 cm tear, its stretcher inscription, or its exact craquelure pattern, and those facts
are hash-anchored on-chain with a mint timestamp that predates the dispute.

## Relationship to the Object ID standard

[Object ID](https://icom.museum/en/resources/standards-guidelines/objectid/) is an international
documentation standard for cultural goods: **nine information categories** plus four steps
(photograph → identify categories → write description → store securely). Rights are held by
**ICOM** (International Council of Museums).

> **Trademark note:** this profile is *compatible with the Object ID checklist*.
> It is **not** affiliated with, endorsed by, or certified by ICOM or the J. Paul Getty Trust.
> Implementations MUST NOT present ODP passports as official Object ID records.

## Category mapping

| Object ID category | passport.json v0.5 field | Profile requirement |
| --- | --- | --- |
| 1. Type of object | `domain`, `physical.category` | required |
| 2. Materials & techniques | `physical.medium`, `physical.materials` | required |
| 3. Measurements | `physical.dimensions` (and `physical.weight` when meaningful) | required |
| 4. Inscriptions & markings | `physical.marks` | required when present on the object |
| 5. Distinguishing features | **`objectId.distinguishingFeatures`** (new) | required |
| 6. Title | `title` | required (core) |
| 7. Subject | **`objectId.subject`** (new) | required |
| 8. Date or period | `creationDate` (+ `objectYear` when it differs from mint year) | required |
| 9. Maker | `authorship.author` | required (core) |
| Step 1: Photograph | `image` (+ on-chain `imageHash`) | **required** for physical/mixed |
| Step 3: Description | `description` | **required** |
| Step 4: Secure storage | `.odpass` retention; see Privacy below | required practice |

## New fields (`objectId` block)

```json
"objectId": {
  "subject": "Winter landscape: frozen canal, windmill at right, two skaters in foreground",
  "distinguishingFeatures": [
    "Repaired 3 cm tear lower right quadrant, visible under raking light",
    "Blue chalk inventory number 47-B on stretcher, upper bar"
  ]
}
```

- `subject` — what is depicted or represented. Free text, one string.
- `distinguishingFeatures` — array of specific, verifiable observations: damage, repairs,
  manufacturing defects, irregularities. Write each feature so a third party could check it
  on the physical object. Avoid generic statements ("good condition") — they identify nothing.

Both fields are part of the canonical document and are covered by `dataHash`:
after mint they cannot be edited without the change being detectable (SPEC §10).
Machine-readable validation of the `objectId` block lived in the v0.5 schema, which is no longer
carried in this repository; on the v0.7 line the same fields are validated directly by
[`schema/passport-0.7.schema.json`](../schema/passport-0.7.schema.json).

## Profile conformance rules

A passport conforms to this profile when:

1. The `objectId` block is present with both fields non-empty.
2. For `objectType` `physical` or `mixed`: `image`, `description`, and `creationDate` are present,
   and the on-chain `imageHash` is non-zero (photograph is not optional in Object ID).
3. All applicable category-mapping rows above are filled.
4. The issuer retains the canonical `.odpass` bundle (Object ID step 4).

## Privacy: publish-on-incident model (important)

Object ID practice is to keep documentation **confidential** until an incident, then release it
to investigators. ODP supports this natively:

- Mint with **empty `dataUrl`**: only hashes go on-chain; the `.odpass` (photos, features,
  inscriptions) stays with the owner. Nothing about the object's appearance or location is public.
- After a theft, the owner releases the `.odpass` (to police, registries, or publicly via
  `updatePassportUrls`). Anyone can then verify the released documentation against the
  **pre-incident on-chain hashes and mint timestamp** — the description provably was not
  written after the fact.
- **Do not put precise storage locations in on-chain mutable state.** `currentState.location`
  on a public chain is readable by anyone, forever. Use coarse values ("in storage", "on loan")
  or keep location off-chain entirely.

## Lost / stolen signaling (roadmap, not in v0.5 bytecode)

The v0.5 reference line has no on-chain lost/stolen flag. Interim practice and planned direction:

- **Interim:** the owner updates off-chain channels and, where an institution is involved,
  a `P`/`M` profile may record a concern via the existing `ODPCounterfeitConcern` satellite.
  Its semantics do not fully match (it asserts "possible counterfeit", not "reported stolen") —
  use the `reasonHash`-anchored document to state the actual claim.
- **Planned (v0.7 candidate):** a dedicated owner-raised `reported lost/stolen` state
  (satellite or main-registry field), surfaced prominently by verifiers at scan time, with
  an auditable raise/clear history. This turns every verifier into a passive recovery checkpoint:
  scanning a stolen object anywhere surfaces the report.

## Verifier guidance

Verifiers implementing this profile SHOULD:

- Render the nine categories as a structured "Object ID datasheet" view.
- Offer a **printable export** of that view for police / insurance / customs workflows.
- Display `distinguishingFeatures` alongside seal and hash results during physical inspection —
  they are the human-expertise complement to cryptographic checks.
- Show the lost/stolen signal (when the planned mechanism ships) before any authenticity result.
