# Объём и воспроизводимость

Аудит завершён 2026-09-18 по `ODP_07_INDEPENDENT_AUDIT_TASK.md`. Проверяющий — Codex в отдельной сессии, с самостоятельным чтением и собственными PoC. Это **не внешний профессиональный аудит**, не формальная верификация и не обещание отсутствия неизвестных ошибок. Субагенты не использовались. Сначала была построена модель из кода core/спутников, затем прочитаны текущая SPEC и исторические объяснения; зелёные прогоны использовались как regression evidence, не как доказательство безопасности.

## Снимок

Источник: `/Users/Andrei/Проекты/GitHub/Object Digital Passport/specifications`.
Фактическая ветка `audit/odp-07-review-and-redesign`, HEAD `5d1db8fdd1c7bef013cdd98875671b9c9e9e4760`.
Проверенная ABI generation `0.7-redesign-4`, document0.7. Источником служит **незакоммиченный tree со всеми untracked additions**, а не чистый HEAD.

Зафиксировано1028 файлов. `snapshot-sha256.json` перечисляет каждый файл и SHA-256; SHA-256 самого manifest:
`bd1c79b59946944f51c91f20aebc0815f5089b61f4c7c69265abeb724ad06c92`.

Исходные bytes хешированы до копирования и после; результаты совпали. Каждая скопированная запись проверена. Read-only snapshot: файлы0444, каталоги0555. Это защита от случайной записи, не WORM-хранилище; неизменность проверяется hashes. Отдельный `work` содержит сборки/PoC. Original ABI/TypeChain и существующие artifacts/cache сохранены в snapshot до clean.

Не копировались `.git`, node_modules, Python venv/cache, .DS_Store. Private .env/key/pem/keystore должны исключаться; таких файлов в проверенном исходном наборе не найдено. Внешних symlinks или локальных imports за пределы снимка нет; imports Solidity локальные. Детерминированные synthetic keys внутри исторических тестов — тестовые fixtures. Финальная повторная проверка исходного tree/status: `source-preservation.json`; изменений от аудита нет. Git reset/stash/checkout/clean/add не выполнялись.

Сборки первоначально выполнялись в `/private/tmp/odp-independent-20260918/work`. Архив результата содержит `snapshot`, `work` и manifests; node_modules можно восстановить `npm ci`. Относительные пути тестов сохраняются. Сохранённый read-only снимок — основание ссылок на строки; рабочие production sources совпадают с ним.

## Материалы

Прочитаны полностью SPEC, все15 production Solidity sources, общий IODPRegistry, схемы passport/statement/bundle, canonical/passport/edition/bundle tools, Hardhat config/package+lock, deployment script и retired entrypoints, CI, generations, SECURITY; просмотрены regression tests, actual ABI/factories. Claims ACTION_PLAN/ARCHITECTURE_REVIEW/OPTIONS/APP_HANDOFF и stage1–4 сверены с текущим кодом. Старые IMPLEMENTATION/ASTRA/v07 материалы использованы только как история, их старые36 PoC не перенесены на новую ABI.

Приложение, реальные wallet integrations, hardware/NFC, публичный deployment, сайт и коммерческие storage providers не проверялись и не менялись. ZIP importer и trusted chain evidence в данном репозитории отсутствуют. Локальная EDR — тестовые ключи/chain31337, не публичная сеть. Реальная переменная ODP_ENABLE_DEPLOY не включалась; mocks deployment guard выполнялись только с синтетическими зависимостями без сети и настоящих environment keys.

## Инструменты и результаты

Среда: macOS Darwin27 ARM64, Node22.23.2, npm10.9.8; solc-js0.8.20+a1b79de6, Hardhat/ethers/Ajv из lockfile. Settings и hash compiler — COMPILER_AND_BUILD и static-coverage.json. Python3 использован для независимых HMAC/HKDF/hash/manifest/IR проверок. Slither0.11.6 из отдельного локального venv.

| Проверка | Собственный результат / доказательство |
|---|---|
| npm ci --offline | Успех,272 installed packages; logs/npm-ci.log |
| Две clean compile | Успех, все10 EIP-170; logs/compile1-retry.log, compile2.log |
| Snapshot/clean1/clean2 generated | Все43 совпали побайтно; build-comparison.json |
| Полный EVM прогон после clean2 | 96 passing =88 existing +8 independent; logs/tests-final.log |
| Окончательный независимый набор | 9 passing, включая добавленную B boundary; logs/independent-final.log |
| Tool tests | 8 passing; logs/tools.log |
| Vectors | Все4 document vectors + edition v2 совпали; logs/vectors.log |
| TypeScript | tsc exit0, без diagnostics; logs/typecheck.log |
| Independent model sequences | 180 mint +180 journal переходов, explicit unauthorized/revert invariants; bounded seeded tests, не exhaustive fuzzing |
| Merkle максимум | Реально построены2^20 indexed leaves;4 proof samples проверены независимым SHA256; 12.134s на этом запуске |
| EVM maximum path | 20 siblings, index2^20−1: open204739gas, activation104628gas; root составлен из синтетических subtree hashes |
| Quotas/card maximum | Реальные1000 C mints в baseline; B counter искусственно seeded99999 →100000 success, следующий fail; max card1039291gas |
| Независимые crypto vectors | 8 Python HMAC/HKDF/truncation/scalar/checksum/leaf совпадений; public-key address derivation отдельно не переимплементирована |
| Slither |32 raw findings:4H/5M/18L/5I; exact production content сверены, все разобраны STATIC_ANALYSIS |
| Deployment | Десять локальных factories/artifacts/pins; mock script happy/error/mismatch cases. Не production signing rehearsal |
| Compiler | Официальный текущий registry;7 применимых по version range, trigger screening и собственный IR experiment |

Команды воспроизведения из `work`:

```sh
cd chain
npm ci
npx hardhat clean
npm run compile
npm run vectors
npm run test:tools
npx hardhat test --no-compile
npx tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext types/ethers-contracts/index.ts
cd ..
node review/independent-v07/tool-counterexamples.mjs
node review/independent-v07/independent-tools.mjs
python3 review/independent-v07/independent-crypto.py
node review/independent-v07/deploy-harness.mjs
```

Полный повтор теперь содержит97 tests (добавлена B boundary после96-test полного прогона); фактически сохранены96 полный +9 отдельный независимый. Не выдавать97 как выполненный полный прогон. Для Slither adapter см. stage4/run-slither-js.py; он был прочитан и исполнен заново с --show-ignored-findings, output скопирован сюда. Сначала удалить/переназначить старый output JSON только в своей новой рабочей копии, если инструмент отказывается его перезаписывать.

## Ограничения и отличия от заявлений

Не выполнены: formal proof, SMT/Echidna/Foundry fuzzing, полная генерация2^20 независимых private keys,100000 реальных B transactions, распределённое mempool/reorg testing, mainnet gas measurements, hostile RPC integration, forensic reconstruction отсутствующего старого compiler input, end-to-end готового приложения или real-label print test. Gas здесь — локальная EVM без price assumptions.

Средовые проблемы не скрыты: sandbox cache ожидание первой compile, недоступный ps до разрешённого диагностического вызова, DNS restriction для curl (официальные данные получены read-only с разрешением),404 дополнительного IRNames.cpp (не использован как источник). Ошибки рабочих путей при запуске audit harness исправлены в аудитной копии; production не менялся. Offline npm audit output не свежий supply-chain audit. В logs сохраняются успешные проверки, а scope фиксирует неуспешные подготовительные попытки.
