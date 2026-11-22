<h1 align="center">Object Digital Passport</h1>

<p align="center">
  <b>An open standard for verifiable records about physical and digital objects.</b><br>
  Register a description of an artwork, edition or archive item. Anyone can check which profile registered it and whether the files match the public record.
</p>

<p align="center">
  <a href="https://object-digital-passport.github.io/verify-07.html"><b>Verify a passport</b></a> ·
  <a href="https://object-digital-passport.github.io/">Website</a> ·
  <a href="https://object-digital-passport.github.io/specifications/spec/">Specification</a> ·
  <a href="https://github.com/object-digital-passport/specifications/discussions">Discussions</a> ·
  <a href="https://github.com/orgs/object-digital-passport/projects/3">Roadmap</a>
</p>

## Current status

[**v0.7**](https://github.com/object-digital-passport/specifications/releases/tag/v0.7) is the current protocol on Polygon. The reference website supports [profile registration](https://object-digital-passport.github.io/profile-07.html), [passport issuance](https://object-digital-passport.github.io/issue-07.html) and [verification](https://object-digital-passport.github.io/verify-07.html) for v0.7. Earlier passports can be checked through the [legacy verifier](https://object-digital-passport.github.io/verify.html).

[v0.7.1](https://github.com/object-digital-passport/specifications/releases/tag/v0.7.1) is a pre-release with documentation and tooling updates for the same registry. [v0.8](https://github.com/object-digital-passport/specifications/releases/tag/v0.8) is a proposal for public feedback. The v0.7 registry implementation is alpha and has yet to undergo an independent security audit.

A digital passport records who registered a description and lets readers check whether the files match it. The issuer's real-world identity and the object's authenticity require separate evidence. Verification needs no wallet or account. Registration uses a wallet and costs Polygon network fees.

## Repositories

| Repository | What it contains |
|:--|:--|
| [specifications](https://github.com/object-digital-passport/specifications) | The standard, registry contracts, schemas, test vectors and offline tools. |
| [object-digital-passport.github.io](https://github.com/object-digital-passport/object-digital-passport.github.io) | The reference web application for profiles, issuance and verification. |
| [swift-core](https://github.com/object-digital-passport/swift-core) | An early Swift package for canonicalization, hashing, registry reads and wallet cryptography. |
| [odp-profile-directory](https://github.com/object-digital-passport/odp-profile-directory) | Directory format and verification tools. Includes synthetic v0.6 examples and an initial v0.7 listing backed by evidence on the profile owner's domain. That evidence confirms the domain claim. Organization identity is a separate check. |
| [odp-directory-v0.6](https://github.com/object-digital-passport/odp-directory-v0.6) | Independently curated profile directory for v0.6. |
| [design-kit](https://github.com/object-digital-passport/design-kit) | Public design work and issues for physical labels and Tangem card skins. |
| [.github](https://github.com/object-digital-passport/.github) | The organization profile shown on this page. |

Private projects include an Apple client in development, the retired Android NFC companion, a reference gas sponsorship service and a planned MCP integration.

## Documentation and contributions

- [Specification source](https://github.com/object-digital-passport/specifications/blob/main/SPEC.md) · [Schemas and vectors](https://github.com/object-digital-passport/specifications/tree/main/schema) · [Security model](https://github.com/object-digital-passport/specifications/blob/main/docs/SECURITY.md)
- [Deployment addresses and verification evidence](https://github.com/object-digital-passport/specifications/blob/main/chain/generations.json) · [Contract ABIs](https://github.com/object-digital-passport/specifications/tree/main/chain/abi)
- [Product roadmap](https://github.com/orgs/object-digital-passport/projects/3) · [Open roadmap issue](https://github.com/object-digital-passport/specifications/issues/181) · [Contributing](https://github.com/object-digital-passport/specifications/blob/main/docs/CONTRIBUTING.md)
