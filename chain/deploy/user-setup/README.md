# Локальные настройки deployment (ABI `0.7-redesign-8`)

Актуальная процедура — [release/deployment](../README.md). Цель: Polygon mainnet (137), Amoy не требуется.
**Сейчас запрещены подключение кошелька, внешние RPC, deployment и публикация.** Этот документ описывает будущий отдельно разрешённый запуск; сейчас не нужно создавать или заполнять файлы с ключами.

## Секреты и opt-in

`chain/hardhat.config.ts` загружает `chain/deploy/.env` и затем `user-setup/private.local.env` с override только при `ODP_ENABLE_DEPLOY=1`. Compile/test без этого флага не загружают реальные кошельки. Ключ `PRIVATE_KEY` хранится локально вне git и не передаётся в чат, логи, примеры или архив аудитору. API credentials в RPC URL также секретны.

## Входы будущего запуска

Несекретные шаблоны: [mainnet.env.example](../mainnet.env.example), [spend policy](../mainnet-spend-policy.example.json). Они не являются утверждёнными параметрами mainnet. **Release-бандла для текущей ABI сейчас не существует**, поэтому заполнить `ODP_RELEASE_BUNDLE`/`ODP_RELEASE_HASH` нечем: см. [дельту, раздел 5.3](../../../ODP_07_ABI6_DOCUMENTATION_DELTA.md). Нужны фиксированные `ODP_RELEASE_BUNDLE`/`ODP_RELEASE_HASH`, `ODP_GENERATION_ID`, `ODP_DEPLOY_MANIFEST`, chainId 137, подтверждения, deployer address, два отдельных RPC и утверждённые ограничения gas/fee/total POL. Placeholder fee caps намеренно невалидны.

После нового разрешения read-only preflight запускается из `chain/` командой `node deploy/scripts/preflight-mainnet.mjs`; он обращается к двум RPC, хотя не загружает ключ. Сам deployment — `npm run deploy:mainnet` из `chain/`, с opt-in и всеми проверенными входами. Он использует `--no-compile` и только release bytes.

Выход — указанный manifest и `<manifest>.generation.json`, а не старые `polygon.json`/`abi.json`. Candidate не равен approved generation. Resume требует той же identity, nonce plan и spend policy; неизвестную отправку нельзя обходить новым manifest или повторным deployment. См. основной runbook для сверки recovery transaction hashes.

Старые команды `deploy.sh`, вызовы из корня и компиляция непосредственно перед сетевой отправкой не являются текущей процедурой. Публичный RPC по умолчанию в конфигурации не разрешает сетевой доступ.
