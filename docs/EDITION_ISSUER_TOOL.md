> **Historical / superseded for ABI `0.7-redesign-7`.** Do not implement the old derivation, openEdition call or anchor example below. ABI6 prepares nonce/context/root/list before mint, passes operationId and editionCommitment, then opens with nonce; exact signatures come from chain/abi. The current app handoff replaces this task. Current rules: [SPEC](../SPEC.md), [app handoff](../ODP_07_APP_HANDOFF.md), [glossary](GLOSSARY.md), [documentation delta](../ODP_07_ABI6_DOCUMENTATION_DELTA.md). No wallet or external-network actions are authorized by this page.

# Edition issuer tool — implementation handoff

*Everything needed to build the issuer-side tool for SPEC 0.7 §20, written for someone starting cold. Normative rules live in [`SPEC.md` §20](../SPEC.md); this document tells you which parts you must implement and where the traps are.*

*Branch: `v0.7`. Status of the rest of §20: contracts and tests are done (94 Hardhat tests), buyer-side read is done, **no issuer tooling exists** — this is that gap.*

---

## 1. What the tool does

A brand producing an edition — say 100 000 blind-box figures — needs four things to happen:

1. one keypair generated per unit,
2. all their addresses committed as a single Merkle root,
3. that root registered on-chain against the edition's passport,
4. a file of printable codes handed to the label printer.

The tool does 1, 2 and 4 **offline**, and 3 **online**, and those must be two separate commands run on two different machines. That is not style — §20.5 requires derivation on a machine with no network path, because the master seed is the whole edition's security.

Suggested shape:

```
odp-edition prepare  --edition ODP-2026-08-004829415 --chain-id 137 --units 100000 [--label-signer 0x…]
odp-edition open     --edition ODP-2026-08-004829415 --root 0x… --units 100000 [--label-signer 0x…]
```

`prepare` never touches the network. `open` never touches the master seed.

---

## 2. The algorithms, in order

Every step below is normative. Where a step turns bits into bytes, the exact form is pinned — those are the places two implementations silently diverge, and after the labels are printed there is no fix.

### 2.1 Master seed and per-unit secrets (§20.5)

```
masterSeed     = ≥ 256 bits from a CSPRNG, generated offline
editionContext = utf8(chainId) || 0x00 || utf8(editionPassportId)
unitSecret_i   = HKDF-SHA256(ikm = masterSeed, salt = "" (empty), info = editionContext || uint32be(i), L = 32)
```

`chainId` is the **decimal string** ("137", "80002"), not bytes. The HKDF salt is empty, not absent-meaning-zeros-of-hash-length — use your library's empty-salt path and check it against the vectors.

### 2.2 The printed secret — 13 bytes, and why (§20.5)

```
printedSeed_i = first 13 bytes of unitSecret_i, with the low 4 bits of byte 12 cleared
```

100 bits is not a whole number of bytes, and `printedSeed_i` gets hashed in the next step. If you pad differently from this rule you derive different keys from the same printed code, and the mismatch only shows up when a customer's code fails.

### 2.3 The unit key — derivable from the code alone (§20.5)

```
unitKey_i     = secp256k1 private key from
                SHA-256( utf8("ODP-UNIT-KEY-v1") || printedSeed_i || editionContext )
unitAddress_i = address of unitKey_i
```

This step must use **only** the printed value plus data any verifier already has. A buyer holds nothing but 25 scratched characters and must still reach the address in the Merkle root. Never fold the master seed in here.

### 2.4 The printed code — 20 + 5 characters (§20.6)

Alphabet is Crockford Base32, **32 symbols, no `I`, `L`, `O`, `U`**:

```
0123456789ABCDEFGHJKMNPQRSTVWXYZ
```

- **Payload:** the 100 bits of `printedSeed_i`, MSB first, 5 bits per character → 20 characters.
- **Check:** leading **25 bits of SHA-256 over the ASCII of those 20 characters** → 5 characters.
- **Printed as** 5 hyphenated groups of 5: `4CXTW-2C1XH-GYXPG-YREWN-CHVD6`.

**Normalization, before any hashing or comparison:** uppercase, strip hyphens and whitespace, then map `I`→`1`, `L`→`1`, `O`→`0`. A person transcribing `0` as `O` must still get a valid code.

**Entropy floor (§20.6):** `≥ 80 + ceil(log2(unitCount))` bits, never below 80. The 20-character encoding carries 100, which covers any run up to ~1 million. Do not offer a "shorter code" option — the floor is per-target because an attacker forging a unit needs *any* valid code at *any* index, so expected work divides by `unitCount`.

### 2.5 Index assignment — shuffle it (§20.3)

Indices MUST be assigned independently of cartons, regions, distribution batches and release waves. Activations are public, so packing-order indices let anyone read regional sell-through by watching which ranges light up where. Shuffle at labelling time; it costs nothing.

### 2.6 The Merkle tree (§20.3)

```
leaf_i   = SHA-256( uint32be(i) || unitAddress_i )      ← 4 bytes || 20 bytes
interior = SHA-256( left || right )
```

Binary tree. **On a level with an odd number of nodes, duplicate the last node.** Proof verification takes direction from the index bits, not from flags in the proof — so a proof carries siblings only:

```
node = leaf; idx = index
for sibling in proof:
    node = (idx & 1 == 0) ? SHA-256(node || sibling) : SHA-256(sibling || node)
    idx >>= 1
assert node == root
```

