# Компилятор и воспроизводимость

## Фактическая сборка

Node v22.23.2, npm (точная версия в logs/environment.log), Hardhat из package-lock после `npm ci --offline`; solc-js `0.8.20+commit.a1b79de6`, viaIR=true, optimizer enabled/runs1, EVM Shanghai, metadata.bytecodeHash=none, без custom optimizerSteps. Компилятор не менялся. Полный standard-json и split output сохранены в clean1-artifacts/build-info; hash soljson в static-coverage.json.

Первая sandbox-компиляция ожидала доступ к global compiler cache (permission retry в Hardhat); локальная повторная компиляция с разрешённым cache доступом завершилась. Это ошибка среды, не Solidity finding. npm ci выполнен из lockfile с локальным npm cache; найденных npm уязвимостей0 в offline-выводе нельзя считать актуальным dependency security audit.

Две последовательные clean builds полного набора совпали: все43 ABI/TypeChain файла и JSON contract artifacts. Исходные snapshot ABI/TypeChain тоже совпали с clean1. `build-comparison.json` фиксирует hashes. Все десять production runtime templates меньше EIP-170: core12129, units6482, author4966, concerns4529, hosting3821, directory2495, relations7255, proofs6205, wallet2507, journal5903 байта. Immutable placeholders не являются deployed runtime hash. Локальные actual runtime hashes записаны EVM harness для тестовой цепи31337; они не предназначены для production.

Core SHA-256 (bytes, без `0x`):

- Creation: `2dc4e8def7a63ef61f898a33e9865cae04e3a01b2309385841bdc6650cde6733`.
- Runtime: `3228afef876d5c7e850716aed12c34684672b60d286b9bcb702b2a1fd9129162`.

Factory.bytecode для всех10 production names совпал с Hardhat artifact; общий IODPRegistry совпал по selectors/return tuple в свежем baseline тесте. Generated TypeScript прошёл tsc. Тестовый ODPTestWallet компилируется, но отсутствует в deployment/export production lists; его presence в compilation input всё равно входит в build identity.

## Почему bytecode зависит от состава compilation unit

Проверка не ограничилась двумя одинаковыми clean builds. `compiler-context.mjs` независимо компилирует неизменные core/lib/types/errors с теми же settings, но в subset источников. `compiler-full-ir.mjs` компилирует полный input с выводом IR. Добавление IR в outputSelection не меняет clean hash.

Результаты:

| Input | Creation SHA256 | Runtime SHA256 |
|---|---|---|
| Полный | 2dc4e8def7a63ef61f898a33e9865cae04e3a01b2309385841bdc6650cde6733 | 3228afef876d5c7e850716aed12c34684672b60d286b9bcb702b2a1fd9129162 |
| Только core dependencies | 6315814799aa5ac075175e9063166708abbe0cb0c4e84a9cc8d93236277e36cd | 09cbc4424f378579803e88736ec3d785db3d57c196c2aae7d8b66d4a89565d21 |
| Полный без journal | 8847175c03adf2316daee2c062c27ee8ddc1a85a7967085726de6e020235dd1f | 2e99850c1b1202f312980c1b1ccbc23169a8b374622f8876192c3e292d7916ec |

`compare-ir.py`: исходный неоптимизированный Yul имеет44003 tokens в обоих вариантах;1653 согласованных переименования внутренних identifiers, иных token differences после удаления source annotations нет. Это alpha equivalence, не сравнение только размеров.

В оптимизированном IR `_mintCommit` spill-переменная m хранится по0xe0 в полном варианте и0x0140 в subset; соответствующие reads и другие offsets также меняются. `optimizer-stripped.diff` показывает и запись, и использование. Runtime subset на2 байта длиннее из-за изменённой формы PUSH. Это реальное изменение инструкций, не только metadata hash.

Причина механизма: состав source unit меняет AST-derived имена, от которых зависит порядок optimizer allocation. Официальный [StackLimitEvader.cpp 0.8.20](https://github.com/ethereum/solidity/blob/v0.8.20/libyul/optimiser/StackLimitEvader.cpp) (локальная копия рядом) распределяет unreachable variables по именованным map/set (строки73–107). Наблюдаемые memory offsets согласуются с этим алгоритмом. Само различие не доказывает неправильное исполнение или collision.

Исторические stage2/incremental hashes соответствуют друг другу, но отличаются от clean **и creation, и runtime**. Старый полный standard-json input/output не сохранён в текущем дереве; есть лишь сводные hashes. Поэтому точный прежний hash не воспроизведён, и нельзя утверждать forensic-полноту происхождения той старой сборки. Механизм compilation-context различия теперь подтверждён собственным контролируемым экспериментом. Release candidate должен быть именно полным clean input с pinned hash; переносить безопасность между произвольными incremental variants нельзя.

## Актуальные compiler advisories

Официальный [реестр Solidity bugs](https://docs.soliditylang.org/en/latest/bugs.html) проверен 2026-09-18; исходный JSON сохранён рядом. Для диапазона0.8.20 отобраны7 записей (`compiler-applicable-version.json`). Проверка условий:

| Advisory | Оценка текущего кода/settings |
|---|---|
| SOL-2026-5 | viaIR=true исключает указанный legacy путь |
| SOL-2026-4 | Не найдена взаимная рекурсия |
| SOL-2026-2 | Не найдены циклы взаимной рекурсии |
| SOL-2025-1 | Нет custom storage layout; достижение границы хешированной storage динамическими массивами не имеет реалистичного сценария в этом коде |
| SOL-2023-3 | Solidity sources, нет пользовательского verbatim Yul |
| SOL-2023-2 | Стандартный optimizer sequence, custom steps отсутствуют |
| SOL-2023-1 | Используется IR pipeline |

Более новые introduced versions исключены по диапазону; fixed≤0.8.20 исключены как исправленные. Собственный AST screen полного build-output:127 functions with body,103 resolved call edges,0 cycles,0 user Yul functions; delete operands — storage/scalars. Assembly блоки прочитаны вручную и только извлекают r/s/v из calldata.

Это screening необходимых условий известных bugs, **не общее доказательство корректности compiler/optimizer**. Не проводилась машинная эквивалентность optimized bytecode или сравнение с новым compiler. Перед deployment разумно отдельно решить, принимать ли0.8.20, либо пересобрать на выбранном исправленном compiler и повторить весь bytecode audit. Молчаливой смены compiler в данном аудите не было.
