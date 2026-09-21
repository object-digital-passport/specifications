# Canonicalization conformance vectors

`dataHash` and `anchorsHash` are anchored on chain and the card is immutable
(§8), so two implementations that canonicalize a passport differently produce
passports the other can never verify — and there is no way to correct one after
the mint. §10 fixes NFC normalization, key order and minification; these files
fix the rest, byte for byte, so an implementer can tell a canonicalization bug
from a hashing bug without guessing.

## Files

| File | What it is |
|---|---|
| `physical.passport.json` | The input document — a copy of `schema/examples/0.7/physical.json`, on the **v0.7** line (`"version": "0.7"`). |
| `physical.canonical.json` | Exact canonical bytes of the **`dataHash` input**: the document with `passportId` set to `null` per §15.2 step 2. No trailing newline. |
| `physical.anchors.canonical.json` | Exact canonical bytes of the standalone `anchors` array. No trailing newline. |
| `physical.expected.json` | The two resulting SHA-256 values. |

## How to use them

Canonicalize `physical.passport.json` and compare **bytes** with
`physical.canonical.json` before comparing hashes. A hash mismatch tells you
something is wrong; a byte diff tells you what.

```bash
# Expected, from an implementation that already conforms:
node -e '
  const fs = require("fs");
  const nfc = o => typeof o === "string" ? o.normalize("NFC")
    : Array.isArray(o) ? o.map(nfc)
    : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, nfc(v)]))
    : o;
  const sorted = o => Array.isArray(o) ? o.map(sorted)
    : o && typeof o === "object" ? Object.keys(o).sort().reduce((a, k) => (a[k] = sorted(o[k]), a), {})
    : o;
  const doc = JSON.parse(fs.readFileSync("schema/vectors/physical.passport.json", "utf8"));
  const bytes = JSON.stringify(sorted(nfc({ ...doc, passportId: null })));
  console.log(bytes === fs.readFileSync("schema/vectors/physical.canonical.json", "utf8"));
'
```

## What these vectors are chosen to catch

Each of these has been observed to differ between real implementations:

- **`"width": 60`** — an integer must not acquire a fractional part, and must not
  be rendered through a float. Foundation's `JSONSerialization` writes `0.1` as
  `0.10000000000000001`.
- **`"number": 1`** — in a language where a parsed `1` and a parsed `true` share
  a boxed numeric type (Objective-C `NSNumber`, and so Swift), a naive type
  switch renders this as `true`.
- **`/` inside a string** — must not be escaped. `JSONSerialization` writes
  `\/`; `JSON.stringify` does not.
- **Non-ASCII** — travels as literal UTF-8, never as `\uXXXX`.
- **`passportId`** — `null` in the `dataHash` input, per §15.2 step 2, so a hash
  computed before the mint still matches after the contract assigns the ID.

## Regenerating

These files are generated, not hand-written. If the example changes, regenerate
both canonical files and the hashes together — never edit one by hand.
