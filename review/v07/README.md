# Воспроизведение итоговой проверки0.7

Рабочий каталог — корень этого репозитория. Все проверки локальные; ключи не нужны.

```sh
cd chain
npm ci
npx hardhat clean
npm run check
```

`check` = compile + EIP-170 + экспорт ABI + schema/semantic/vector checks + Hardhat tests.
Node22.23.2, npm10.9.8, Hardhat3.15.0, solc0.8.20+commit.a1b79de6, solc-js,
optimizer1, viaIR, Shanghai, metadata hash none. `preferWasm:true` устраняет зависимость от Rosetta.
В sandbox Codex доступ к глобальному compiler cache требовал разрешённого запуска за пределами sandbox;
установка/сборка не загружали файлы настоящих ключей, ODP_ENABLE_DEPLOY не включался.

## Evidence

- `npm-ci.log` — чистая установка итогового lockfile.
- `check.log` — сборка, размеры всех девяти runtime, векторы и итог тестов.
- `artifacts.json` — хеши исходников/ABI/bytecode templates и настройки. Это не хеши развёрнутых адресов.
- `slither/*.json`, `slither/*.log`, `STATIC_ANALYSIS.md` — результаты и ручной разбор Slither0.11.6.
- `typecheck.log` — TypeScript noEmit для сгенерированных интерфейсов, без диагностик.
- `rebuild.log`, `generated-hashes.json`, `check-generated.mjs` — повторная чистая сборка36 ABI/TypeChain-файлов.
- `independent-variants.log`, `check-variant-independent.py` — проверка5 вариантных листьев/доказательств на Python stdlib.
- `independent-vectors.log`, `check-edition-independent.py` — независимая Python-проверка ключей/деревьев.
- `callgraph.json`, `check-callgraph.py` — проверка отсутствия рекурсии в графе Solidity-вызовов.
- `baseline-model-rerun.json` — неизменность старой математической модели после переноса её входов в архив.
- `translations.log`, `profile-links.log`, `release-notes.log`, `site.log` — вспомогательные проверки.
- `native-compiler-environment-error.log` — первый отказ native solc (неподдерживаемая архитектура).
- `path-encoding-regression.log` — выявленная и исправленная ошибка URL→filesystem пути с кириллицей.

Для сравнения TypeChain/ABI сначала сохраните их копию, затем повторите clean compile и сравните побайтно.
В CI: `git diff --exit-code -- types abi` из chain/ после commit согласованного набора файлов.
Сейчас изменения не закоммичены, поэтому обычный git diff естественно показывает новый ABI против старого.

## Дополнительные проверки

Из корня:

```sh
node review/v07/export-evidence.mjs
node review/astra/check-models.mjs
node tools/check-translations.mjs
node tools/check-profile-links.mjs
node chain/tools/lint_release_notes.mjs
node tools/build-spec.mjs /tmp/odp-spec-preview
```

Slither установлен в отдельном временном Python-окружении. Для воспроизведения создайте venv,
установите `slither-analyzer==0.11.6`, укажите исполняемый solc0.8.20 для своей архитектуры:

```sh
python3 review/v07/run-slither.py /path/to/venv /path/to/solc-0.8.20
/path/to/venv/bin/python review/v07/check-edition-independent.py
python3 review/v07/check-callgraph.py /path/to/solc-0.8.20
```

Python-проверка использует eth-keys0.8.0 и eth-hash0.8.0 (зависимости Slither), hashlib/HMAC — стандартные.
Slither с `--show-ignored-findings` намеренно показывает в том числе известные weak-prng срабатывания.
Выход255 не означает, что compilation упала: смотрите success/error в JSON и классификацию в отчёте.

Не выполнять deploy/verify/freeze/network smoke для воспроизведения. Исторические165 тестов запускаются
по отдельной инструкции `review/astra/REPRODUCE.md` на точном старом git archive, не на новом ABI.

`npm run compile` нормализует порядок TypeChain barrel exports и overloads; компилятор и factory-байты не патчатся. Итоговый suite:66 passing.
