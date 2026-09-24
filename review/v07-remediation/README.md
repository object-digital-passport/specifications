# Исправления объединённого аудита: кандидат ABI 0.7-redesign-5

Дата: 2026-09-18. **Контрактный и reference-tool блок исправлен и локально проверен; публичный выпуск
0.7 пока не готов.** Остатки не считаются автоматически принятыми рисками.

Перед изменениями сохранён отдельный снимок454 tracked/untracked файлов. HEAD
`5d1db8fdd1c7bef013cdd98875671b9c9e9e4760` описывает только git provenance, не проверяемую реализацию.
`baseline.json` фиксирует снимок и изменения относительно него; ни один исходный файл снимка не удалён.
Не выполнялись git reset/stash/checkout/clean, коммит, push, публикация или публичный deployment.

## Что изменено

1. Journal и institutional proof registry получили обязательный operationId, digest/getters/events,
   conflict/exact-replay errors. Восстановление результата работает до проверки stop/revoke/calendar.
   Failed initial call не резервирует ID. Права stop/withdraw и core revocation не расширены.
2. Новый ABI `0.7-redesign-5`, пересобранные ABI и TypeChain, актуализированные SPEC/generation examples
   и app handoff. Протокол остаётся0.7; ABI4 selectors для этих двух методов несовместимы.
3. Исправлены custom anchor mask (включая prototype names), fatal UTF-8/BOM, zero edition root.
   Issuance preflight/CLI требуют полный address list; bundle проверяет его точные bytes/hash/count/tree.
4. Добавлены mint/journal/proof reference digests, фиксированные vectors, statement envelope validator
   и отдельные capability statuses. Integrity не подтверждает личность, chain evidence или физическую подлинность.
5. Deployment создаёт контракты только из утверждённого hash release bundle. Packager сверяет полный
   source roster, два результата компиляции и build-info. Проверяется точная creation transaction и весь
   runtime с вычислением immutable bytes; ambient artifacts не используются.
6. Manifest записывается до broadcast, включает полные transaction data, защищён lock, flush/atomic rename.
   Resume проверяет все старые записи перед новой отправкой; known-hash recovery не заменяет уже записанный
   hash. Неизвестная транзакция блокирует продолжение. Converter формирует полный nine-role generation.
   Confirmation count обязателен; повторный успешный resume не развёртывает второй комплект.
7. NatSpec author attestation теперь явно описывает issuer-chosen key/one-shot slot и пределы доказательства.

## Проверки и доказательства

- Полная компиляция16 Solidity sources solc0.8.20 viaIR, optimizer1, Shanghai: `compile.log`.
- **98 EVM tests passed**, `evm.log`. Включая exact/conflicting replay, failed reservation, независимых callers,
  stop/revoke/supersession/withdraw/calendar; JS ↔ Solidity digests; десять pinned factories; runtime с immutables;
  mismatch transaction/runtime; generation schema; четыре crash stages; resume без повторного deploy;
  изменённые release/identity и tampered candidate.
- **15 Node tool tests passed**, `tools.log`: malformed raw UTF-8 CLI (с проверкой причины отказа), BOM,
  prototype names, nonzero root, odd Merkle tree, tampered count/order/root/format, required list before issuance,
  statement envelope, operation vectors и bundle structure/cross-file checks.
- Канонические vectors четырёх типов и edition generator совпали: `vectors.log`.
- Все десять runtimes меньше24576 bytes: `eip170.log`; core12129, journal6425, proof6827.
- Offline packager дважды перекомпилировал exact standard-json и сравнил полный output с build-info:
  `release-build.log`. Кандидат `release.json`, canonical release SHA256:
  `be9f7e8f01ac55408ccba4df822a3d81cd27410edb055eb154fbf8d447ae5392`.
  Это hash структуры release, а не raw JSON-файла. Bytecode package не является одобренным deployment.
- Slither завершил анализ,33 предупреждения (4H/5M/18L/6I), включая новый journal complexity14.
  Разбор: [STATIC_REVIEW.md](STATIC_REVIEW.md). Сырые данные и suppression-включающий журнал сохранены.

## Что ещё требуется

Полная таблица R01–R14: [CLOSURE_MATRIX.md](CLOSURE_MATRIX.md).
Продуктовые решения: [DECISIONS.md](DECISIONS.md).

До публичного выпуска остаются: независимый review финального кандидата/компилятора; сеть и finality;
интеграция ABI5 и durable operations в приложение; mint→open recovery; безопасный ZIP/URL pipeline;
проверка chain/status/history; независимая проверка QR/crypto/carrier перед физическим выпуском;
availability и trust/Sybil semantics. Вопрос D2 о revokePassport после stop задан пользователю, но пока
не разрешён; текущие права сохранены. Никакая зелёная suite не подменяет эти требования.

## Как воспроизвести

Из `chain/`: `npx hardhat compile --force`, `npm run compile`, `npm run test:tools`, `npm run vectors`,
`npx hardhat test --no-compile`. Release packaging и recovery описаны в [deploy README](../../chain/deploy/README.md).
Тесты используют только локальную EVM; opt-in `ODP_ENABLE_DEPLOY` для тестов не нужен и не должен включаться.
Для Slither: `python3 review/v07-remediation/run-slither-js.py PATH_TO_SLITHER PATH_TO_SOLJSON`
из корня checkout. Этот запуск не должен перезаписывать папки прежних аудитов.


Точечная read-only сверка соседнего `apple-app` подтверждает реальный блокер интеграции:
`RegistryMintCall.swift` ещё кодирует старый mint с principal/URL/bool/string, а `CreatorRegistryPolicy`
проверяет только byte version7 и оставляет approvedDeployment=nil. Это несовместимо с текущим core ABI,
независимо от journal/proof. Подставлять новый адрес до миграции encoder/reader/receipt нельзя.
Хеши двух просмотренных файлов и HEAD: `app-compatibility-observation.json`. Полный аудит/исправления
соседнего приложения в этом контрактном блоке не выполнялись.
