<p align="center">
  <img src="docs/readme/odp_cover_en.png" alt="Object Digital Passport" width="720">
</p>

<h1 align="center">Object Digital Passport</h1>

<p align="center"><b>A free, open digital passport for real things — art, limited editions, archives — that anyone can verify. Forever.</b></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License"></a>
  <a href="SPEC.md"><img src="https://img.shields.io/badge/spec-v0.7%20alpha-orange.svg" alt="Spec v0.7 alpha"></a>
  <a href="https://github.com/object-digital-passport/specifications/actions/workflows/ci.yml"><img src="https://github.com/object-digital-passport/specifications/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://object-digital-passport.github.io/"><img src="https://img.shields.io/badge/live-demo-2ea44f.svg" alt="Live demo"></a>
  <a href="https://github.com/object-digital-passport/specifications/wiki"><img src="https://img.shields.io/badge/docs-wiki-blue.svg" alt="Wiki"></a>
  <a href="https://github.com/object-digital-passport/specifications/discussions"><img src="https://img.shields.io/github/discussions/object-digital-passport/object-digital-passport?color=blueviolet" alt="Discussions"></a>
</p>

<p align="center">
  🇬🇧 English · 🇷🇺 <a href="README.ru.md">Русский</a> — want another language? <a href="https://github.com/object-digital-passport/specifications/discussions">Tell us in Discussions</a>
</p>

---

## What is this?

**Object Digital Passport (ODP)** gives a physical or digital object a passport that proves three things:

1. **When** it was registered — a blockchain timestamp nobody can backdate;
2. **Who** registered it — a public profile ID you can cross-check on the issuer's own website;
3. **That its description hasn't changed since** — cryptographic fingerprints of every photo, measurement, and distinguishing feature.

No company in the middle. No subscription. Verifying is **always free** and will still work in 50, 100, or 250 years — because the registry lives on a public blockchain (Polygon), not on anyone's server. **What that promise is:** a registry, once deployed, keeps answering for as long as the chain does. **What it is not:** a promise that one address serves every generation — each `v0.x` line is a separate registry and passports do not migrate between them, so a passport verifies forever against *its own* line (SPEC.md §7). Registering costs only the network fee (~$0.01–0.03). The protocol itself charges **nothing, ever**. MIT-licensed, end to end.

**The goal: make faking an object's history as hard as possible — for pennies.**

