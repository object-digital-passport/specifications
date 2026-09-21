#!/usr/bin/env python3
"""Check all internal function call paths for recursion from solc's AST; no deployment."""
import subprocess,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
files=sorted(p.name for p in (root/'chain/contracts').glob('*.sol'))
r=subprocess.run([sys.argv[1],*files,'--combined-json','ast'],cwd=root/'chain/contracts',capture_output=True,text=True,check=True)
data=json.loads(r.stdout);functions={}
def walk(x):
 if isinstance(x,dict):
  yield x
  for v in x.values():yield from walk(v)
 elif isinstance(x,list):
  for v in x:yield from walk(v)
for source in data['sources'].values():
 for node in walk(source['AST']):
  if node.get('nodeType')=='FunctionDefinition' and node.get('body') is not None:functions[node['id']]=node
edges={k:set() for k in functions}
for k,node in functions.items():
 for call in walk(node['body']):
  if call.get('nodeType')=='FunctionCall':
   ref=call.get('expression',{}).get('referencedDeclaration')
   if ref in functions:edges[k].add(ref)
visited=set();stack=set()
def visit(k):
 if k in stack:raise AssertionError('Recursive cycle at '+functions[k]['name'])
 if k in visited:return
 stack.add(k)
 for v in edges[k]:visit(v)
 stack.remove(k);visited.add(k)
for k in functions:visit(k)
result={'functionsWithBody':len(functions),'resolvedCallEdges':sum(map(len,edges.values())),'recursiveCycles':0,'scope':'Solidity FunctionDefinition/FunctionCall referencedDeclaration graph; library calls included; not a full optimizer proof'}
print(json.dumps(result,indent=2))
