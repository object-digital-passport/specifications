/** Hardhat-TypeChain emits barrel/overload order in compilation-job completion order.
 * Normalize only unordered lists; factory ABI/bytecode files are never modified here.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../types/ethers-contracts');
for(const name of ['index.ts','factories/index.ts']){
 const file=path.join(dir,name),s=fs.readFileSync(file,'utf8');
 const normalized=s.replace(/(?:^export (?:type )?\{[^\n]+(?:\n|$))+/gm,block=>block.trimEnd().split('\n').sort().join('\n')+'\n');
 fs.writeFileSync(file,normalized.trimEnd()+'\n');
}
const file=path.join(dir,'hardhat.d.ts'),source=fs.readFileSync(file,'utf8');let groups=0;
const sorted=source.replace(/(?:^[ \t]*(?:getContractFactory|getContractAt|deployContract)\(name: '[^'\n]+'[^\n]*\n)+/gm,block=>{groups++;return block.trimEnd().split('\n').map(x=>x.trim()).sort().map(x=>'  '+x).join('\n')+'\n';});
if(groups!==4)throw new Error('TypeChain template changed: review normalization before regenerating');
fs.writeFileSync(file,sorted.trimEnd()+'\n');
console.log('Normalized deterministic TypeChain export/overload ordering');
