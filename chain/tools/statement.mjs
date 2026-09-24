import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {canonicalize,canonicalHash,parseJSONBytes} from './canonical.mjs';
const validate=new Ajv2020({strict:false,allErrors:true}).compile(JSON.parse(fs.readFileSync(new URL('../../schema/statement-0.7.schema.json',import.meta.url))));
const kinds=['none','issuer-correction','author-declaration','institutional-assessment'];
/** Check canonical payload bytes against independently supplied chain record/context. */
export function verifyStatement(bytes,{chainId,registry,journal},record) {
 const d=parseJSONBytes(bytes);
 if(!validate(d))throw new Error('Statement schema mismatch');
 if(!Buffer.from(bytes).equals(Buffer.from(canonicalize(d))))throw new Error('Statement is not canonical');
 if(BigInt(d.subject.chainId)!==BigInt(chainId)||d.subject.registry!==registry.toLowerCase()||d.journal!==journal.toLowerCase())throw new Error('Statement namespace mismatch');
 if(d.subject.passportId!==record.passportId||'0x'+d.subject.dataHash.slice(7)!==record.dataHash.toLowerCase()||d.author!==record.author.toLowerCase()||kinds[Number(record.kind)]!==d.kind||BigInt(d.previousId)!==BigInt(record.previousId)||canonicalHash(d)!==record.payloadHash.toLowerCase())throw new Error('Statement record mismatch');
 return {contentIntegrity:'verified',authorIdentity:'unverified',truth:'unsupported',lifecycle:'unverified'};
}
