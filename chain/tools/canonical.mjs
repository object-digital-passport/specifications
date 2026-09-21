import { createHash } from 'node:crypto';

function normalizedString(s) {
  for (let i=0;i<s.length;i++) {
    const c=s.charCodeAt(i);
    if (c>=0xd800 && c<=0xdbff) {
      const n=s.charCodeAt(++i); if (!(n>=0xdc00 && n<=0xdfff)) throw new Error('Unpaired UTF-16 surrogate');
    } else if (c>=0xdc00 && c<=0xdfff) throw new Error('Unpaired UTF-16 surrogate');
  }
  return s.normalize('NFC');
}
/** ODP canonical JSON: NFC, UTF-16 sorted keys, ECMAScript finite number serialization. */
export function canonicalize(value) {
  const stack=new Set();
  function walk(v) {
    if(v===null)return 'null';
    if(typeof v==='string')return JSON.stringify(normalizedString(v));
    if(typeof v==='boolean')return v?'true':'false';
    if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('Non-finite number');return JSON.stringify(v);}
    if(typeof v!=='object')throw new Error('Not a JSON value');
    if(stack.has(v))throw new Error('Cyclic object');stack.add(v);
    let out;
    if(Array.isArray(v)) {
      const items=[];
      for(let i=0;i<v.length;i++){if(!Object.hasOwn(v,i))throw new Error('Sparse array');items.push(walk(v[i]));}
      out='['+items.join(',')+']';
    } else {
      if(Object.getPrototypeOf(v)!==Object.prototype && Object.getPrototypeOf(v)!==null)throw new Error('Not a plain JSON object');
      const map=new Map();
      for(const k of Object.keys(v)){const n=normalizedString(k);if(map.has(n))throw new Error('NFC key collision');map.set(n,k);}
      out='{'+[...map.keys()].sort().map(k=>JSON.stringify(k)+':'+walk(v[map.get(k)])).join(',')+'}';
    }
    stack.delete(v);return out;
  }
  return walk(value);
}
export const sha256 = bytes => '0x'+createHash('sha256').update(bytes).digest('hex');
export const canonicalHash = value => sha256(Buffer.from(canonicalize(value),'utf8'));

/** Parse strict JSON without silently accepting duplicate object keys. No eval or reviver. */
export function parseJSON(text) {
 let i=0;
 const ws=()=>{while(/[\x20\x09\x0a\x0d]/.test(text[i]??'!'))i++;};
 function string(){const start=i++;while(i<text.length){if(text[i]==='"'){i++;return JSON.parse(text.slice(start,i));}if(text[i]==='\\')i++;i++;}throw new Error('Unterminated string');}
 function value(){ws();const ch=text[i];
  if(ch==='"')return string();
  if(ch==='{'){i++;const o=Object.create(null),keys=new Set();ws();if(text[i]==='}'){i++;return o;}while(true){ws();if(text[i]!=='"')throw new Error('Expected object key');const k=string(),n=normalizedString(k);if(keys.has(n))throw new Error('Duplicate/NFC-colliding key');keys.add(n);ws();if(text[i++]!==':')throw new Error('Expected colon');o[k]=value();ws();const c=text[i++];if(c==='}')return o;if(c!==',')throw new Error('Expected comma');}}
  if(ch==='['){i++;const a=[];ws();if(text[i]===']'){i++;return a;}while(true){a.push(value());ws();const c=text[i++];if(c===']')return a;if(c!==',')throw new Error('Expected comma');}}
  const m=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(i));
  if(!m)throw new Error('Invalid JSON token');i+=m[0].length;return JSON.parse(m[0]);
 }
 const out=value();ws();if(i!==text.length)throw new Error('Trailing JSON data');canonicalize(out);return out;
}

/** Decode protocol bytes without replacement characters or an invisible BOM. */
export function decodeUTF8(bytes) {
 if (!(bytes instanceof Uint8Array)) throw new Error('Expected UTF-8 bytes');
 if (bytes[0]===0xef && bytes[1]===0xbb && bytes[2]===0xbf) throw new Error('UTF-8 BOM is forbidden');
 return new TextDecoder('utf-8', {fatal:true}).decode(bytes);
}
export const parseJSONBytes = bytes => parseJSON(decodeUTF8(bytes));
