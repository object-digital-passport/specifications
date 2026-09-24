// Run from a disposable SOURCE/chain copy: node usage-experiments.mjs.
// Only synthetic secrets, no provider, no RPC, no transactions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getBytes, solidityPackedKeccak256, verifyMessage, sha256 } from 'ethers';
import { deriveUnit, decodeCode, unitWallet, editionContext, leafOf, treeOf, verifyAddressList } from './tools/edition.mjs';
import { preparePassport, verifyPassport } from './tools/passport.mjs';

const registry = '0x' + '11'.repeat(20), satellite = '0x' + '22'.repeat(20);
const ctx = editionContext(137, registry, '0x' + '33'.repeat(32));
const unit = deriveUnit(Buffer.alloc(32, 42), ctx, 0);
const copied = unitWallet(decodeCode(unit.code), ctx);
assert.equal(copied.address, unit.wallet.address);
const payload = solidityPackedKeccak256(['string','uint256','address','string','uint32'],
  ['ODP-UNIT-ACTIVATE-v1',137,satellite,'ODP-2026-09-123456789',0]);
const sig = await copied.signMessage(getBytes(payload));
assert.equal(verifyMessage(getBytes(payload), sig), unit.wallet.address);
console.log('PASS E1: copied printed code signs the same activation payload; no recipient is bound. No on-chain submission performed.');

const addresses = [unit.wallet.address.toLowerCase(), unit.wallet.address.toLowerCase()];
const bytes = Buffer.from(addresses.join('\n') + '\n');
const tree = treeOf(addresses.map((a,i)=>leafOf(i,a)));
assert.equal(verifyAddressList(bytes, {addressListHash:'sha256:'+sha256(bytes).slice(2), unitCount:2, merkleRoot:'sha256:'+tree.root.slice(2)}).integrity, 'verified');
console.log('PASS E2: a self-consistent list with the same key at two indexes passes address-list integrity. This does not verify unique secret provisioning.');

const doc = JSON.parse(fs.readFileSync('../schema/examples/0.7/physical.json'));
const prepared = preparePassport(doc);
const header = {...prepared.mint.core, creator: registry, objectType: doc.objectType};
const classification = {...prepared.mint.core, revoked:true, timestamp:123};
const result = verifyPassport(doc,header,prepared.mint,classification);
assert.equal(result.integrity,true);
assert.equal(result.revoked,true);
assert.equal(result.verificationMethod.status,'unsupported');
console.log('PASS E3: integrity=true coexists with revoked=true and unsupported verification, using synthetic chain views. This API does not authenticate chain evidence.');
