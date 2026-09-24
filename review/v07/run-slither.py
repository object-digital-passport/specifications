#!/usr/bin/env python3
"""Usage: python3 review/v07/run-slither.py /path/to/venv /path/to/solc-0.8.20.
Runs every production entry with ignored findings visible. Does not deploy or use a wallet.
"""
from pathlib import Path
import subprocess,sys,os,json,concurrent.futures
root=Path(__file__).resolve().parents[2];out=root/'review/v07/slither';out.mkdir(exist_ok=True)
venv,solc=map(Path,sys.argv[1:3]);env=dict(os.environ,VIRTUAL_ENV=str(venv))
names=['ObjectDigitalPassport','ODPEditionUnits','ODPAuthorAttestation','ODPPassportConcerns','ODPHosting','ODPProfileDirectory','ODPRegistryRelations','ODPPassportProofRegistry','ODPWalletDocumentAnchor']
def run(name):
 target=out/(name+'.json')
 if target.exists():target.unlink()
 cmd=[str(venv/'bin/slither'),name+'.sol','--compile-force-framework','solc','--solc',str(solc),'--solc-args','--via-ir --optimize --optimize-runs 1 --evm-version shanghai','--show-ignored-findings','--json',str(target)]
 with (out/(name+'.log')).open('w') as f:r=subprocess.run(cmd,cwd=root/'chain/contracts',env=env,stdout=f,stderr=subprocess.STDOUT)
 data=json.loads(target.read_text()) if target.exists() else {}
 return {'contract':name,'exitCode':r.returncode,'success':data.get('success',False),'detectors':len(data.get('results',{}).get('detectors',[]))}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(run,names))
(out/'summary.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
if not all(x['success'] for x in results):sys.exit(1)
