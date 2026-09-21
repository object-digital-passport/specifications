#!/usr/bin/env python3
import json,hashlib,unicodedata
from pathlib import Path
v=json.loads((Path(__file__).resolve().parents[2]/'schema/vectors/edition-units.json').read_text())['variantCommitment']
h=lambda b:hashlib.sha256(b).digest()
b=lambda s:bytes.fromhex(s.removeprefix('0x'))
for u in v['units']:
 text=unicodedata.normalize('NFC',u['variant']).encode();i=u['index'];node=h(i.to_bytes(4,'big')+len(text).to_bytes(2,'big')+text+b(u['salt']));assert node==b(u['leaf'])
 for sibling in u['proof']:
  node=h(b(sibling)+node if i&1 else node+b(sibling));i>>=1
 assert node==b(v['root'])
print('Independent Python: five NFC UTF-8 variant leaves and Merkle proofs match.')
