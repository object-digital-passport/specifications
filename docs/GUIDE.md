> **Historical / superseded for ABI `0.7-redesign-7`.** The glossary, bundle layout, mutable status/owner model and web commands below belong to v0.6; they do not establish current website or app readiness. Current rules: [SPEC](../SPEC.md), [app handoff](../ODP_07_APP_HANDOFF.md), [glossary](GLOSSARY.md), [documentation delta](../ODP_07_ABI6_DOCUMENTATION_DELTA.md). No wallet or external-network actions are authorized by this page.

# Object Digital Passport — detailed guide (English)

*This is the long-form project overview (formerly the root `README.md`). For a short entry point, see the [root README](../README.md). Friendly explainers live on the [project Wiki](https://github.com/object-digital-passport/specifications/wiki). Normative protocol: [SPEC.md](../SPEC.md). Documentation index: [README.md](README.md).*

---

# Object Digital Passport · v0.6 Alpha

![Object Digital Passport cover](images/odp-cover-en.png)

*Reference implementation snapshot · protocol line **v0.6** (on-chain generation **6**), **deployed on Polygon mainnet** — see [Current Release](#current-release) for addresses. Release notes: [docs/V0.6.md](V0.6.md); design rationale: [docs/ru/REQUIREMENTS_FIELDS_V0.6.md](ru/REQUIREMENTS_FIELDS_V0.6.md).*

[License: MIT](../LICENSE)
[GitHub Repo stars](https://github.com/object-digital-passport/specifications/stargazers)

## What ODP is

**Object Digital Passport (ODP)** is an **open standard for object authenticity**. It can describe **almost anything** — physical items, digital works, collectibles, and more: the standard is not tied to one industry.

**It is built on a blockchain.** And no: this is not "another NFT project" or a meme coin. In plain terms, a **blockchain** is a chain of **information blocks** linked so the network can verify the chain is intact; a record that lands in a public registry **cannot be erased retroactively** as if it never existed — that is what makes later checks meaningful. The registry itself is still **not locked** to one company, subscription, or private gatekeeper for the index.

**It is built on the Object ID principle.** Since v0.6 the data model follows the identification categories museums, police, and insurers use to describe objects ([Object ID](https://icom.museum/en/resources/standards-guidelines/objectid/)): photographs, measurements, materials, inscriptions and markings, distinguishing features — plus title, author, and a short description that live **directly on-chain** as a readable card.

**Who it is for.** ODP is for **solo creators and makers** and for **organizations**: brands, galleries, museums, and expert institutions. Organizations get **proofs**, optional **parent/child affiliation**, and profile **types** in the registry (**C / B / P / M** — see [Quick Start](#quick-start-5-minutes)). Normative detail is in [SPEC.md](../SPEC.md).

## What's new in v0.6

The v0.6 line is a storage-model redesign ([full notes](V0.6.md)):

- **On-chain card.** Every passport carries `title`, `authorName`, `shortDescription`, and `domain` directly on-chain — the object is legible even without its file. The card is written once and can never be edited (a typo means revoke + re-issue), and it must match the passport file byte-for-byte.
- **One identification block: `anchors[]`.** Photos, dimensions, materials, distinguishing features, marks, seals, file hashes — all live in a single extensible array, fingerprinted on-chain (`anchorsHash`). A **hard minimum is enforced at issue time**: a physical object won't mint without a photo, dimensions, materials, and distinguishing features; a digital object won't mint without its exact file hash.
- **Append-only history.** Status, location, condition, damage, restoration are **events**: they can be added, never rewritten. The current value is simply the latest event; nothing is ever lost.
- **Seals are optional.** An NFC crypto chip or numbered seal is now an *additional* anchor on top of the mandatory identification minimum, not a requirement.

## Languages and translations


|                            |                                                        |
| -------------------------- | ------------------------------------------------------ |
| 🇬🇧 **English**           | See the [root README](../README.md) for a short entry point; this page is the detailed guide.                       |
| 🇷🇺 **Russian / Русский** | [docs/ru/GUIDE.md](ru/GUIDE.md) |


**We welcome README and UI translations in any language.** Add files under `frontend/localization/<language-code>/` **in the [website repository](https://github.com/object-digital-passport/object-digital-passport.github.io/tree/main/frontend/localization)** (see the [`ru/`](https://github.com/object-digital-passport/object-digital-passport.github.io/tree/main/frontend/localization/ru) layout). Open a **[Pull Request](https://github.com/object-digital-passport/specifications/pulls)** or an **[Issue](https://github.com/object-digital-passport/specifications/issues)** — maintainers will review. Guidelines: **[CONTRIBUTING.md](CONTRIBUTING.md)** (editing, localization, and how to propose changes). **Issues and PRs on GitHub are in English** so the whole community can participate in the same threads.

**Help us:** translate, share the **[project link](https://github.com/object-digital-passport/specifications)**, or tell communities who might care about open provenance for objects.

---

## Positioning

ODP does **not** replace human expertise, institutional provenance work, or other standards. It is meant to complement them — for example **digital product passport (DPP)** programmes, **GS1** data, **IIIF** media delivery, and **C2PA** content credentials (see [SPEC.md](../SPEC.md) §18 for narrative alignment). One design idea is a **verifiable registry**: verification can show which deployment and rules produced a record, alongside checks on file integrity.

On competing or duplicate passports, v0.6 is deliberately honest: the protocol does **not** decide which of two passports for "the same" object is real. Verifiers surface the signals — registration time, the issuer's published identity, institutional attestations, active counterfeit-concern flags — and the decision stays with people.

**Spam and abuse:** requiring writes on-chain is partly a sketch for reducing noise in a shared index, but the right balance for a stable product is still open — expect this to evolve before a stable release.

**Interfaces:** this specification does **not** normatively define visual design for apps or sites; that can be revisited with the community toward stability.

## How ODP Works

**In plain terms:** you register **who is issuing** once (a profile), then create a **passport** for each object. The chain stores the readable **card**, the **fingerprints** of your file and of the identification anchors — plus an optional **public link** to the **§15 `.odpass`** ZIP (not bare JSON at that URL) — not the whole story inside the transaction. To verify, someone opens [Verify](https://object-digital-passport.github.io/verify.html), compares the file to the registry, and **does not need a wallet**.

**Four steps in order**

1. **Profile.** You sign up as yourself or an organization and get a lasting **Profile ID** with a letter prefix (**C / B / P / M**) so the role is clear at a glance.
2. **Object passport.** You fill in the form — including the mandatory identification anchors — and confirm on-chain. The registry stores the **card**, **hashes** (`dataHash`, `anchorsHash`, image/file), an optional **public file URL**, and metadata per **[SPEC.md](../SPEC.md)** — that ties "this passport" to "this deployment".
3. **What to share.** People usually pass along the **Passport ID** (`ODP-…`) and, when needed, the `**.odpass`** file, **raw `passport.json`** offline, or a **public HTTPS URL** that serves the **§15 `.odpass`** ZIP (not bare JSON at that URL), so anyone can obtain bytes and check them against `**dataHash**`.
4. **Verification.** Anyone (or any tool) takes **your file or link**, reads **public** chain state, and checks that the content **matches** what was committed — including that the card matches byte-for-byte and the anchors match `anchorsHash`. That is read-only for the verifier — no permission to edit the registry.

**Public profile identity is mandatory.** Participants (**C / B / P / M**) **must** publish their **short Profile ID** together with the **full wallet address** (0x…). This is a **protocol requirement**, not etiquette: otherwise on-chain data looks anonymous and you **cannot tell** honest issuance from **spam** or impersonation. When the same **short ID** and **wallet** appear on your official site and other channels, a verifier can see the record was made by a **real** person or organisation — not an arbitrary address. Normative wording and examples are in **[SPEC.md](../SPEC.md)** (Public identity requirement).

**Where to publish (same principles as in the spec and on-site copy):**

- On your **official website** — prominently, not buried in navigation.
- In **public social** profiles and bios.
- On **packaging, certificates**, labels — where it makes sense.
- In any other **public channels you control** where users expect verification context.

**Both forms** (short ID and full address) must be **easy to find**. Brand or institution names are stored on-chain only inside the passport card (`authorName`) — profile trust still comes from **you** publishing your ID next to your brand. Example block for a page (as in SPEC / help markup):

```text
Creator on example.com:
  Short:  C-482-930-174-005
  Full:   0x742d35Cc…4438f44e

Museum on museum.com:
  Short:  M-204-839-112-441
  Full:   0xB3F924ee…1823A3c8A
```

**If you read JSON or code**

- The human-facing number is the **Passport ID** (`ODP-YYYY-MM-…`).
- In `**passport.json`**, the same value is field `**passportId`**.
- In low-level contract calls it may appear as `**humanId**` on older deployments — same meaning, historic name.

---

## Guide vs the protocol

This guide is mainly a **hands-on path** to **try the technology quickly** using our **[live demo pages](#live-demo)**. ODP itself is a **specification** you can **integrate however and wherever you want** — your own sites, apps, backends, or partner flows — so for integration details, **read [SPEC.md](../SPEC.md)**.

You **do not** need deep blockchain expertise to try the **[live demo pages](#live-demo)**. Checking a passport is free and does not require a wallet. Issuing a profile or passport uses common browser wallets and a small network fee on Polygon (often on the order of **~US$0.01** per typical transaction — network load varies) — details are in [Start Here](#start-here) and [Quick Start](#quick-start-5-minutes).

**What is this website?** [GitHub](https://github.com/) is where we host the **open-source** specification, web pages, and tools. You can read everything for free, copy the project, or suggest improvements — no account is required just to read.

## Table of contents

**Getting started**

- [What ODP is](#what-odp-is)
- [What's new in v0.6](#whats-new-in-v06)
- [Languages and translations](#languages-and-translations)
- [Positioning](#positioning)
- [How ODP Works](#how-odp-works)
- [Guide vs the protocol](#guide-vs-the-protocol)
- [Start Here](#start-here)
- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Live Demo](#live-demo)

**Technical reference**

- [Reference stack v0.6 (quick facts)](#reference-stack-v06-quick-facts)
- [Current Release](#current-release)
- [Terms You Need](#terms-you-need)
- [Security and Verification Model](#security-and-verification-model)
- [Costs and Network](#costs-and-network)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Author and License](#author-and-license)

## Start Here

If you are new, follow this order:

1. **Wallet.** You need a crypto wallet (browser extension or app) to write to the network. Use a **separate** wallet for experiments — not the one that holds your main savings. Save your recovery phrase and store it offline. When a site asks to "connect", pause: that is normal for these pages, but scammers use the same trick — read **your** wallet's help, e.g. [MetaMask](https://support.metamask.io/) or [Rabby](https://rabby.io/) (brand is not important). On **[Profile](https://object-digital-passport.github.io/creator.html)** and **[Passport](https://object-digital-passport.github.io/passport.html)** you can also sign from a phone via QR. You pay a small **network fee** (on Polygon that is usually **POL**); there is **no separate ODP protocol fee** — see [Costs and Network](#costs-and-network). If you **self-host** a copy of the site, you may need extra settings — see [`backend/config/odp-wc-config.js`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/backend/config/odp-wc-config.js) and [docs/V0.6.md](V0.6.md).
2. **This guide.** Read it through for a practical "how to use" picture — no code required. For gentler explanations, the [Wiki](https://github.com/object-digital-passport/specifications/wiki) covers verification, seals, and the Object ID principle in plain words.
3. **Rules in full.** The normative protocol text is [SPEC.md](../SPEC.md).
4. **Going deeper.** What is new in this line: [docs/V0.6.md](V0.6.md) and [docs/ru/REQUIREMENTS_FIELDS_V0.6.md](ru/REQUIREMENTS_FIELDS_V0.6.md). Historical notes: [docs/V0.5.md](V0.5.md), [docs/V0.4.md](V0.4.md), [docs/RELEASE_v0.4.1.md](RELEASE_v0.4.1.md). To **deploy your own** registry (for developers): [chain/deploy/README.md](../chain/deploy/README.md).

**Still early days.** ODP is in **development, testing, and gathering feedback** — rules and deployments can still change. We aim for a **stable 1.x release around January 2027** as the long-term baseline. If you need a **record meant to last many years** with minimal rule churn, **consider waiting for that stable release**. Each contract address is its **own** registry; records do **not** move between deployments by themselves. More on versioning: [docs/VERSIONING_AND_RELEASES.md](VERSIONING_AND_RELEASES.md).

## Quick Start (5 minutes)

### 1) Prepare wallet and network fees

- A browser wallet (**MetaMask**, **Rabby**, Coinbase Wallet, Brave, etc.) **or** mobile: the Profile/Passport menu uses **[WalletConnect](https://docs.reown.com/)** (QR / app link). Examples include **Tangem**, MetaMask mobile, Rainbow, and other WalletConnect-compatible wallets.
- Keep a small **POL** balance — Polygon's native token used for network fees.
- **Use a dedicated wallet for ODP** — not for long-term savings or trading (less risk if a site is malicious).

### 2) Register your profile

- Open [Profile](https://object-digital-passport.github.io/creator.html).
- Register once to receive your **profile ID** — a string starting with `**C-`**, `**B-`**, `**P-**`, or `**M-**` (you pick the type at registration; it does not change on its own later).

**What the letter means**


| Prefix                    | Typical use                     | In short                                                                                                   |
| ------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **C** (Creator)           | Individual author, craft studio | Issue under your own name                                                                                  |
| **B** (Brand)             | Brand or company                | Issue as an organization                                                                                   |
| **P** (Proof institution) | Expert / curatorial institution | Can issue **proofs** for others; supports **affiliation** with child institutions                          |
| **M** (Museum)            | Museum or collection            | Curatorial flows; with **P**, can use extended checks (including institutional concern in the current line — see [SPEC.md](../SPEC.md)) |


Full rules for limits, proofs, and affiliation: [SPEC.md](../SPEC.md).

### 3) Passport: describe the object, confirm, keep your `.odpass` file

In short: you fill in the form — **including the identification anchors** — confirm once in your wallet, and **download** the bundle. Without the file you don't get a full verification story.

1. Open [Passport](https://object-digital-passport.github.io/passport.html) and complete the fields. For a **physical object** the v0.6 line requires the identification minimum: at least one **photo**, **dimensions**, **materials**, and **distinguishing features** (the details a copy would not reproduce). A digital object requires its exact **file hash**. A seal (NFC chip / numbered) is optional on top.
2. Confirm the transaction in your wallet — that **writes the passport on-chain**: the readable card, the fingerprints, and the anchors commitment (a small network fee applies; there is no separate "ODP fee").
3. **Download** the `**.odpass`** file on the success screen and **store it somewhere safe**. The demo **does not** keep your file: if you leave without saving, you cannot fetch the same package from this site later.

**What you downloaded.** A ZIP bundle per SPEC §15, named with a `**.odpass`** extension: the main file is `**passport.json`** (that content is hashed into `**dataHash`** on-chain; its `anchors` array is additionally hashed into `**anchorsHash**`), plus `**manifest.json`** and `**originals/`** for attachments — exact layout in **[SPEC.md](../SPEC.md)**.

**Why the file matters.** The registry holds the card and **fingerprints**, not the full human-readable passport inside the transaction. To show text, images, and attachments — and to match `**dataHash`** — verifiers need the same bytes you had at issuance: your `**.odpass`** or **raw `passport.json`** offline. For **automatic fetch from the web**, the public `**dataUrl`** must serve the **§15 `.odpass`** ZIP — **not** bare JSON at that URL (see step 4 and **SPEC §9**). **Passport ID alone**, with no file, yields the on-chain card plus IDs and digests — legible, but not the full passport view.

**Public URL now or later.** In the form you can set an HTTPS `**dataUrl`** (**folder on your site**, **full file URL**, or **leave it blank**). Undecided? You can **add or change** `dataUrl` later with another transaction ("Update hosting links" on the Passport page).

### 4) Host the same file at a link (optional — helps strangers verify)

Use this when you want anyone to open [Verify](https://object-digital-passport.github.io/verify.html), enter `ODP-…`, and **automatically fetch** the passport from the web — without emailing a `.odpass` file.

- Whatever you put at `**dataUrl`** must return **the §15 `.odpass` ZIP** whose extracted `passport.json` matches `**dataHash`** — [Verify](https://object-digital-passport.github.io/verify.html) fetches that ZIP and does **not** treat a bare `.json` URL as valid hosting.
- The link must be **HTTPS** and return the **file itself**, not a login page, HTML shell, or a cloud "preview" that doesn't serve raw bytes.
- After the URL is on-chain, **do not replace** the hosted file with different content — the hash will no longer match `**dataHash`**.

### 5) Verify

- Open [Verify](https://object-digital-passport.github.io/verify.html).
- Enter a Passport ID, paste an `odp://...` link, or drop a `**.odpass`** file.
- On a v0.6 registry the verifier also compares the on-chain **card** byte-for-byte with the file and recomputes `**anchorsHash**` — any mismatch is reported as tampering, not a warning.
- What goes on a tag or a printed label is the `odp://` URI — [`SPEC.md` §12.2](../SPEC.md) is normative that no hostname is printed. An HTTPS record is a choice with a permanent consequence, not the default; see [Reading an NFC seal](#reading-an-nfc-seal). `odp://...` remains the normative URI layer in `SPEC.md` and the intended stable-v1 first-link target once resolver/app context is ready.

## Live Demo

Base URL:

- [https://object-digital-passport.github.io/](https://object-digital-passport.github.io/)

Pages:

- Verify (no wallet): [verify.html](https://object-digital-passport.github.io/verify.html)
- Profile (wallet + network fees): [creator.html](https://object-digital-passport.github.io/creator.html)
- Passport (wallet + network fees): [passport.html](https://object-digital-passport.github.io/passport.html)

*The live pages talk to the deployed **v0.6** registry (see [Current Release](#current-release)) and detect the on-chain generation automatically; the earlier v0.5 registry stays readable through `previousContracts` in Verify.*

## Reading an NFC seal

A browser cannot reach an NFC chip, so this is the one part of verification the website cannot do. It needs an app on a device with an NFC reader.

**Status: there is no public implementation yet, on any platform.** Of every anchor type in [SPEC.md](../SPEC.md) §9, `nfc` is the only one you cannot check today with something you can install. If you are deciding whether to buy NTAG 424 DNA tags for a run, weigh that before you order.

The reference implementation is in development as the **ODP app for iOS**. It scans on iPhone. No Mac has NFC hardware, so on macOS the app receives an already-verified result from the phone instead of scanning — a transfer, not a scan.

What a verifier must do is specified without reference to any of this: the EV2 challenge-response, the TagTamper conditions and the high-assurance profile are in [SPEC.md](../SPEC.md) §6, and anyone can implement them.

Groundwork that does exist in the website repository: the web-to-app handoff in [`frontend/js/odp-android-companion.js`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/frontend/js/odp-android-companion.js) and its [`docs/ANDROID.md`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/docs/ANDROID.md), plus the chip workflow in [ANDROID_NTAG424DNA_TAGTAMPER.md](ANDROID_NTAG424DNA_TAGTAMPER.md). They were written for an Android verifier that was never finished, and are kept because the handoff shape is worth reusing.

**Status: there is no public implementation yet, on any platform.** Of every anchor type in [SPEC.md](../SPEC.md) §9, `nfc` is the only one you cannot check today with something you can install. If you are deciding whether to buy NTAG 424 DNA tags for a run, weigh that before you order.

The reference implementation is in development as the **ODP app for iOS**. It scans on iPhone. No Mac has NFC hardware, so on macOS the app receives an already-verified result from the phone instead of scanning — a transfer, not a scan.

What a verifier must do is specified without reference to any of this: the EV2 challenge-response, the TagTamper conditions and the high-assurance profile are in [SPEC.md](../SPEC.md) §6, and anyone can implement them.

Groundwork that does exist in the website repository: the web-to-app handoff in [`frontend/js/odp-android-companion.js`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/frontend/js/odp-android-companion.js) and its [`docs/ANDROID.md`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/docs/ANDROID.md), plus the chip workflow in [ANDROID_NTAG424DNA_TAGTAMPER.md](ANDROID_NTAG424DNA_TAGTAMPER.md). They were written for an Android verifier that was never finished, and are kept because the handoff shape is worth reusing.

**What goes on the tag is the `odp://` URI**, and `SPEC.md` §12.2 is normative that no hostname is printed. A URL on an object is a promise about a server, fixed onto a thing that will outlive it.

The consequence is worth stating plainly: **scanning an ODP tag or QR does nothing today**. A custom URI scheme has no handler registered on any phone, and iOS routes background NFC taps only to `https` universal links and a short list of system schemes. The identifier printed as text is the layer that always works — a person reads it and types it into Verify — and the ODP app in development will make the scan work as well. An HTTPS record on the tag remains available as a deliberate choice with a permanent consequence, not as the default.

## Reference stack v0.6 (quick facts)

**This repository** (`main` branch) is the reference **v0.6** line: on-chain generation **6** when you deploy Solidity from here (`CONTRACT_VERSION` packed byte **6**), the on-chain card, the `anchors[]` identification block with a hard minimum, append-only passport events, and the split satellite architecture for relations / proofs / extension mint routing — see [docs/V0.6.md](V0.6.md) and [SPEC.md](../SPEC.md).

✅ **Deployed:** the **v0.6 line is live on Polygon mainnet** (generation **6**, addresses in [Current Release](#current-release)); the reference UI points to it. The earlier v0.5 registry is superseded but still readable in Verify. If you self-host, align **chain + contract address + ABI** with your deployment.


|                         |                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source**              | Branch `main` in this repository — reference **v0.6** stack (contracts + static web).                                                                                                                                     |
| **On-chain generation** | `CONTRACT_VERSION` = **6** (deployed public registry: **6**).                                                                                                                                                                                  |
| **New vs v0.5 line**    | On-chain card (`title` / `authorName` / `shortDescription` / `domain`), `anchors[]` + `anchorsHash` with a hard identification minimum, append-only `recordPassportEvent` history, optional seals — see [docs/V0.6.md](V0.6.md). |
| **Deploy order**        | `ODPPassportLib` → `ObjectDigitalPassport` → `ODPWalletDocumentAnchor` / `ODPCounterfeitConcern` / `ODPRegistryRelations` / `ODPPassportProofRegistry` / `ODPExtensionMintRouter` (+ wiring) — [chain/deploy/README.md](../chain/deploy/README.md). |


## Current Release

**Code snapshot:** **v0.6** — see **[docs/V0.6.md](V0.6.md)**. Historical notes: [docs/V0.5.md](V0.5.md), [docs/V0.4.md](V0.4.md), [docs/RELEASE_v0.4.1.md](RELEASE_v0.4.1.md).

**Deployed reference registry** (**Polygon mainnet**, `chainId` 137) — the **v0.6** deployment the static UI defaults point to:


| Item                                                           | Value                                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Protocol line (deployed)                                       | **v0.6** — on-chain generation **6** (`CONTRACT_VERSION` packed byte **6**) |
| Main registry `ObjectDigitalPassport`                          | [0x012aC6393464A73EC16131D701ff2e000695b91b](https://polygonscan.com/address/0x012aC6393464A73EC16131D701ff2e000695b91b)   |
| Linked library `ODPPassportLib` (verification / bytecode link) | [0xB7D7B8485eeb385c375ABd91035F5a6914171ccE](https://polygonscan.com/address/0xB7D7B8485eeb385c375ABd91035F5a6914171ccE)   |
| Wallet document anchor `ODPWalletDocumentAnchor` (satellite)   | [0x35df3773919D9F10e5F8838abaa453DE120e6Cb4](https://polygonscan.com/address/0x35df3773919D9F10e5F8838abaa453DE120e6Cb4)   |
| Counterfeit concern `ODPCounterfeitConcern` (satellite)        | [0x692935d6c1532b47cE0459bF1E9549991d0eD2C9](https://polygonscan.com/address/0x692935d6c1532b47cE0459bF1E9549991d0eD2C9)   |
| Relations satellite `ODPRegistryRelations`                     | [0x2ea6f05a050973afa14E61b1Ea19De92621e3661](https://polygonscan.com/address/0x2ea6f05a050973afa14E61b1Ea19De92621e3661)   |
| Proof registry `ODPPassportProofRegistry`                      | [0x990FCc2E587d9f2cDb9c73083E9f90793CeF7F49](https://polygonscan.com/address/0x990FCc2E587d9f2cDb9c73083E9f90793CeF7F49)   |
| Extension mint router `ODPExtensionMintRouter`                 | [0x3fa8f213399a2A9f7Da4bF7D8a9D7D42E8AEF822](https://polygonscan.com/address/0x3fa8f213399a2A9f7Da4bF7D8a9D7D42E8AEF822)   |
| Author attestation `ODPAuthorAttestation` (satellite)          | [0x1972E68D0A5B19C5ee2af54F8b792c426985F7d7](https://polygonscan.com/address/0x1972E68D0A5B19C5ee2af54F8b792c426985F7d7)   |

Deployed at `chainId` 137 on 2026-07-24 (deployer `0xefB9f9Fa39965Ab1df3D244ecAEDef23D5242587`).

**Previous line — v0.5 (superseded).** The earlier registry [`0x413aEeBB…2a4B346`](https://polygonscan.com/address/0x413aEeBB2ac437483Bc68791EaAab492C2a4B346) (generation **5**) is no longer the target of the reference UI. It stays **readable** — [Verify](https://object-digital-passport.github.io/verify.html) still resolves v0.5 passports via `previousContracts` — but is not where new passports are issued. It is **not frozen**: the **v0.5 line dropped the deployer `freeze()`** that earlier lines carried (removed to fit the EIP-170 bytecode limit when the registry surfaces were split), so this particular registry has no on-chain way to stop writes — retirement here is by convention and by the UI pointing forward. `freeze()` was present through **v0.4** (earlier registries could be, and were, frozen at their cutovers) and is **restored in v0.6**, so from v0.6 on a registry can again be frozen by its deployer.

**Release notes:** [docs/V0.6.md](V0.6.md) (narrative) · [docs/RELEASE_v0.6.md](RELEASE_v0.6.md) (addresses, bytecode, changelog-style) · historical [docs/V0.5.md](V0.5.md) / [docs/V0.4.md](V0.4.md) / [docs/RELEASE_v0.4.1.md](RELEASE_v0.4.1.md) · **Earlier line (v0.3 vs v0.2):** [ru/RELEASE_v0.3.md](ru/RELEASE_v0.3.md).

## Terms You Need (historical v0.6)

For terms of the current generation, use the [current glossary](GLOSSARY.md).


| Term            | Meaning in ODP                                                                  |
| --------------- | ------------------------------------------------------------------------------- |
| Register        | One-time profile registration (`registerCreator`)                               |
| Issue / mint    | Create a new passport record on-chain (user-facing "issue"; ABI may say *mint*) |
| Passport ID     | Human-readable object id (`ODP-...`)                                            |
| Profile ID      | Issuer identity (`C/B/P/M-...`)                                                 |
| Card            | The four readable on-chain fields: `title`, `authorName`, `shortDescription`, `domain` — immutable after issue |
| Anchors         | The `anchors[]` identification block (photos, dimensions, materials, features, marks, seals, hashes), fingerprinted on-chain as `anchorsHash` |
| Passport events | Append-only history records (status / location / condition / damage / restoration …) — added, never rewritten |
| `passport.json` | Canonical off-chain object document                                             |
| `dataUrl`       | Optional HTTPS location for the `**.odpass`** bundle                            |
| Verify          | Read-only checks (no wallet, no protocol fee)                                   |


## Security and Verification Model

For threat model and trust boundaries:

- [SECURITY.md](SECURITY.md) · Russian: [ru/SECURITY.md](ru/SECURITY.md)

Verification basics:

- On-chain hashes are the anchor for what was registered.
- `**passport.json`** (or the bytes inside `**.odpass`**) must match the stored `**dataHash`**; on v0.6 the `anchors` array must also match `**anchorsHash**`, and the card fields must match byte-for-byte.
- `**manifest.json**` inside `**.odpass**` is packaging metadata for tools, not a separate trust root.

Normative rules:

- [SPEC.md](../SPEC.md)

Deploy layout (EIP-170 split, library + satellite):

- [docs/PROTOCOL_TRACKS.md](PROTOCOL_TRACKS.md)
- [docs/EIP170_STRATEGY.md](EIP170_STRATEGY.md)

## Costs and Network

**Network**

- Polygon PoS (`chainId` 137)
- Testnet: Amoy (`chainId` 80002)

**Money**

- There is **no protocol fee** — you only pay **network fees** (often a small amount on Polygon for typical profile registration, passport issuance, and proof submission).
- Reading chain data and using **Verify** costs you nothing beyond your own internet access.

Exact fee amounts fluctuate with network load; there is no separate ODP markup.

## Roadmap

- **0.x:** expect iterative changes; gather feedback on the standard and tooling. The v0.6 line is deployed on Polygon mainnet, the Russian SPEC mirror exists, and author attestation shipped as a satellite. Work in progress is the **v0.7** line — edition passports and per-unit activation keys for production runs (`docs/EDITION_UNIT_KEYS.md`).
- **Stable target:** aim for a **stable v1-class release by January 2027**, shaped by community review (protocol text, security, UX, localization).

Pointers:

- [docs/VERSIONING_AND_RELEASES.md](VERSIONING_AND_RELEASES.md)
- [docs/V0.6.md](V0.6.md) · [docs/ru/REQUIREMENTS_FIELDS_V0.6.md](ru/REQUIREMENTS_FIELDS_V0.6.md)
- Historical: [docs/V0.5.md](V0.5.md) · [docs/V0.4.md](V0.4.md) / [docs/RELEASE_v0.4.1.md](RELEASE_v0.4.1.md) · [ru/RELEASE_v0.4.md](ru/RELEASE_v0.4.md) / [ru/RELEASE_v0.4.1.md](ru/RELEASE_v0.4.1.md) (deployed Polygon addresses are listed in [Current Release](#current-release))

## Contributing

- Guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Docs index: [docs/README.md](README.md)
- Russian: [ru/CONTRIBUTING.md](ru/CONTRIBUTING.md), [ru/CODE_OF_CONDUCT.md](ru/CODE_OF_CONDUCT.md), [ru/README-docs.md](ru/README-docs.md)

Contributions are welcome **across the whole project**: protocol and spec review, smart-contract and tooling work, UX and visual design, **editing and translation**, accessibility, and documentation. The project is built openly with AI-assisted development ("vibecoding") steered by product vision — which is exactly why experienced eyes on every layer matter. The goal is broad participation — not only code — so ODP can converge on a trustworthy, understandable standard by the **January 2027** stability milestone.

## Author and License

Author:

- Andrei Chernikov

License:

- [MIT](../LICENSE)
