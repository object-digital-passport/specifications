from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[2];folder=root/'chain/artifacts/build-info'
info_path=next(p for p in folder.glob('*.json') if not p.name.endswith('.output.json'))
info=json.loads(info_path.read_text());output=json.loads(info_path.with_suffix('.output.json').read_text())['output']
for name,s in info['input']['sources'].items():
 assert (root/'chain'/name.removeprefix('project/')).read_text()==s['content'], 'Source drift'
def walk(node):
 if isinstance(node,dict):
  yield node
  for v in node.values():yield from walk(v)
 elif isinstance(node,list):
  for v in node:yield from walk(v)
functions={n['id']:n for s in output['sources'].values() for n in walk(s['ast']) if n.get('nodeType')=='FunctionDefinition'}
graph={i:set() for i in functions}
for i,fn in functions.items():
 for n in walk(fn.get('body')):
  if n.get('nodeType')=='FunctionCall':
   target=n.get('expression',{}).get('referencedDeclaration')
   if target in functions:graph[i].add(target)
cycles=[]
def visit(i,path):
 if i in path:
  cycle=path[path.index(i):]+[i]
  if cycle not in cycles:cycles.append(cycle)
  return
 for child in graph[i]:visit(child,path+[i])
for i in graph:visit(i,[])
assert not cycles, 'Recursive call graph needs manual investigation'
settings=info['input']['settings'];assert settings['viaIR'] is True
assert 'optimizerSteps' not in settings.get('optimizer',{}).get('details',{}).get('yulDetails',{})
production='\n'.join(v['content'] for k,v in info['input']['sources'].items() if '/test/' not in k)
assert 'verbatim' not in production
assert 'sstore(' not in production and 'layout at' not in production
version=lambda s:tuple(map(int,s.split('.')))
bugs=json.loads((Path(__file__).parent/'solidity-bugs.json').read_text())
applicable=[b for b in bugs if version(b.get('introduced','0.0.0'))<=version('0.8.20')<version(b.get('fixed','999.0.0'))]
reasons={
'SOL-2026-5':'Excluded by viaIR=true.',
'SOL-2026-4':'No recursive Solidity function-call cycles; no recursive user Yul functions or recursive aggregate types in production sources.',
'SOL-2026-2':'No recursive Solidity function-call cycles; no recursive user Yul functions or recursive aggregate types in production sources.',
'SOL-2025-1':'No custom storage layout or assembly storage writes. Dynamic arrays use hashed slots; no intentional boundary-straddling storage arrays. Cryptographic slot-overflow probability remains a model assumption.',
'SOL-2023-3':'No verbatim blocks; Solidity frontend compilation, not custom Yul input.',
'SOL-2023-2':'Default optimizer sequence; no custom optimizerSteps. Trigger requires non-expression-split custom sequence.',
'SOL-2023-1':'Excluded by viaIR=true.'}
assert set(reasons)=={b['uid'] for b in applicable}, 'New advisory needs review'
report={'compiler':info['solcLongVersion'],'settings':settings,'functionCount':len(functions),'recursiveCycles':cycles,'sourceInputHash':hashlib.sha256(json.dumps(info['input'],sort_keys=True).encode()).hexdigest(),'officialBugsSource':'https://raw.githubusercontent.com/ethereum/solidity/develop/docs/bugs.json','bugsFileSha256':hashlib.sha256((Path(__file__).parent/'solidity-bugs.json').read_bytes()).hexdigest(),'assessment':[{'id':b['uid'],'name':b['name'],'reason':reasons[b['uid']]} for b in applicable],'limitation':'Source/settings trigger screening, not a proof that the compiler has no unknown bugs.'}
(Path(__file__).parent/'compiler-review.json').write_text(json.dumps(report,indent=2)+'\n');print('Screened',len(applicable),'advisories; recursive cycles',len(cycles))
