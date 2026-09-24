#!/usr/bin/env python3
"""Usage: python3 run-slither-js.py /path/to/slither /path/to/soljson.js"""
from pathlib import Path
import json, subprocess, sys, os
root=Path(__file__).resolve().parents[2]
out=root/'review/v07-remediation'
sources={p.name:{'content':p.read_text()} for p in sorted((root/'chain/contracts').glob('*.sol'))}
standard={'language':'Solidity','sources':sources,'settings':{'optimizer':{'enabled':True,'runs':1},'viaIR':True,'evmVersion':'shanghai','metadata':{'bytecodeHash':'none'},'outputSelection':{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode'],'':['ast']}}}}
input_path=out/'static-input.json';input_path.write_text(json.dumps(standard))
env=dict(os.environ,ODP_SOLC_JS=sys.argv[2],VIRTUAL_ENV=str(Path(sys.argv[1]).resolve().parents[1]))
cmd=[sys.argv[1],str(input_path),'--compile-force-framework','Solc-json','--solc',str(out/'solcjs-cli.mjs'),'--show-ignored-findings','--json',str(out/'slither-js.json')]
with (out/'slither-js.log').open('w') as log:
 result=subprocess.run(cmd,cwd=root/'chain/contracts',env=env,stdout=log,stderr=subprocess.STDOUT)
print('Slither exit:',result.returncode)
data=json.loads((out/'slither-js.json').read_text())
print('Analysis success:',data.get('success'))
if not data.get('success'):sys.exit(1)
