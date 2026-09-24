import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalize, sha256 } from '../canonical.mjs';
import { validateBundleEntries } from '../bundle.mjs';
const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
function fixture() {
  const passport = read('../../../schema/examples/0.7/physical.json');
  const generation = read('../../../schema/bundle-0.7/examples/generation.json');
  const receipt = read('../../../schema/bundle-0.7/examples/receipt.json');
  const bytes = Buffer.from('synthetic original photograph bytes');
  const hash = sha256(bytes).slice(2), path = `files/${hash}`;
  passport.anchors.find(a => a.type === 'photo').hash = `sha256:${hash}`;
  const manifest = { format: 'odp-bundle-manifest-0.7', passportFile: 'passport.json', generationFile: 'generation.json', receiptFile: 'receipt.json', files: [{ path, sha256: `sha256:${hash}`, byteLength: String(bytes.length) }] };
  return { passport, generation, receipt, manifest, path, bytes };
}
function entries(f) {
  return [...['passport', 'generation', 'receipt', 'manifest'].map(name => ({ name: `${name}.json`, bytes: Buffer.from(canonicalize(f[name])) })), { name: f.path, bytes: f.bytes }];
}
test('offline integrity never implies verified chain or issuer', () => {
  const f = fixture(), result = validateBundleEntries(entries(f));
  assert.equal(result.report.contentIntegrity, 'verified');
  assert.equal(result.report.chainEvidence, 'unverified');
  assert.equal(result.report.issuerIdentity, 'unverified');
  assert.equal(result.report.physicalAuthenticity, 'unsupported');
  assert.equal(validateBundleEntries(entries(f), { trustedGeneration: f.generation }).report.deployment, 'matches-pinned-manifest');
  const pin = structuredClone(f.generation); pin.registry = '0x' + 'a'.repeat(40);
  assert.throws(() => validateBundleEntries(entries(f), { trustedGeneration: pin }), /untrusted/);
});
test('omitting both payload and manifest item cannot hide a missing original', () => {
  const f = fixture(); f.manifest.files = [];
  assert.throws(() => validateBundleEntries(entries(f).slice(0, 4)), /required original missing/);
});
test('payload tamper and size mismatch fail', () => {
  const f = fixture(); f.bytes = Buffer.from('tampered');
  assert.throws(() => validateBundleEntries(entries(f)), /hash mismatch/);
  const g = fixture(); g.manifest.files[0].byteLength = '1';
  assert.throws(() => validateBundleEntries(entries(g)), /length mismatch/);
});
test('duplicate paths, traversal, extra and missing roots fail', () => {
  const e = entries(fixture());
  assert.throws(() => validateBundleEntries([...e, e[0]]), /duplicate/);
  assert.throws(() => validateBundleEntries([...e, { name: '../passport.json', bytes: Buffer.alloc(0) }]), /path/);
  assert.throws(() => validateBundleEntries(e.slice(1)), /missing passport/);
});
test('cross-file mismatch and missing/duplicate satellite roles fail', () => {
  const f = fixture(); f.receipt.chainId = '1';
  assert.throws(() => validateBundleEntries(entries(f)), /chainId mismatch/);
  const g = fixture(); g.generation.satellites.pop();
  assert.throws(() => validateBundleEntries(entries(g)), /satellite roles/);
  const h = fixture(); h.generation.satellites[1].role = h.generation.satellites[0].role;
  assert.throws(() => validateBundleEntries(entries(h)), /satellite roles/);
});
test('duplicate JSON keys, malformed UTF-8, BOM and noncanonical passport fail', () => {
  for (const bytes of [Buffer.from('{"x":1,"x":2}'), Buffer.from([0xff]), Buffer.concat([Buffer.from([0xef,0xbb,0xbf]), Buffer.from('{}')]), Buffer.from(JSON.stringify(fixture().passport, null, 2))]) {
    const e = entries(fixture()); e[0].bytes = bytes;
    assert.throws(() => validateBundleEntries(e));
  }
});
test('edition must use the declared generation and include public address list', () => {
  const f = fixture();
  const edition = read('../../../schema/examples/0.7/edition.json');
  f.passport = edition;
  f.passport.anchors.find(a => a.type === 'photo').hash = `sha256:${sha256(f.bytes).slice(2)}`;
  const a = f.passport.anchors.find(a => a.type === 'unit_key_set').data;
  assert.throws(() => validateBundleEntries(entries(f)), /edition namespace/);
  a.chainId = f.generation.chainId;
  a.registry = f.generation.registry;
  a.satellite = f.generation.satellites.find(s => s.role === 'edition-units').address;
  assert.throws(() => validateBundleEntries(entries(f)), /required original missing/);
  // Hash presence alone does not imply a verified Merkle tree.
  a.addressListHash = f.passport.anchors.find(a => a.type === 'photo').hash;
  assert.throws(() => validateBundleEntries(entries(f)), /Address list/);
});
test('manifest path/hash disagreement, unlisted bytes and duplicate deployments fail', () => {
  const f = fixture(); f.manifest.files[0].sha256 = 'sha256:' + 'a'.repeat(64);
  assert.throws(() => validateBundleEntries(entries(f)), /path\/hash/);
  const g = fixture(); g.manifest.files = [];
  assert.throws(() => validateBundleEntries(entries(g)), /unlisted/);
  const h = fixture(); h.generation.satellites[0].address = h.generation.registry;
  assert.throws(() => validateBundleEntries(entries(h)), /duplicate deployment/);
});
