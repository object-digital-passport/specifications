> **Historical / superseded for ABI `0.7-redesign-7`.** NFC hardware/transport is deferred for this release; this legacy guide does not establish implemented or physically verified support. Current rules: [SPEC](../SPEC.md), [app handoff](../ODP_07_APP_HANDOFF.md), [glossary](GLOSSARY.md), [documentation delta](../ODP_07_ABI6_DOCUMENTATION_DELTA.md). No wallet or external-network actions are authorized by this page.

# Issuer NFC flow — scan chip before mint

This is the **required mint order** for physical passports with an NTAG 424 DNA TagTamper seal in ODP v0.5.

## Why order matters

Minting before scanning the chip lets you publish the wrong `nfcPublicKey` or `uid` in `passport.json` and on-chain. A later tap cannot fix a wrong registry anchor without a new passport.

## Correct order

```text
1. Provision tag
      → ODP Android Companion: Provision new NTAG 424 tag (factory key only)
      → or NXP TagWriter / PC tooling
      → yields 16-byte EV2 application key (nfcPublicKey) + UID
      → the published key MUST be 01h..04h, never 00h — see SPEC §6 step 1
2. ODP web — passport.html
      → paste EV2 key
      → Android companion issuer scan
      → import chip setup JSON (locks UID + key)
3. Complete passport form + images/files
4. Mint on-chain
5. Write NDEF carrier (odp:// URI, per SPEC §12.2 — no hostname) — after passport ID exists
6. Lock the carrier file: Write and ReadWrite access conditions to Fh
```

## ODP web (passport.html)

In the NFC section:

1. Paste the **EV2 application key** from provisioning (32 hex chars). This must be a
   non-master key — `01h`..`04h`. Key `00h` is the AppMasterKey and authorises `ChangeKey`
   over every key on the tag; publishing it in the passport lets any reader re-key a
   genuine seal and lock its holder out. Keep `00h`; publish the other.
2. Tap **Scan chip with Android companion** (handoff includes `route.mintPageUrl` for return).
3. After the scan, tap **Open mint page in browser** on the companion result (Pixel / one-phone flow), or **Copy chip setup JSON** and paste into **Import chip setup**.
4. Chrome returns to `passport.html?chipSetup=…` — UID and `nfcPublicKey` auto-fill; the query param is stripped from the URL.
5. Connect wallet (WalletConnect on mobile) and **Mint Passport** — blocked until chip setup is confirmed.

## Android companion (issuer mode)

Handoff from web uses `route.intent = issuer-chip-setup`.

The app:

- runs **EV2 symmetric challenge-response** with the key from web,
- reads **authenticated UID**,
- for TagTamper models, reads **GetTTStatus** (must be **INTACT**),
- exports `odp-chip-issuer-setup` JSON for web import,
- when `route.mintPageUrl` is set, offers **Open mint page in browser** with `?chipSetup=<base64url(json)>`.

Carrier NDEF is **not** required on this scan (tag may be blank before Verify URL is written).

## Pixel / one-phone loop

```text
Chrome (passport.html) → companion deep link → NFC tap → Open mint page in browser
      → Chrome (same passport.html + chipSetup) → WalletConnect → Mint
```

Serve `passport.html` from a stable HTTPS or LAN URL on the phone (not only `file://`) so `mintPageUrl` in the handoff is reachable when you return from the companion.

## Export format

```json
{
  "type": "odp-chip-issuer-setup",
  "version": 1,
  "chip": {
    "uid": "0x04a1b2c3d4e5f6",
    "model": "NTAG424DNA_TAGTAMPER",
    "publicKey": "0x00112233445566778899aabbccddeeff",
    "ev2AuthPassed": true,
    "tamperState": "intact"
  }
}
```

Web import requires `ev2AuthPassed: true` and, for TagTamper, `tamperState: intact`.

## After mint

1. Build `.odpass` / host passport JSON.
2. Generate **odpOffline** / NDPP payload in **Manage passport** and anchor `ndppCommitmentHash` on-chain if you use the NDPP carrier profile.
3. Write NFC carrier with the final Verify URL + offline payload (companion **operator write** from the Android handoff, or TagWriter with the exported `.ndef` file).
4. When using companion operator write with a handoff that includes `write.offlinePayloadBase64`, the app **locks** NTAG files `01h` (CC) and `02h` (NDEF) after a successful write: read stays free (`Eh`), write / read-write / change are denied (`Fh`). This matches NXP guidance to change NDEF write access after personalization.
5. Optional: re-scan in **verify** mode to confirm high-assurance seal.

**Honest limit:** lock requires a second tap with the same EV2 key. SDM-enabled NDEF layouts must be finalized in NXP tools instead. On-chain passport fields remain immutable regardless of tag lock.

See also [ANDROID_NTAG424DNA_TAGTAMPER.md](./ANDROID_NTAG424DNA_TAGTAMPER.md) and SPEC.md §6 / Level 2A.
