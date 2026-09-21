import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalize, parseJSON, sha256, decodeUTF8 } from './canonical.mjs';
import { verifyAddressList } from './edition.mjs';
import { preparePassport } from './passport.mjs';

const roots = ['passport.json', 'generation.json', 'receipt.json', 'manifest.json'];
const schemas = Object.fromEntries(['generation', 'receipt', 'manifest'].map(name => {
  const schema = JSON.parse(fs.readFileSync(new URL(`../../schema/bundle-0.7/${name}.schema.json`, import.meta.url)));
  return [name, new Ajv2020({ strict: false, allErrors: true }).compile(schema)];
}));
const roles = ['concerns', 'hosting', 'profile-directory', 'institutional-proofs', 'author-attestation', 'wallet-document-anchor', 'relations', 'edition-units', 'statement-journal'];
const fail = message => { throw new Error(`Bundle: ${message}`); };

/** Validates already decoded entries. ZIP envelope validation must run before this API.
 * trustedGeneration must come from an independent, authenticated application manifest.
 * No chain access or identity verification is performed here.
 */
export function validateBundleEntries(entries, { trustedGeneration } = {}) {
  if (!Array.isArray(entries)) fail('entries must preserve duplicate names');
  const files = new Map();
  for (const { name, bytes } of entries) {
    if (!roots.includes(name) && !/^files\/[0-9a-f]{64}$/.test(name)) fail('unexpected path');
    if (files.has(name)) fail('duplicate path');
    if (!(bytes instanceof Uint8Array)) fail('entry is not bytes');
    files.set(name, Buffer.from(bytes));
  }
  const docs = {};
  for (const name of roots) {
    if (!files.has(name)) fail(`missing ${name}`);
    docs[name.slice(0, -5)] = parseJSON(decodeUTF8(files.get(name)));
  }
  const { passport, generation, receipt, manifest } = docs;
  for (const [name, validate] of Object.entries(schemas)) {
    if (!validate(docs[name])) fail(`${name} schema: ${JSON.stringify(validate.errors)}`);
  }
  if (!files.get('passport.json').equals(Buffer.from(canonicalize(passport)))) fail('passport is not canonical');
  // Issuer is not known until independently checked chain evidence is supplied. This
  // placeholder validates document shape only and is never returned as a commitment.
  preparePassport(passport, { issuer: '0x1111111111111111111111111111111111111111' });
  for (const key of ['generationId', 'chainId', 'registry']) {
    if (generation[key] !== receipt[key]) fail(`receipt ${key} mismatch`);
  }
  const declared = [...generation.satellites.map(s => s.role), ...generation.absentSatelliteRoles];
  if (declared.length !== roles.length || new Set(declared).size !== roles.length || roles.some(r => !declared.includes(r))) fail('incomplete/duplicate satellite roles');
  const addresses = [generation.registry, ...generation.satellites.map(s => s.address)];
  if (new Set(addresses).size !== addresses.length) fail('duplicate deployment address');
  const listed = new Set();
  for (const file of manifest.files) {
    if (listed.has(file.path)) fail('duplicate manifest path');
    listed.add(file.path);
    const bytes = files.get(file.path);
    if (!bytes) fail(`missing payload ${file.path}`);
    if (file.path !== 'files/' + file.sha256.slice(7)) fail('path/hash mismatch');
    if (sha256(bytes).slice(2) !== file.sha256.slice(7)) fail('payload hash mismatch');
    if (BigInt(bytes.length) !== BigInt(file.byteLength)) fail('payload length mismatch');
  }
  for (const path of files.keys()) if (!roots.includes(path) && !listed.has(path)) fail('unlisted payload');
  const required = new Set();
  for (const anchor of passport.anchors) {
    if (['photo', 'file_hash'].includes(anchor.type)) required.add(anchor.hash);
    if (anchor.type === 'unit_key_set') {
      const a = anchor.data;
      required.add(a.addressListHash);
      const satellite = generation.satellites.find(s => s.role === 'edition-units');
      if (!satellite || satellite.address !== a.satellite.toLowerCase() || generation.registry !== a.registry.toLowerCase() || BigInt(generation.chainId) !== BigInt(a.chainId)) fail('edition namespace mismatch');
    }
  }
  if (passport.digital) required.add(passport.digital.fileHash);
  for (const hash of required) if (!listed.has('files/' + hash.slice(7))) fail('required original missing');
  for (const anchor of passport.anchors.filter(a=>a.type==='unit_key_set'))
    verifyAddressList(files.get('files/'+anchor.data.addressListHash.slice(7)), anchor.data);
  let deployment = 'unverified';
  if (trustedGeneration) {
    // Array order is part of the exact pinned manifest identity in this API.
    if (canonicalize(generation) !== canonicalize(trustedGeneration)) fail('untrusted generation');
    deployment = 'matches-pinned-manifest';
  }
  return {
    documents: docs,
    report: {
      contentIntegrity: 'verified', requiredOriginals: 'present', deployment,
      chainEvidence: 'unverified', issuerIdentity: 'unverified', historyFreshness: 'unverified',
      editionAddressList: passport.anchors.some(a=>a.type==='unit_key_set') ? 'verified' : 'not-applicable',
      capabilities: passport.anchors.map(a=>({type:a.type, status:['photo','file_hash','unit_key_set'].includes(a.type)?'integrity-only':'unsupported'})),
      verificationMethod: {method:passport.verificationMethod, status:'unsupported'},
      editionProofs: passport.anchors.some(a => ['unit_key_set', 'unit_variant_commit'].includes(a.type)) ? 'unsupported' : 'not-applicable',
      physicalAuthenticity: 'unsupported',
      unsupportedMessage: 'Не умею выполнять эту проверку',
    },
  };
}
