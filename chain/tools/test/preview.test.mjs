// ABI 0.7-redesign-8: public lightweight copy of the primary photo (anchor photo/role "preview", on-chain previewHash).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preparePassport, verifyPassport } from '../passport.mjs';
import { canonicalize, sha256 } from '../canonical.mjs';
import { validateBundleEntries, MAX_PREVIEW_BYTES } from '../bundle.mjs';
import { mintDigest } from '../operations.mjs';

const zero = '0x' + '00'.repeat(32);
const issuer = '0x' + '1'.repeat(40);
const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const example = name => read(`../../../schema/examples/0.7/${name}.json`);
const previewAnchor = hash => ({ type: 'photo', data: { role: 'preview' }, hash });
const h = s => 'sha256:' + sha256(Buffer.from(s)).slice(2);

function chainView(p) {
  const m = p.mint;
  return {
    header: { creator: issuer, objectType: p.document.objectType, year: m.core.year, month: m.core.month, title: m.core.title, authorName: m.core.authorName, shortDescription: m.core.shortDescription, domain: m.core.domain },
    media: { dataHash: m.dataHash, imageHash: m.imageHash, previewHash: m.previewHash, fileHash: m.fileHash, anchorsHash: m.anchorsHash, anchorTypesMask: m.anchorTypesMask, editionCommitment: m.editionCommitment },
    classification: { ...m.core, revoked: false, timestamp: 1n },
  };
}

test('documents without a preview anchor keep previewHash zero', () => {
  for (const name of ['physical', 'digital', 'mixed', 'edition']) assert.equal(preparePassport(example(name), { issuer }).mint.previewHash, zero);
});

test('the preview anchor becomes previewHash, is covered by PHOTO and verifies against the chain view', () => {
  const d = example('physical-preview'), p = preparePassport(d, { issuer });
  const anchor = d.anchors.find(a => a.data?.role === 'preview');
  assert.equal(p.mint.previewHash, '0x' + anchor.hash.slice(7));
  assert.equal(p.mint.imageHash, '0x' + d.anchors.find(a => a.data?.role === 'primary').hash.slice(7));
  assert.equal(p.mint.anchorTypesMask, preparePassport(example('physical'), { issuer }).mint.anchorTypesMask);
  assert.deepEqual(Object.keys(p.mint), ['core', 'dataHash', 'imageHash', 'previewHash', 'fileHash', 'anchorsHash', 'anchorTypesMask', 'editionCommitment']);
  const v = chainView(p);
  assert.equal(verifyPassport(p.document, v.header, v.media, v.classification).integrity, true);
  // The preview anchor is part of the mint operation digest.
  const ctx = { chainId: 137, registry: issuer, issuer, objectType: 'physical' };
  assert.notEqual(mintDigest({ ...ctx, mint: p.mint }), mintDigest({ ...ctx, mint: { ...p.mint, previewHash: zero } }));
});

test('digital and mixed documents accept a preview only next to a primary photo', () => {
  const mixed = example('mixed');
  mixed.anchors.push(previewAnchor(h('mixed preview')));
  assert.equal(preparePassport(mixed, { issuer }).mint.previewHash, '0x' + h('mixed preview').slice(7));
  const digital = example('digital');
  digital.anchors.push(previewAnchor(h('digital preview')));
  assert.throws(() => preparePassport(digital, { issuer }), /Schema|requires a primary/);
  digital.anchors.push({ type: 'photo', data: { role: 'primary' }, hash: h('digital primary') });
  const p = preparePassport(digital, { issuer });
  assert.equal(p.mint.imageHash, '0x' + h('digital primary').slice(7));
  assert.equal(p.mint.previewHash, '0x' + h('digital preview').slice(7));
});

test('previewHash mismatch with the chain is rejected, including an on-chain preview the document lacks', () => {
  const p = preparePassport(example('physical-preview'), { issuer }), v = chainView(p);
  assert.throws(() => verifyPassport(p.document, v.header, { ...v.media, previewHash: '0x' + 'ab'.repeat(32) }, v.classification), /Hash mismatch: previewHash/);
  const plain = preparePassport(example('physical'), { issuer }), w = chainView(plain);
  assert.throws(() => verifyPassport(plain.document, w.header, { ...w.media, previewHash: p.mint.previewHash }, w.classification), /Hash mismatch: previewHash/);
});

test('two preview anchors, a preview without a primary photo and a preview equal to the primary are rejected', () => {
  const two = example('physical-preview');
  two.anchors.push(previewAnchor(h('second preview')));
  assert.throws(() => preparePassport(two, { issuer }), /Schema|Multiple preview/);
  const noPrimary = example('physical-preview');
  delete noPrimary.anchors.find(a => a.data?.role === 'primary').data;
  assert.throws(() => preparePassport(noPrimary, { issuer }), /Schema|requires a primary/);
  const onlyPreview = example('physical');
  onlyPreview.anchors.find(a => a.type === 'photo').data.role = 'preview';
  assert.throws(() => preparePassport(onlyPreview, { issuer }), /Schema|requires a primary/);
  const same = example('physical-preview');
  same.anchors.find(a => a.data?.role === 'preview').hash = same.anchors.find(a => a.data?.role === 'primary').hash;
  assert.throws(() => preparePassport(same, { issuer }), /must differ/);
});

function bundle(previewBytes) {
  const passport = example('physical-preview');
  const generation = read('../../../schema/bundle-0.7/examples/generation.json');
  const receipt = read('../../../schema/bundle-0.7/examples/receipt.json');
  const photo = Buffer.from('synthetic original photograph bytes');
  const payloads = [photo, previewBytes].map(bytes => ({ bytes, hash: sha256(bytes).slice(2) }));
  passport.anchors.find(a => a.data?.role === 'primary').hash = 'sha256:' + payloads[0].hash;
  passport.anchors.find(a => a.data?.role === 'preview').hash = 'sha256:' + payloads[1].hash;
  const manifest = { format: 'odp-bundle-manifest-0.7', passportFile: 'passport.json', generationFile: 'generation.json', receiptFile: 'receipt.json', files: payloads.map(p => ({ path: 'files/' + p.hash, sha256: 'sha256:' + p.hash, byteLength: String(p.bytes.length) })) };
  return [
    ...Object.entries({ passport, generation, receipt, manifest }).map(([name, doc]) => ({ name: name + '.json', bytes: Buffer.from(canonicalize(doc)) })),
    ...payloads.map(p => ({ name: 'files/' + p.hash, bytes: p.bytes })),
  ];
}

test('bundle requires the preview payload and caps it at 1048576 bytes', () => {
  const jpeg = size => { const b = Buffer.alloc(size, 0x20); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; };
  assert.equal(MAX_PREVIEW_BYTES, 1048576);
  assert.equal(validateBundleEntries(bundle(jpeg(MAX_PREVIEW_BYTES))).report.contentIntegrity, 'verified');
  assert.throws(() => validateBundleEntries(bundle(jpeg(MAX_PREVIEW_BYTES + 1))), /preview copy exceeds 1048576 bytes/);
  const entries = bundle(jpeg(1024)), manifest = JSON.parse(entries[3].bytes);
  manifest.files.pop();
  entries[3] = { name: 'manifest.json', bytes: Buffer.from(canonicalize(manifest)) };
  assert.throws(() => validateBundleEntries(entries.slice(0, -1)), /required original missing/);
});
