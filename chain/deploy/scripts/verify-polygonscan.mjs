/** Submits source verification for a deployed generation to Polygonscan (Etherscan API v2, chain 137).
 * Uses the exact standard-json compiler input pinned in the approved release bundle, and constructor
 * arguments taken from the deployment manifest. Reads POLYGONSCAN_API_KEY from the environment and never
 * prints it. `--dry-run` prints what would be submitted without any network request. */
import fs from 'node:fs';
import {parseJSONBytes} from '../../tools/canonical.mjs';

const API = 'https://api.etherscan.io/v2/api?chainid=137';
const release = parseJSONBytes(fs.readFileSync(process.env.ODP_RELEASE_BUNDLE ?? '../review/v07-abi8-release/release.json'));
const manifest = parseJSONBytes(fs.readFileSync(process.env.ODP_DEPLOY_MANIFEST ?? 'deploy/output/odp-0.7-redesign-8-polygon-20260925.json'));
const dryRun = process.argv.includes('--dry-run');
const key = process.env.POLYGONSCAN_API_KEY?.trim();
if (!dryRun && !key) throw new Error('POLYGONSCAN_API_KEY is not set');

const strip = hex => hex.replace(/^0x/, '').toLowerCase();
const sourceFor = name => {
  const hit = Object.keys(release.input.sources).find(p => p.endsWith(`/${name}.sol`));
  if (!hit) throw new Error(`No source for ${name}`);
  return `${hit}:${name}`;
};
const compiler = 'v' + release.compilerVersion.replace(/^v/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(params, post) {
  const body = new URLSearchParams({...params, apikey: key});
  const res = post ? await fetch(API, {method: 'POST', body}) : await fetch(`${API}&${body}`);
  return res.json();
}

for (const [name, entry] of Object.entries(manifest.contracts)) {
  const creation = strip(release.contracts[name].bytecode);
  const data = strip(entry.deploymentData);
  if (!data.startsWith(creation)) throw new Error(`${name}: deployment data does not start with the bundle bytecode`);
  const args = data.slice(creation.length);
  const job = {module: 'contract', action: 'verifysourcecode', codeformat: 'solidity-standard-json-input',
    sourceCode: JSON.stringify(release.input), contractaddress: entry.address, contractname: sourceFor(name),
    compilerversion: compiler, constructorArguements: args};
  if (dryRun) { console.log(name, entry.address, job.contractname, compiler, `args ${args.length / 2} bytes`); continue; }
  const already = await call({module: 'contract', action: 'getsourcecode', address: entry.address});
  if (already.status === '1' && already.result?.[0]?.SourceCode) { console.log(`${name}: already verified`); continue; }
  const submitted = await call(job, true);
  if (submitted.status !== '1') { console.log(`${name}: submit failed — ${submitted.result}`); continue; }
  let verdict;
  for (let i = 0; i < 20; i++) {
    await sleep(5000);
    verdict = await call({module: 'contract', action: 'checkverifystatus', guid: submitted.result});
    if (!/Pending/i.test(String(verdict.result))) break;
  }
  console.log(`${name}: ${verdict.result}`);
  await sleep(1000);
}
