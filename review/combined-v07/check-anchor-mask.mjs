// Read-only reproducer of Opus F-08 against the current working tree.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {preparePassport} from '../../chain/tools/passport.mjs';
const base=JSON.parse(fs.readFileSync(new URL('../../schema/vectors/physical.passport.json',import.meta.url)));
const baseline=preparePassport(base).mint.anchorTypesMask;
for(const type of ['new_custom_type','constructor','__proto__','toString','hasOwnProperty']){
 const d=structuredClone(base);d.anchors.push({type});
 const actual=preparePassport(d).mint.anchorTypesMask,expected=(baseline|0x80000000)>>>0;
 console.log(JSON.stringify({type,baseline,actual,expected,conformant:actual===expected}));
 if(type==='new_custom_type')assert.equal(actual,expected);
 else assert.notEqual(actual,expected,'Finding no longer reproduces: update the consolidation');
}
