> **Historical / superseded for ABI `0.7-redesign-8`.** NFC hardware/transport is deferred for this release; this legacy guide does not establish implemented or physically verified support. Current rules: [SPEC](../SPEC.md), [app handoff](../ODP_07_APP_HANDOFF.md), [glossary](GLOSSARY.md), [documentation delta](../ODP_07_ABI6_DOCUMENTATION_DELTA.md). No wallet or external-network actions are authorized by this page.

# Android verifier MVP (scope)

Minimum useful dedicated verifier for **ODP + NTAG 424 DNA TagTamper**: NFC runtime, separate trust rows (carrier, offline payload, chip session, `nfcPublicKey` binding, canonical `dataHash`), without becoming a full issuer workstation.

> **Status: this scope was never delivered.** The Android verifier it describes was started
> and abandoned; no public implementation of the `nfc` anchor exists on any platform. The
> reference implementation is now in development as the ODP app for iOS — see
> [GUIDE.md](GUIDE.md#reading-an-nfc-seal). This document is kept because the scope
> boundary it draws is still the right one, and the next attempt should start from it.

**Integration:** [docs/ANDROID.md](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/docs/ANDROID.md) · **Chip pilot:** [ANDROID_NTAG424DNA_TAGTAMPER.md](ANDROID_NTAG424DNA_TAGTAMPER.md).

The browser already verifies registry + `dataHash`; it cannot run EV2 or TagTamper. TagWriter writes carriers only; Tag TrustLink can authenticate the chip but not bind to an ODP passport without comparing to on-chain `nfcPublicKey`.

For the full requirement list (result rows, NDPP hashing rules, MVP boundary), see the historical expanded draft in git history or the companion README trust-model sections.
