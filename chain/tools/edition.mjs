import crypto from 'node:crypto';
import {canonicalize, decodeUTF8} from './canonical.mjs';
import { Wallet, concat, getBytes, sha256, toBeHex, zeroPadValue } from 'ethers';
const ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ORDER=BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const u32 = i => getBytes(zeroPadValue(toBeHex(i),4));
export function editionContext(chainId, registry, nonce) {
 if(getBytes(registry).length!==20 || getBytes(nonce).length!==32 || BigInt(nonce)===0n)throw new Error('Invalid edition context');
 return Buffer.from(getBytes(concat([Buffer.from('ODP-EDITION-v2','ascii'),zeroPadValue(toBeHex(chainId),32),registry,nonce])));
}
function encode(seed,bits){let s='';for(const b of seed)s+=b.toString(2).padStart(8,'0');let out='';for(let i=0;i<bits;i+=5)out+=ALPHABET[parseInt(s.slice(i,i+5),2)];return out;}
function checksum(payload){return encode(crypto.createHash('sha256').update(payload,'ascii').digest(),25);}
export function printedCode(seed) {if(seed.length!==13 || (seed[12]&15)!==0)throw new Error('Invalid 100-bit seed');const p=encode(seed,100);return (p+checksum(p)).match(/.{5}/g).join('-');}
export function decodeCode(text) {
 const s=text.toUpperCase().replace(/[\s-]/g,'').replace(/[IL]/g,'1').replace(/O/g,'0');
 if(s.length!==25 || [...s].some(c=>!ALPHABET.includes(c)) || checksum(s.slice(0,20))!==s.slice(20))throw new Error('Invalid printed code');
 const bits=[...s.slice(0,20)].map(c=>ALPHABET.indexOf(c).toString(2).padStart(5,'0')).join('')+'0000';
 return Buffer.from(Array.from({length:13},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2)));
}
export function unitWallet(seed,ctx) {
 if(seed.length!==13 || (seed[12]&15)!==0)throw new Error('Invalid seed');
 // v2 rejection sampling specifies the extremely rare invalid secp256k1 scalar too.
 for(let counter=0;counter<0x100000000;counter++) {
  const h=crypto.createHash('sha256').update(Buffer.concat([Buffer.from('ODP-UNIT-KEY-v2','ascii'),seed,ctx,Buffer.from(u32(counter))])).digest('hex');
  const k=BigInt('0x'+h);if(k>0n && k<ORDER)return new Wallet('0x'+h);
 }
 throw new Error('Key derivation exhausted');
}
export function deriveUnit(master,ctx,index) {
 if(master.length!==32 || !Number.isInteger(index) || index<0 || index>=1048576)throw new Error('Invalid master/index');
 const secret=Buffer.from(crypto.hkdfSync('sha256',master,Buffer.alloc(0),Buffer.concat([ctx,Buffer.from(u32(index))]),32));
 const seed=Buffer.from(secret.subarray(0,13));seed[12]&=0xf0;
 return {seed,code:printedCode(seed),wallet:unitWallet(seed,ctx)};
}
export const leafOf=(index,address)=>sha256(concat([u32(index),address]));
export function treeOf(leaves) {
 if(leaves.length<1 || leaves.length>1048576)throw new Error('Invalid unit count');
 const levels=[leaves.slice()];while(levels.at(-1).length>1){const l=levels.at(-1),next=[];for(let i=0;i<l.length;i+=2)next.push(sha256(concat([l[i],l[i+1]??l[i]])));levels.push(next);}
 return {root:levels.at(-1)[0],proof(index){if(!Number.isInteger(index)||index<0||index>=leaves.length)throw new Error('Invalid index');const p=[];for(const l of levels.slice(0,-1)){p.push(l[index%2?index-1:Math.min(index+1,l.length-1)]);index=Math.floor(index/2);}return p;}};
}
/** Optional sealed variant commitment; salts must remain concealed except in public test fixtures. */
export function variantLeaf(index,variant,salt) {
 if(typeof variant!=='string')throw new Error('Invalid variant');
 const bytes=Buffer.from(JSON.parse(canonicalize(variant)),'utf8');
 if(getBytes(salt).length!==32 || bytes.length>65535)throw new Error('Invalid variant/salt');
 return sha256(concat([u32(index),zeroPadValue(toBeHex(bytes.length),2),bytes,salt]));
}
export function verifyVariant(root,index,variant,salt,proof) {
 if(!Number.isInteger(index)||index<0||index>=1048576||proof.length>20)throw new Error('Invalid variant proof');
 let node=variantLeaf(index,variant,salt),i=index;
 for(const sibling of proof){node=sha256(concat(i%2?[sibling,node]:[node,sibling]));i=Math.floor(i/2);}
 return node.toLowerCase()===root.toLowerCase();
}

/** Verify canonical public address-list bytes, count and positional SHA256 tree. */
export function verifyAddressList(bytes, {addressListHash, unitCount, merkleRoot}) {
 if (!(bytes instanceof Uint8Array) || !/^sha256:[0-9a-f]{64}$/.test(addressListHash??'') || !/^sha256:(?!0{64}$)[0-9a-f]{64}$/.test(merkleRoot??'')) throw new Error('Invalid address list input/hash');
 if (!Number.isInteger(unitCount) || unitCount<1 || unitCount>1048576) throw new Error('Invalid unit count');
 // Exact length bounds memory before decoding/splitting. Each record is 42 ASCII bytes + LF.
 if (bytes.length!==unitCount*43) throw new Error('Address list length/count mismatch');
 if (sha256(bytes)!=='0x'+addressListHash.slice(7)) throw new Error('Address list hash mismatch');
 const text=decodeUTF8(bytes);
 const addresses=text.slice(0,-1).split('\n');
 if (!text.endsWith('\n') || addresses.length!==unitCount || addresses.some(a=>!/^0x[0-9a-f]{40}$/.test(a))) throw new Error('Noncanonical address list');
 if (addresses.some(a=>BigInt(a)===0n)) throw new Error('Zero unit address');
 const tree=treeOf(addresses.map((address,index)=>leafOf(index,address)));
 if (tree.root!=='0x'+merkleRoot.slice(7)) throw new Error('Address list Merkle root mismatch');
 return {unitCount, merkleRoot, integrity:'verified'};
}
