import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const contracts=['ObjectDigitalPassport','ODPEditionUnits','ODPAuthorAttestation','ODPPassportConcerns','ODPHosting','ODPProfileDirectory','ODPRegistryRelations','ODPPassportProofRegistry','ODPWalletDocumentAnchor','ODPStatementJournal'];
let failed=false;
for(const name of contracts){
 const f=path.join(root,`artifacts/contracts/${name}.sol/${name}.json`);
 if(!fs.existsSync(f))throw new Error('Missing artifact '+name);
 const a=JSON.parse(fs.readFileSync(f)),size=(a.deployedBytecode.length-2)/2;
 console.log(`${name}: ${size}/24576 runtime bytes`);
 if(size>24576 || Object.keys(a.linkReferences).length){console.error('Size or external library linkage violation');failed=true;}
}
if(failed)process.exitCode=1;
