import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const names=['ObjectDigitalPassport','ODPEditionUnits','ODPAuthorAttestation','ODPPassportConcerns','ODPHosting','ODPProfileDirectory','ODPRegistryRelations','ODPPassportProofRegistry','ODPWalletDocumentAnchor','ODPStatementJournal','IODPRegistry'];
fs.mkdirSync(path.join(root,'abi'),{recursive:true});
for(const name of names){const a=JSON.parse(fs.readFileSync(path.join(root,`artifacts/contracts/${name}.sol/${name}.json`)));fs.writeFileSync(path.join(root,'abi',name+'.json'),JSON.stringify(a.abi,null,2)+'\n');}
console.log('Exported 0.7-redesign-8 ABI: '+names.length+' interfaces');
