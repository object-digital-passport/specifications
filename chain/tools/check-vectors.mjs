import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import { execFileSync } from 'node:child_process';
import { canonicalize,canonicalHash,parseJSON } from './canonical.mjs';
import { preparePassport } from './passport.mjs';
const root=new URL('../../schema/vectors/',import.meta.url);
const zero='0x'+'00'.repeat(32);
// physical-preview (ABI 0.7-redesign-8) adds the public preview copy anchor; the four originals keep previewHash zero.
for(const name of ['physical','digital','mixed','edition','physical-preview']){
 const d=parseJSON(fs.readFileSync(new URL(name+'.passport.json',root),'utf8'));
 const expected=JSON.parse(fs.readFileSync(new URL(name+'.expected.json',root)));
 if(canonicalize(d)!==fs.readFileSync(new URL(name+'.canonical.json',root),'utf8') || canonicalize(d.anchors)!==fs.readFileSync(new URL(name+'.anchors.canonical.json',root),'utf8') || expected.dataHash!==canonicalHash(d) || expected.anchorsHash!==canonicalHash(d.anchors))throw new Error('Vector mismatch '+name);
 const p=preparePassport(d,{issuer:'0x'+'1'.repeat(40)});if(p.mint.dataHash!==expected.dataHash || p.mint.previewHash!==(expected.previewHash??zero))throw new Error('Prepare mismatch');
 const example=parseJSON(fs.readFileSync(new URL(`../../schema/examples/0.7/${name}.json`,import.meta.url),'utf8'));if(canonicalize(example)!==canonicalize(d))throw new Error('Example/vector drift '+name);
}
if(execFileSync(process.execPath,[fileURLToPath(new URL('./edition_vectors.mjs',import.meta.url))],{encoding:'utf8'})!==fs.readFileSync(new URL('edition-units.json',root),'utf8'))throw new Error('Edition generator drift');
console.log('All five bundle vectors and edition v2 generator match.');