> 🟢 **v0.7 is live on Polygon mainnet since 25 September 2026** — [release note](docs/releases/v0.7.md), [addresses](docs/GUIDE.md#current-release), source code of all ten contracts [verified on Polygonscan](https://polygonscan.com/address/0x3281492981DCD492cc2F7c17398134e1D3B5CA1F#code). The check page and the demo below still read the previous registry (v0.6) until they are moved.

> ⚠️ **Alpha status:** the contract may still change between 0.x versions, which can affect early passports and accounts. For long-term use, wait for the stable release — target: **January 2027**.

---

> ## 🙋 We're looking for people — yes, you
>
> Here's the honest part. I'm **Andrei Chernikov** — a contemporary artist, entrepreneur, and family-history archivist. I build this project **completely alone and without a programming background: it's all vibecoding**, AI-assisted coding steered by product vision rather than an engineering degree.
>
> That's exactly why the project needs **real people**: developers to review and harden what exists, testers to break it, designers, translators, artists and collectors to try it on real objects — and skeptics to tell us where we're wrong.
>
> You don't need to be a blockchain expert. If this page made you curious, there is a task for you: start in [**Discussions → "We need your help!"**](https://github.com/object-digital-passport/specifications/discussions), or just open an issue.
>
> **Object Digital Passport is for people and by people.** With a real community around it, we can make the world just a little bit harder to counterfeit.

---

## Try it in 2 minutes

- **Verify an object** — open the [**Verify page**](https://object-digital-passport.github.io/verify.html), enter a Passport ID or drop an `.odpass` file. No wallet, no cost.
- **Create your first passport** — the [**Quick Start**](https://github.com/object-digital-passport/specifications/wiki/Quick-Start) walks you through it (a throwaway wallet and a few cents of POL is all it takes).
- **Just look around** — the [**live demo**](https://object-digital-passport.github.io/) runs the full UI in your browser.

> The check page, the Quick Start and the demo still work on the previous registry (v0.6) and the older ones. Moving them to v0.7 is the next step.

---

## How it works — in plain words

When you register, you get a **public profile ID** (like `C-482-930-174-005`). You publish it, together with your wallet address, on your own website or social profile — that's how people know the ID is really you. This is not a suggestion; the whole trust model depends on it, so v0.7 requires it of every issuer.

When you passport an object, you describe it the way museums and police describe objects for identification (the [Object ID](https://icom.museum/en/resources/standards-guidelines/objectid/) principle): photos, dimensions, materials, and the **distinguishing features** a forger can't easily copy — that repaired tear, that chalk mark on the stretcher. In v0.7:

- a small readable **card** (title, author, short description) lives directly on-chain and never changes — the object is legible even without its file;
- all identification facts live in one **`anchors[]`** block, fingerprinted on-chain — and a passport *won't register at all* without the hard minimum (photo + dimensions + materials + distinguishing features);
- the passport is a **registration fact, not a diary**: the registry records who registered what, and when. Corrections, expert opinions and concerns are separate signed statements next to it — added, never rewritten;
- a mistake can be **withdrawn only for a short time** — 72 hours for individuals, 24 for brands, experts and museums — and the issuer closes that window for good before a label goes to print;
- you can publish a **lighter copy of the main photo** (no location data) so anyone can see it and check it against the registry, while the full-size original stays in your file;
- a brand can cover a **whole production run** with one registration, each item carrying its own key under a scratch layer.

The full description travels in a portable **`.odpass`** file that you keep and share; the blockchain stores its fingerprints. Change one comma — the fingerprint stops matching, and every verifier sees it.

ODP shows **separate results**, never a single stamp of "genuine": files intact, registered in the registry, who the issuer is (compare their profile ID with what they publish themselves), whether it was withdrawn, statements from experts. A real label can be moved onto a fake object, so ODP always asks you to compare the object with its photo and description. ODP is a tool in human hands, not a magic wand: it makes forgery expensive and detectable, and it gives experts, buyers, and institutions the same tamper-proof facts to reason from.

### What a check actually does

```mermaid
flowchart LR
    ID["Passport ID<br/>(QR or typed)"] --> CHAIN["Read the registry<br/>card · hashes · status"]
    CHAIN -->|not found| NOT(["Not an ODP passport"])
    CHAIN --> FILES["Open the .odpass file<br/>or fetch the files"]
    FILES -->|unavailable| LIM(["Registration is shown<br/>files are not checked"])
    FILES --> HASH["Recompute SHA-256<br/>document · anchors · photos"]
    HASH --> RES(["Separate results<br/>files intact · registered · issuer<br/>withdrawn? · statements"])
```

Every step is read-only and free: no wallet, no account, no permission from us. Full algorithm: [`SPEC.md` §11](SPEC.md); what apps must show: [§22.16](SPEC.md).

---

## Under the hood

The registry has nobody in charge: no administrator, no off switch, no owner. The core only records registrations. Everything optional lives in nine **satellites** — separate contracts that read the core and can never write to it.

```mermaid
flowchart TB
    subgraph core["Core — the passports themselves"]
        REG["ObjectDigitalPassport<br/><i>card · hashes · withdrawal window</i>"]
    end
    subgraph sat["Satellites — read the core, cannot change it"]
        ED["ODPEditionUnits<br/><i>production runs, activation</i>"]
        PROOF["ODPPassportProofRegistry<br/><i>expert and museum statements</i>"]
        JOUR["ODPStatementJournal<br/><i>corrections, declarations</i>"]
        CON["ODPPassportConcerns<br/><i>concerns raised by institutions</i>"]
        AUTH["ODPAuthorAttestation<br/><i>author key signature</i>"]
        REL["ODPRegistryRelations<br/><i>affiliation</i>"]
        HOST["ODPHosting<br/><i>where the files live</i>"]
        DIR["ODPProfileDirectory<br/><i>declared domain</i>"]
        DOC["ODPWalletDocumentAnchor<br/><i>file hash anchoring</i>"]
    end
    ISSUER(["Creator · Brand · Institution"]) -->|register, issue| REG
    ISSUER -->|statements| sat
    sat -.->|read| REG
    VERIFIER(["Anyone verifying"]) -->|read-only| REG
    VERIFIER -->|read-only| sat
```

Registry on Polygon mainnet: [`0x3281492981DCD492cc2F7c17398134e1D3B5CA1F`](https://polygonscan.com/address/0x3281492981DCD492cc2F7c17398134e1D3B5CA1F). All ten addresses: [`docs/GUIDE.md` → Current Release](docs/GUIDE.md#current-release).

---

## Run it locally

The contracts and the reference tools:

```bash
cd chain && npm ci && npx hardhat clean && npm run check
```

This compiles with Solidity 0.8.20, enforces the contract size limit, checks the conformance vectors and runs the local tests. The reference website is a separate repository: [object-digital-passport.github.io](https://github.com/object-digital-passport/object-digital-passport.github.io).

---

## Who is it for?

| Prefix | Account type | Who |
|---|---|---|
| **C** | Creator | Individual artists, photographers, makers — one-of-a-kind objects |
| **B** | Brand | Studios and brands releasing products — the only type that can issue a whole production run |
| **P** | Proof institution | Galleries, auction houses, expert bodies that publish statements about objects |
| **M** | Museum | Museums and large collections, incl. works by deceased artists |

The type is self-declared, not accredited — anyone can pick any of them. So look for who stands behind a profile ID on the issuer's own channels: a "museum" account passporting a living artist's new work is your first red flag 🚩

---

## FAQ

**Why should I bother?**
To protect your works from counterfeits — and to build an "indestructible" catalogue of what you've made, with proof of when.

**Do I need to understand crypto?**
Only the basics: install your own wallet (ODP apps never create or hold one for you), keep its recovery phrase safe — nobody, including us, can restore it — and top it up with a little POL for network fees. Use a dedicated wallet for ODP, not the one with your savings. Checking a passport needs no wallet at all.

**What if the project's website disappears?**
Your passports survive. The registry is on a public blockchain and the code is MIT — anyone can host a verifier. That independence is the whole point.

**Can I edit a passport later?**
The card — never. That's what makes it trustworthy. A mistake can be withdrawn within 72 hours (individuals) or 24 hours (organizations), unless the issuer already marked the passport for print. After that, a correction is a new passport or a signed statement next to the old one. Nothing is rewritten.

**What does it cost?**
A small network fee in POL for each registration or passport, set by the Polygon network, not by us. Verification is free. The standard itself takes no commission — by design, forever.

**Where's the technical meat?**
Start at the [**Wiki**](https://github.com/object-digital-passport/specifications/wiki) for friendly explanations, then go normative: [`SPEC.md`](SPEC.md).

---

## 📚 Learn more

| Where | What |
|---|---|
| [**Wiki**](https://github.com/object-digital-passport/specifications/wiki) | Friendly guides: Quick Start, how verification works, NFC seals, Object ID, FAQ — 🇬🇧/🇷🇺 |
| [`SPEC.md`](SPEC.md) | The full protocol specification (normative, English) |
| [`docs/GUIDE.md`](docs/GUIDE.md) | The detailed long-form guide |
| [`docs/releases/v0.7.md`](docs/releases/v0.7.md) | What's new in v0.7 — the release note |
| [`CHANGELOG.md`](CHANGELOG.md) | Notable changes across protocol lines |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model and security recommendations |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | How to contribute |
| [Live demo →](https://object-digital-passport.github.io/) | Try everything online (still on the v0.6 registry) |

**Repository layout:** [`SPEC.md`](SPEC.md) — the standard · [`chain/`](chain/) — contracts & tests · [`schema/`](schema/) — JSON Schema & vectors · [`docs/`](docs/) — documentation · [`review/`](review/) — audit evidence and the approved release bundle. The reference website is a separate repository: [object-digital-passport.github.io](https://github.com/object-digital-passport/object-digital-passport.github.io).

---

<p align="center">
  <b>💬 <a href="https://github.com/object-digital-passport/specifications/discussions">Join the Discussion</a></b> — head to <b>"We need your help!"</b> and we'll find the task where you can contribute most.<br><br>
  Thanks for reading this far. If you want to help — or know someone who might — <b>we're waiting for you!</b>
</p>
