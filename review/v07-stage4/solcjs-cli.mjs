#!/usr/bin/env node
// Adapter for crytic-compile's standard-json protocol; no native binary is required.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import wrapper from '../../chain/node_modules/hardhat/dist/src/internal/builtin-plugins/solidity/build-system/compiler/solcjs-wrapper.js';
if (!process.env.ODP_SOLC_JS) throw new Error('Set ODP_SOLC_JS to the cached soljson 0.8.20 path');
const { default: module } = await import(pathToFileURL(process.env.ODP_SOLC_JS).href);
const solc = wrapper(module);
if (process.argv.includes('--version')) console.log('Version: ' + solc.version());
else if (process.argv.includes('--standard-json')) process.stdout.write(solc.compile(fs.readFileSync(0, 'utf8')));
else throw new Error('Only --version and --standard-json supported');
