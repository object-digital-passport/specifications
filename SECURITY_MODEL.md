
Threat model for security scans across the ODP repositories (`specifications`, `swift-core`, `apple-app`, `object-digital-passport.github.io`). Paths are relative to each repository. The normative protocol-level security model is [`docs/SECURITY.md`](docs/SECURITY.md); this file covers the implementations around it. Drafted from the code on 2026-11-15; edit it as the system changes.

## System overview

ODP issues and verifies "passports" for physical objects. The registry is a set of Solidity contracts on Polygon mainnet (chain 137, generation `odp-0.7-redesign-8-polygon-20260925`, `specifications/chain/generations.json`). There is **no ODP server**: clients talk to public RPCs, IPFS/upload gateways and the WalletConnect relay directly. Portable passport files (`.odpass`, ZIP + canonical JSON) are verified by hash against on-chain commitments. The normative security model is `specifications/docs/SECURITY.md` (cited below).


`object-digital-passport/odp-mcp` is empty and not covered yet.

## Components

| Component | Code | Trust boundary |
|---|---|---|
| **Contracts** | `specifications/chain/contracts/**` (ObjectDigitalPassport core + satellites: EditionUnits, AuthorAttestation, PassportConcerns, Hosting, StatementJournal, ProfileDirectory, ProofRegistry, RegistryRelations, WalletDocumentAnchor) | Public chain; any wallet can call |
| **Deploy & tooling** | `specifications/chain/deploy/**`, `specifications/chain/tools/**`, `specifications/tools/**`, `.github/workflows/**` in each repo | Operator machine / CI with deployer keys and secrets |
| **Swift core** | `swift-core/Sources/ODPCore/**` (canonical JSON, hashes, ABI/RLP, Polygon RPC, BIP-39/HD wallet, secp256k1 signing, ZIP, seal keys) | Library; parses untrusted RPC responses and passport files |
| **Apple app — Wallet** | `apple-app/Backend/Shared/Wallet/**`, `Backend/Shared/Backup/**`, `Backend/Shared/Chain/**`, `Backend/Shared/Minting/**` | Device; holds the recovery phrase and signs transactions |
| **Apple app — Sync & NFC** | `apple-app/Backend/Shared/Sync/**`, `apple-app/Backend/iOS/**` (NTAG 424 / SUN, AES) | Local network (Bonjour TCP) and NFC tags |
| **Apple app — UI & import** | `apple-app/Frontend/**`, `Backend/Shared/AppState/**`, `Backend/Shared/Import/**`, `Backend/Shared/Models/**`, `Backend/Shared/Support/**` | Deep links (`odp://`, WalletConnect redirect), incoming files, CSV import |
| **Website** | `object-digital-passport.github.io/frontend/**`, `object-digital-passport.github.io/backend/js/**` (browser-side registry client, Safe app, WalletConnect loader) | Browser; origin `object-digital-passport.github.io`, static GitHub Pages |

## Entry points and who can reach them

- **Contract external functions** — anyone with a wallet (registration is permissionless, SECURITY.md).
- **Passport files / bundles** (`.odpass`, ZIP, canonical JSON, `anchors[]`, edition proofs) — anyone can craft and send one to a verifier: website `verify*.html`, `odp-v07-reader.js`, `odp-v07-zip.js`; app `openIncomingFile`; swift-core `OdpassBundle`, `ZipArchive`, `CanonicalJSON`.
- **RPC / gateway responses** — public Polygon RPCs (`rpcFallbacks` in `odp-contract.js`, `PolygonRPC.swift`), IPFS/upload gateways, WalletConnect relay (`RelayWebSocket.swift`).
- **Deep links and QR/NFC payloads** — `odp://…` handled by `handleScannedCode`; `odpwallet://` WalletConnect redirect (`Frontend/iOS/ODPApp.swift`, `Frontend/macOS/ODPMacApp.swift`); NFC SUN messages.
- **Local network** — Bonjour `_odp-sync._tcp` listener, AES-GCM frames keyed from an 8-digit pairing code via PBKDF2 with a fixed salt (`BonjourDeviceSyncTransport.swift`).
- **CSV import** — `CSVPassportImporter.swift`.
- **On-chain strings rendered in pages** — card text, profile/directory names, statement content shown via `innerHTML` in `odp-contract.js` / `odp-passport-v03-ops.js`.

