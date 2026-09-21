# ODP 0.7 — этап 2: обязательство тиража

Текущая ABI `0.7-redesign-3` несовместима с предыдущими локальными ABI. Контракты не развёрнуты. Включает этап 1 (прямой выпуск и operationId).

## Изменено

- В mint tuple и media view добавлен bytes32 editionCommitment; он сохраняется в неизменяемой записи core. Для unit_key_set он ненулевой, для остальных паспортов нулевой. Поддерживаются limited/open как конечные неизменяемые выпуски.
- Спутник проверяет раскрытие chain/registry/issuer/satellite/nonce/root/count/labelSigner против core. Формат фиксирован в SPEC §20.2; JS encoder и Solidity commitmentFor совпадают.
- Один issuer nonce открывается в одном спутнике только один раз, даже после revocation. Ошибка параметров не занимает слот/nonce.
- preparePassport для edition требует issuer address; verifyPassport пересчитывает commitment из документа и header.creator. JSON по-прежнему нужно аутентифицировать и сравнивать: Solidity его не разбирает.
- Сохранено правило открытия только активным issuer. Разрешение любому courier завершать opening после stop не внедрено без отдельного решения о правах. После opening прежние правила активации сохраняются.
- Receipt schema теперь содержит operationId; синтетические service-file примеры не являются deployment или полным bundle.

## Проверено

- `compile.log`: solc-js 0.8.20, viaIR, optimizer runs=1, Shanghai. Core **12129 bytes**, EditionUnits **6482 bytes**. Все контракты укладываются в EIP-170; внешних library links нет.
- `tests.log`: **77 passing**, в том числе 8 тестов operation identity этапа 1 и 6 тестов core-to-satellite commitment этого этапа.
- Отрицательные сценарии: изменение каждого edition поля, другой спутник/issuer, повтор nonce под другим паспортом, повтор после отзыва, пропуск/лишний commitment, неверная модель. Исторический namespace не заменяется вторым спутником.
- Сохранились проверки 1000 mint, 101 raiser, 250 seeded concern transitions, odd/even Merkle trees и четырёх document→EVM→reader roundtrips.
- `vectors.log`: канонические файлы/хеши и key-derivation vectors совпадают; `typecheck.log`: generated TypeScript проверен без диагностик.
- ABI и TypeChain перегенерированы из текущих источников. `artifacts.json` сохраняет hashes исходников и compiled templates; это не deployed runtime hashes.

Команда локального прогона: `cd chain && npm run compile && npx hardhat test --no-compile && node tools/check-vectors.mjs`.

## Не закрыто этим этапом

- Новый статический анализ и независимый внешний аудит; отчёт Slither из review/v07 исторический.
- Жизненный цикл исправлений/отзывов утверждений, полный .odpass importer/exporter, durable wallet submission journal, типизированные результаты unsupported/offline evidence.
- Две транзакции mint/open остаются; stop между ними мешает opening. Перед выдачей нужны подтверждённое opening и проверка document commitment.
- Уникальность nonce ограничена issuer+satellite; нет глобальной защиты от дублирования физической вещи или копирования публичного содержания.
- NFC отложен, хранение и окончательная этикетка не выбраны. Никаких реальных ключей, публикаций или публичных транзакций.
