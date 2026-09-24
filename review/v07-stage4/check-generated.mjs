import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(dir+'/'+x.name):[dir+'/'+x.name]);}
const files=[...walk('chain/types'),...walk('chain/abi')].sort(),hashes=Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
const saved=path.join(root,'review/v07-stage4/generated-hashes.json');
if(process.argv[2]==='snapshot'){fs.writeFileSync(saved,JSON.stringify(hashes,null,2)+'\n');console.log('Snapshot: '+files.length+' generated files');}
else {if(JSON.stringify(JSON.parse(fs.readFileSync(saved)))!==JSON.stringify(hashes))throw new Error('Generated ABI/TypeChain drift');console.log('Clean rebuild reproduces all '+files.length+' ABI/TypeChain files byte-for-byte');}