## Assets

- **Recovery phrase / private keys** in the Apple app: `WalletVault` stores the phrase in an app-container file sealed with a user password (PBKDF2-HMAC-SHA256 + AES-GCM, `BackupCrypto`); biometric unlock via Keychain `WhenUnlockedThisDeviceOnly`; iCloud backups (`OdpassCloudStore`) are the same ciphertext. Loss means permanent loss of issuer rights; theft means an attacker can mint, finalize print and revoke as the issuer — there is no recovery or rotation (SECURITY.md).
- **Verification verdict integrity** — the separate results the verifiers show (files intact, registered, issuer, revoked/withdrawn, statements). A false "matches" is the core product failure.
- **On-chain registry state** — immutability of cards/hashes, revocation windows (72h C / 24h B/P/M), print-finalization flag, edition activation one-shot slots, concern episodes.
- **NTAG 424 seal keys** (`SealKeys.swift`, `NFC424Provisioner.swift`).
- **Deployer keys / spend policy** (`chain/deploy/mainnet.env.example`, `spend-policy.mjs`) and the GitHub Pages deploy pipeline (integrity of the served JS).
- User privacy: photos (GPS metadata; `previewHash` exists to publish a stripped copy), wallet address linkage.

## Attacker profiles

1. **Forger / malicious issuer** — controls their own wallet, registers profiles and passports, crafts bundles to make a fake object look verified.
2. **Malicious content author** — crafts `.odpass`/ZIP/JSON/CSV/URLs or on-chain strings to attack a verifier (XSS in the site, zip-slip/zip-bomb, parser confusion, canonicalization mismatches between JS, Swift and Solidity).
3. **Malicious infrastructure** — dishonest RPC, IPFS gateway or WalletConnect relay feeding false state or tampering with signing requests.
4. **Local-network attacker** — sniffs or injects Bonjour sync frames.
5. **Device attacker** — stolen/unlocked device or malware reading the app container.
6. **Supply chain / CI** — compromised dependency, GitHub Actions, Pages deployment, or Sparkle update channel.
7. **Compromised issuer key** — SECURITY.md accepts that it keeps issuer rights and can finalize print early.

## Existing controls (from code and SECURITY.md)

- Contracts: direct-issuer checks, immutable fields, operation replay/conflict checks scoped to caller/contract, one-shot revocation windows, core calls no external code, satellites pinned to a core; Slither runs and negative tests in `specifications/review/**` (archives, excluded from scan).
- Clients verify fields/hashes/edition roots independently; files accepted by hash only (SPEC §22.19); generation pins via `chain/generations.json`.
- App: password-sealed vault (not Keychain), no cached plaintext, PBKDF2 for sync key, biometric gate.
- Site: static, no server; CodeQL workflow (`.github/codeql-config.yml`), branch rulesets, Dependabot.

## Out of scope / accepted risk

From `specifications/docs/SECURITY.md` (owner-written, treated as owner-written):
- The registry does not establish truth, title, authenticity, accreditation, domain control or institution identity; registration is permissionless; self-declared directory names are not verified.
- Compromised issuer keys retain rights; no admin recovery or wallet rotation; a compromised key can finalize print and close the correction window.
- Print finalization does not observe a printer; the application-side print gate is not implemented in this repository.
- `previewHash` content (size/metadata/same picture) is not checked by the core.
- Gas sponsors, upload/pinning services and gateways are replaceable conveniences; a sponsor sees the user's address and public actions.
- Safe proposals crossing a UTC month boundary block later proposals until a rejection tx (documented behaviour).
- Offline integrity checks cannot establish current revocation/activation state; RPC honesty is not proven.
- Listed as **open work** (known gaps, not accepted risk): safe ZIP handling, URL fetch/redirect/private-IP limits, client finality, identity UI.

Excluded from scans (archives and generated code): `review/**` archives, `.agents/**` guidance docs, generated `*.bundle.js`, generated `chain/types/**`, test vectors.

## Open questions

- Which attackers and assets matter most to the owner (pending).
- No infrastructure repository identified; GitHub Pages/Actions workflows in the repos are the only deployment config seen.