Note this is **SHA-256**, not keccak — unusual for an EVM tool, and easy to get wrong by reflex.

### 2.7 Optional label signing (§20.7)

If the edition prints signed outer labels, generate a second keypair — the **label signer**, unrelated to unit keys — and sign per unit:

```
"ODP-UNIT-LABEL-v1" || uint256be(chainId) || contractAddress20
                    || utf8(editionPassportId) || uint32be(unitIndex) || merkleRoot
```

keccak256 the concatenation, then sign it with the EIP-191 personal-sign envelope. The signer's **address** goes on-chain and into the anchor; the private key stays with the issuer.

This is optional and most editions will skip it. It stops labels being fabricated, not copied.

---

## 3. Outputs of `prepare`

| File | Contents | Handling |
|---|---|---|
| `units.addresses.bin` | `unitCount` × 20-byte addresses, index order | **Public.** Ships in the `.odpass` bundle |
| `units.print.csv` | `unitIndex, printedCode` (+ `labelSignature` if signing) | **Secret.** Goes to the printer, never anywhere else |
| `edition.summary.json` | `merkleRoot`, `unitCount`, `addressListHash`, `labelSignerKey` | Public. Feeds the anchor and `open` |
| SLIP-39 shares | 2-of-3 of the master seed | Three separate holders, see §4 |

`addressListHash` is `sha256:` + SHA-256 of `units.addresses.bin`.

**The address list is not optional.** §20.3 requires it in the `.odpass` bundle: without it nobody can build a proof, and `activate` cannot be called at all. An edition whose list lives only at a URL is one expired domain away from being unactivatable.

---

## 4. The ceremony (§20.8)

- Generate on a machine with no network path.
- Split the master seed with **SLIP-39, 2-of-3**. Reference holders: issuer security, a different department, notarial or bank escrow.
- Print at a facility with security-print management (ISO 14298).
- Optionally a `P`-profile witness publishes `submitProof` against the edition passport describing the ceremony — no new contract surface needed.
- **The tool must never offer to store the master seed unsplit**, and must never write it anywhere but the share output.

Honest limits to keep in the tool's own help text: the issuer knows every key at generation, and the printer necessarily sees every code. Neither is fixable with cryptography (§20.14).

---

## 5. What `open` sends on-chain

```solidity
// ODPEditionUnits satellite, address from the deployment record
function openEdition(
    string  calldata editionPassportId,
    bytes32 merkleRoot,
    uint32  unitCount,
    address labelSigner        // address(0) = plain labels
) external;
```

Rules the contract enforces, so surface them as clear errors rather than raw revert codes:

| Code | Meaning |
|---|---|
| `EC(119)` | This edition already has a key set — write-once. A second run needs its own edition passport |
| `EC(120)` | Caller is not the edition passport's creator |
| `EC(121)` | The creator's profile is not `B`. Edition keys are a brand-only feature (§20.1) |
| `EC(118)` | `merkleRoot` is zero |
| `EC(122)` | `unitCount` is zero |

The edition passport must already be minted, with a `unit_key_set` anchor whose `merkleRoot` equals what you register here — a verifier compares the two and reports a mismatch as tampering.

### The anchor `prepare` should emit for `passport.json`

```json
{
  "type": "unit_key_set",
  "data": {
    "merkleRoot": "sha256:…",
    "unitCount": 100000,
    "hashAlg": "sha256",
    "leafFormat": "sha256(uint32be(index) || address20)",
    "addressListUrl": "https://…/units.bin",
    "addressListHash": "sha256:…",
    "labelSignerKey": "0x…"
  }
}
```

Validate it against [`schema/passport-0.7.schema.json`](../schema/passport-0.7.schema.json) before minting. `addressListHash` is required; `labelSignerKey` is optional.

---

## 6. How to prove your implementation is right

**Before printing a single label**, check against [`schema/vectors/edition-units.json`](../schema/vectors/edition-units.json).

It fixes a master seed, chain id, contract address, edition ID and 5 units, and gives for each unit: `unitSecret`, the 13-byte `printedSeed`, the payload, the check characters, the grouped printed code, the derived address and the leaf — plus the root, every tree level, every proof, and the activation and label payload hashes.

These are not hand-written. [`chain/deploy/test/ODPEditionVectors.test.js`](../chain/deploy/test/ODPEditionVectors.test.js) asserts them against the deployed Solidity, including a full `activate()` driven by nothing but the printed code text, and runs in CI.

Regenerate with:

```bash
node chain/tools/edition_vectors.mjs > schema/vectors/edition-units.json
```

Minimum bar for the new tool: given the vectors' master seed and inputs, reproduce every printed code and the root exactly.

---

## 7. Things that will bite

1. **SHA-256, not keccak**, for leaves and interior nodes.
2. **HKDF salt is empty.** Some libraries default to a zero-filled salt of hash length; that is a different function.
3. **The 13-byte seed rule.** Truncating to 12 or 13 bytes without clearing the low nibble gives wrong keys for one unit in sixteen — the worst kind of bug, because most units work.
4. **Odd-level duplication.** Trees that pad with a zero node instead produce a different root.
5. **`chainId` as a decimal string** in `editionContext`, but as `uint256be` in the activation and label payloads. They are different encodings on purpose; follow each formula literally.

---

## 8. Out of scope for this tool

Buyer-side activation (a web page, §20.9), unit-passport minting (§20.10), and gas sponsorship via a paymaster (§20.9). Those are separate work and depend on this tool existing first — until an edition is opened, there is nothing to activate.
