import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const input=JSON.parse(fs.readFileSync(new URL('./static-input.json',import.meta.url)));
input.settings.outputSelection={'*':{'':['ast']}};
const out=JSON.parse(execFileSync(fileURLToPath(new URL('./solcjs-cli.mjs',import.meta.url)),['--standard-json'],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:50*1024*1024}));
if(out.errors?.some(x=>x.severity==='error'))throw new Error(JSON.stringify(out.errors));
function* walk(x){if(Array.isArray(x)){for(const v of x)yield*walk(v);}else if(x&&typeof x==='object'){yield x;for(const v of Object.values(x))yield*walk(v);}}
const nodes=[...walk(out.sources)],functions=new Map(nodes.filter(x=>x.nodeType==='FunctionDefinition'&&x.body).map(x=>[x.id,x]));
const edges=new Map([...functions].map(([id,f])=>[id,new Set([...walk(f.body)].filter(x=>x.nodeType==='FunctionCall'&&functions.has(x.expression?.referencedDeclaration)).map(x=>x.expression.referencedDeclaration))]));
const seen=new Set(),stack=new Set();
function visit(id){if(stack.has(id))throw new Error('Recursion cycle');if(seen.has(id))return;stack.add(id);for(const to of edges.get(id))visit(to);stack.delete(id);seen.add(id);}
for(const id of functions.keys())visit(id);
const yulFunctions=nodes.filter(x=>x.nodeType==='YulFunctionDefinition');
if(yulFunctions.length)throw new Error('Review assembly functions separately');
const deletes=nodes.filter(x=>x.nodeType==='UnaryOperation'&&x.operator==='delete').map(x=>x.subExpression.typeDescriptions.typeString);
if(deletes.some(x=>x.includes('memory')))throw new Error('Review delete memory operation');
console.log(JSON.stringify({functionsWithBody:functions.size,resolvedCallEdges:[...edges.values()].reduce((n,e)=>n+e.size,0),recursiveCycles:0,inlineAssemblyFunctionDefinitions:0,deleteOperandTypes:deletes,note:'Source AST precondition screen, not proof of compiler correctness'},null,2));
