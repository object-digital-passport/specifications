# Repository layout

This repository is **the protocol**: the specification, the contracts that implement it, and
the schema and vectors that make it checkable. The reference website is a separate repository.

| Path | Role |
|------|------|
| [`SPEC.md`](../SPEC.md) | **Normative** protocol, English, at the repository root |
| [`schema/`](../schema/) | JSON Schema, conformance examples, and known-answer vectors |
| [`chain/`](../chain/) | Solidity, Hardhat tests, deploy scripts and offline `chain/tools/*.mjs`; `mint.py` is retired |
| [`docs/`](README.md) | Design notes, decision records, security model, release notes |
| [`docs/ru/`](ru/) | Russian translations — informational; `SPEC.md` is the normative text |
| [`tools/`](../tools/) | Renders the specification into the published `/spec/` pages |

## Elsewhere

| | |
|---|---|
| **Reference website** | [object-digital-passport.github.io](https://github.com/object-digital-passport/object-digital-passport.github.io) — the pages at <https://object-digital-passport.github.io/>, and everything that runs in a browser |
| **ODP app for iOS** | `apple-app` — separate client integration; current build/readiness was not checked in this documentation task. NFC is deferred for ODP 0.7 |
| **Android verifier** | `android-verifier` — an NFC verifier that was started and not finished. Private, and not the reference implementation of anything |

The split is deliberate. A standard that ships inside one implementation reads as that
implementation's documentation, and the two ended up entangled enough that the website's
deployment was what published the specification. They are separable now, and nothing here
reaches into the site.

## Commands

```bash
cd chain && npm install && npm run compile && npm test   # contracts
node tools/build-spec.mjs _site/spec                     # render the specification
node chain/tools/lint_release_notes.mjs                  # release note style
```
