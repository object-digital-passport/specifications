import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const names=['ObjectDigitalPassport','ODPEditionUnits','ODPAuthorAttestation','ODPPassportConcerns','ODPHosting','ODPProfileDirectory','ODPRegistryRelations','ODPPassportProofRegistry','ODPWalletDocumentAnchor'];
const contracts=names.map(name=>{const a=JSON.parse(fs.readFileSync(path.join(root,`chain/artifacts/contracts/${name}.sol/${name}.json`)));return {name,runtimeBytes:(a.deployedBytecode.length-2)/2,runtimeTemplateSHA256:digest(Buffer.from(a.deployedBytecode.slice(2),'hex')),creationBytecodeSHA256:digest(Buffer.from(a.bytecode.slice(2),'hex')),abiSHA256:digest(JSON.stringify(a.abi)),linkReferences:a.linkReferences};});
function files(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(dir+'/'+d.name):[dir+'/'+d.name]);}
const sourceNames=[...files('chain/contracts'),...files('chain/deploy/test'),...files('chain/deploy/scripts'),...files('chain/tools').filter(p=>p.endsWith('.mjs')||p.endsWith('.py')),...files('schema'), 'chain/generations.json','chain/hardhat.config.ts','chain/package.json','chain/package-lock.json','SPEC.md'].sort();
const sourceSHA256=Object.fromEntries(sourceNames.map(p=>[p,digest(fs.readFileSync(path.join(root,p)))]));
const out={generation:'0.7-redesign-1',node:process.version,compiler:'0.8.20+commit.a1b79de6',compilerBackend:'solc-js (preferWasm)',settings:{optimizer:{enabled:true,runs:1},viaIR:true,evmVersion:'shanghai',metadata:{bytecodeHash:'none'}},note:'Runtime templates contain immutable placeholders; these are NOT deployed runtime hashes. No approved chain deployment.',contracts,sourceSHA256};
fs.writeFileSync(path.join(root,'review/v07/artifacts.json'),JSON.stringify(out,null,2)+'\n');
console.log(`Recorded ${contracts.length} contract artifacts and ${sourceNames.length} source inputs`);
