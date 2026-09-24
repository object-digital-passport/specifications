# Матрица закрытия объединённых находок

Статусы относятся к текущему локальному кандидату. «Исправлено» не означает одобрение deployment.
Исходные доказательства сохранены в `../combined-v07/sources/`; исторические отчёты не переписаны.

| Пункт | Статус | Реализовано и проверено | Остаток до выпуска |
|---|---|---|---|
| R01 / IA-01 / Opus F-01 | Исправлено в release/deploy tooling | Полный input/output, exact source roster, два compile, pinned bundle hash; создание из bundle; сравнение transaction и всего runtime, включая immutables | Независимый review пакета, compiler/network approval; CI чистого checkout |
| R02 / F-05 | Исправлено локально | Full nine-role generation converter; persisted plan/data/tx; lock; повторная проверка при resume; known-hash recovery; crash tests четырёх стадий; повторный complete без новых deployments | При неизвестной транзакции автоматической chain-history discovery нет: безопасный отказ. Реальная сеть/финальность не проверялись |
| R03 / IA-03 / F-03 | Контракты исправлены, приложение открыто | operationId journal/proof, full digest, per-author getter/event, exact replay/conflict before lifecycle, no failed reservation; ABI5 | Durable jobs в приложении, timeout/replacement/reorg integration |
| R04 / IA-04 / F-02 | Решение открыто | Права не расширены, текущие stop/withdraw boundaries проверяются | Ответ D2 и модель компрометации/уведомлений; невозможность восстановления полномочий старого ключа |
| R05 / IA-04 | Частично | Сохранён active-only open; обязательный workflow зафиксирован | Приложение: persisted mint→open workflow, crash/restart recovery, запрет stop при незавершённом выпуске |
| R06 / IA-02 | Исправлено в reference tools | Nonzero root в schema/preflight; exact list bytes/hash/count/tree; обязательный list для issuance API и CLI; bundle проверяет дерево | Интеграция reference требований в независимые клиенты |
| R07 / IA-05 | Исправлено | Fatal UTF-8/BOM rejection, CLI raw-byte regression; bundle/statement/release reads strict | Те же гарантии в app ZIP/JSON decoder |
| R08 / F-08 | Исправлено | Object.hasOwn; пять adversarial имён; bit31 assertions | Нет локального остатка |
| R09 / IA-06 / F-11 | Reference часть исправлена | Mint/journal/proof digest references+vectors+EVM cross-check; canonical statement envelope verification; per-anchor/method unsupported reporting | Клиентские экраны/evidence freshness и независимый decoder |
| R10 / F-04 | Открыто перед физическим выпуском | Имеющиеся crypto vectors проходят, алгоритм не менялся | Финальный QR/wire profile, независимая реализация, carrier round-trip, backup/secret-production workflow |
| R11 | Частично | Bundle byte/hash/tree/namespace checks и exact candidate generation | Безопасный ZIP importer/exporter, limits/bombs/paths/duplicates, chain evidence/finality/reorg, app end-to-end |
| R12 / F-06 | Открыто в приложении | Остаточный stopped-hosting риск и URL policy включены в handoff | Реальная защита fetch/redirects/private IP/active content/size; UI отказ от автоматического доверия |
| R13 / F-07 | Документация исправлена | NatSpec явно объясняет issuer-chosen key/slot и независимую идентификацию | Проверка идентичности и lifecycle в UI; on-chain semantics сознательно не менялись |
| R14 / F-09/F-10/F-12 | Частично | Exact standard-json reproducibility; свежий Slither и разбор нового предупреждения | Compiler choice/bugs review, finality, Sybil/trust labels, availability policy, повторный независимый аудит кандидата |
