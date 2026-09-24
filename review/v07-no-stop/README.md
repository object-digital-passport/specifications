# ABI 0.7-redesign-6: stop удалён, подготовка Polygon mainnet

Решение пользователя от 2026-09-18: удалить stop полностью и, после успешной проверки,
развернуть сразу в Polygon mainnet. Amoy не требуется. Это разрешение на deployment нового проверенного
кандидата, не на публикацию GitHub и не на операции с существующими паспортами.

## Изменение протокола

- Удалены revokeCreator(), CreatorRevoked и revokedAt из CreatorRecord — и в core, и в IODPRegistry.
  getCreator теперь возвращает ровно4 поля: creatorId, wallet, typePrefix, timestamp.
- Удалены профильные stop-checks/EC131 из core и спутников. Внутренние helpers теперь проверяют регистрацию.
  Нет скрытого admin pause, blacklist или переименованного stop.
- Остаются регистрация кошелька один раз, C/B квоты, проверки ролей/автора/issuer, подписи,
  nonce/operation identity и revokePassport в пределах72h. Withdrawals и их история сохранены.
- Issuer может исправлять hosting locations и завершать отложенное открытие тиража. Потеря ключа,
  отзыв паспорта и неверный commitment всё ещё могут помешать открытию.
- При краже ключа его обладатель сохраняет те же права, что и владелец; profile stop и recovery больше нет.
- ABI6 несовместим с ABI5 profile decoder. SPEC, ABI/TypeChain, README/security/app handoff обновлены.
  Старые отчёты и release ABI5 остаются историческими и не предназначены для этого deployment.

## Доказательства

- Исходный dirty/untracked снимок481 файла: `/private/tmp/odp-before-no-stop-20260918`.
  HEAD не подменяет этот снимок. Хеши и долговременный путь: `baseline.json`.
- Полная сборка16 исходников: `compile.log`; все10 контрактов укладываются в EIP170: `eip170.log`.
  Core11649 bytes, journal6286, proof6684.
- EVM suite: `evm.log`; suite tools/finality: `tools.log`; vectors: `vectors.log`.
  Тесты доказывают отказ удалённого selector,4-field ABI, сохранение72h границы/прав,
  открытие тиража через90 дней, idempotency, release/runtime matching и recovery.
- 7 официальных compiler advisories для версии0.8.20 проверены по текущим settings/source AST:
  `compiler-review.json`, воспроизводящий `check-compiler.py`, сохранённый `solidity-bugs.json`.
  Найдено0 циклов в графе прямых Solidity-вызовов. Используется viaIR и стандартная последовательность
  optimizer. Триггеры описанных ошибок не обнаружены; это не доказательство отсутствия неизвестных bugs.
  Ограничение hashed storage slot overflow остаётся криптографическим допущением.
- Slither: success=true,32 findings (4H/5M/17L/6I); `slither-js.json` и log. High относятся к
  предсказуемым человекочитаемым ID/approximate quota bucket, а не генерации приватных unit keys.
  Profile-stop taint больше нет; сам счётчик предупреждений не определяет безопасность.
- Пакет `release.json` содержит точный input/output и10 артефактов. Packager дважды перекомпилировал
  стандартный input и сравнил с полной сборкой; журнал `release-build.log`.
  Canonical release hash: `sha256:95cb88357a90ce962b1b8b710e9c57eb380fd28e74a34123c1b51365dd56322c`.

## Mainnet

Целевая chainId137. PublicNode и dRPC проверены read-only: оба вернули137, finalized и одинаковый hash
общего блока. Доказательство с временем: `polygon-rpc-readonly.json`. Эти сервисы — внешние доверенные
источники RPC, не самостоятельное криптографическое доказательство цепи.

Deployment теперь требует второй RPC на137 до отправки. После каждого создания сверяются transaction,
receipt, canonical block, runtime/immutables через оба RPC и finalized block coverage. При задержке finality
ожидание ограничено120 секундами, затем run остаётся interrupted и восстанавливается проверенным resume.
Число confirmations не заменяет этот mainnet gate. Тесты проверяют lag/unsupported/canonical disagreement.

Неприватные параметры подготовлены в `chain/deploy/mainnet.env.example`. Подпись НЕ настроена:
PRIVATE_KEY отсутствует и в среде, и в двух предусмотренных локальных env-файлах. Пользователю задан
вопрос о публичном адресе и способе подключения deployment-кошелька. Не искались ключи других проектов,
не использовались тестовые ключи и не создавался незапрошенный кошелёк.

**Mainnet-транзакций нет.** После выбора signer требуется проверить его chain/address/nonce/balance,
оценить gas для точных10 creation payloads и выполнить deployment этого bundle. Затем получить
mainnet receipts/finality/runtime evidence и generation manifest. До этого approvedGenerations пуст.
Приложение отдельно требует миграции encoder/reader/profile decoder и end-to-end приёмки до реального
выпуска паспортов; это не требование разворачивать предварительную Amoy-генерацию.
