#!/usr/bin/env python3
"""Independent Python known-answer implementation. Requires eth-keys (also a Slither dependency).
Run: /path/to/slither-venv/bin/python review/v07/check-edition-independent.py
"""
import hashlib,hmac,json
from pathlib import Path
from eth_keys import keys
from eth_hash.auto import keccak
v=json.loads((Path(__file__).resolve().parents[2]/'schema/vectors/edition-units.json').read_text())
x=v['inputs'];unhex=lambda s:bytes.fromhex(s.removeprefix('0x'))
ctx=b'ODP-EDITION-v2'+int(x['chainId']).to_bytes(32,'big')+unhex(x['registry'])+unhex(x['editionNonce'])
assert ctx==unhex(x['editionContextHex'])
prk=hmac.new(bytes(32),unhex(x['masterSeedHex']),hashlib.sha256).digest()
alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ'
def encode(b,n):
 bits=''.join(f'{a:08b}' for a in b)[:n]
 return ''.join(alphabet[int(bits[i:i+5],2)] for i in range(0,n,5))
leaves=[]
for u in v['units']:
 i=u['unitIndex'];secret=hmac.new(prk,ctx+i.to_bytes(4,'big')+b'\x01',hashlib.sha256).digest()
 seed=secret[:12]+bytes([secret[12]&240]);assert seed==unhex(u['printedSeedHex'])
 payload=encode(seed,100);full=payload+encode(hashlib.sha256(payload.encode()).digest(),25)
 assert '-'.join(full[j:j+5] for j in range(0,25,5))==u['printedCode']
 counter=0
 while True:
  private=hashlib.sha256(b'ODP-UNIT-KEY-v2'+seed+ctx+counter.to_bytes(4,'big')).digest()
  if 0<int.from_bytes(private,'big')<0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141:break
  counter+=1
 assert private==unhex(u['privateKey'])
 address=keys.PrivateKey(private).public_key.to_canonical_address();assert address==unhex(u['unitAddress'])
 leaf=hashlib.sha256(i.to_bytes(4,'big')+address).digest();assert leaf==unhex(u['leaf']);leaves.append(leaf)
 node=leaf;idx=i
 for sibling in u['proof']:
  sibling=unhex(sibling);node=hashlib.sha256((sibling+node) if idx&1 else (node+sibling)).digest();idx>>=1
 assert node==unhex(v['merkleRoot'])
 common=int(x['chainId']).to_bytes(32,'big')+unhex(x['satellite'])+x['editionPassportId'].encode()+i.to_bytes(4,'big')
 assert keccak(b'ODP-UNIT-ACTIVATE-v1'+common)==unhex(u['activationPayloadHash'])
 assert keccak(b'ODP-UNIT-LABEL-v1'+common+unhex(v['merkleRoot']))==unhex(u['labelPayloadHash'])
while len(leaves)>1:leaves=[hashlib.sha256(leaves[i]+(leaves[i+1] if i+1<len(leaves) else leaves[i])).digest() for i in range(0,len(leaves),2)]
assert leaves[0]==unhex(v['merkleRoot'])
assert hashlib.sha256(v['addressList'].encode()).digest()==unhex(v['addressListHash'])
print('Independent Python: 5 seeds/codes/private keys/addresses/leaves/proofs/signature payloads, root and address-list hash match.')
