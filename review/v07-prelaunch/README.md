# ODP 0.7: итог предзапусковой подготовки

**Вердикт: локальные проверки завершены; отправка в Polygon условна — deployment-кошелёк ещё не привязан.**
Mainnet-транзакций нет. Контракты не опубликованы, approvedGenerations остаётся пустым.
Это проверка текущего release и deployment-инструментов, не новый независимый аудит другим экспертом.

## Зафиксированный кандидат

ABI `0.7-redesign-6`, core + 9 satellites. Solidity в этом этапе не менялся.
Пакет: `../v07-no-stop/release.json`.
Canonical SHA256: `95cb88357a90ce962b1b8b710e9c57eb380fd28e74a34123c1b51365dd56322c`.
Исходное dirty/untracked дерево сохранено отдельно: `baseline-location.txt`, `baseline-manifest.json`.
Текущие файлы и отдельный hash deployment-инструментов: `final-source-manifest.json`.
Commit HEAD — только историческая привязка, не идентичность этого незакоммиченного выпуска.

## Проверено заново

- Независимая чистая директория, `npm ci --offline --ignore-scripts`: 272 пакета из кеша;
  install log сообщает 0 vulnerabilities, но это не онлайн-аудит актуальных advisories.
- Чистая компиляция: **полное равенство input/output** фиксированному release,
  lockfile совпадает, все **43 ABI/TypeChain файла** побайтно совпадают (`clean-equality.json`).
- **112 EVM-тестов**, **17 tools/finality-тестов**, эталонные векторы прошли.
  Доказательства: `evm.log`, `tools.log`, `vectors.log`, `clean-build.log`.
- 13 тестов ветки chain137 используют реальную локальную EDR EVM и два HTTP RPC наблюдателя:
  десять созданий, точные runtime/immutables, повторный resume, сбой planned/broadcast/pending/verified,
  неподдерживаемая/задержавшаяся finality, неверная сеть/runtime/canonical block, пропавший receipt,
  подменённые nonce/data, посторонний nonce, неверный адрес, бюджет, баланс и gas limit.
- Read-only preflight проверен без подписывающих RPC-вызовов. Комиссии читаются непосредственно из
  latest.baseFeePerGas и eth_maxPriorityFeePerGas каждого RPC; оценка cap = 2 × baseFee + priority.
  Этот расчёт не гарантирует включение будущей транзакции и не отменяет повторную проверку.
- Локальные наблюдатели используют **одну EVM**, finality симулируется. Это не проверка консенсуса
  Polygon, независимости операторов RPC или фактической mainnet-finality.

## Найдено и исправлено на этом этапе

1. **Неполная финальная сверка набора.** Если второй RPC менял runtime первого контракта во время
   последнего создания, прежняя реализация могла завершить manifest. PoC воспроизведён:
   `mainnet-path-initial.log` содержит failing test. Теперь перед completion повторно проверяется
   весь набор через оба RPC; соответствующий тест проходит.
2. **Неявные пределы отправки.** Зафиксированы адрес deployer, начальный nonce и последовательность
   десяти операций, chainId, gas limits, maxFee/priority и общий бюджет. На каждом шаге сверяются nonce,
   баланс, remaining worst-case cost и estimateGas. Resume не может незаметно изменить политику.
3. EstimateGas выполняется до сохранения planned entry: отказ оценки не создаёт ложную неопределённость
   «могло быть отправлено». После записи planned сохранён строгий recovery по проверенному tx hash.
4. Финальная проверка сравнивает transaction hash, inclusion block и fee caps с pinned plan.

Начальный полный прогон (`evm-initial.log`) также поймал несовпадение тестовой fee policy с котировкой;
preflight переведён на прямое чтение комиссий из указанных RPC, затем полный прогон повторён успешно.

## Проверка архитектурной дельты

Повторно просмотрены ObjectDigitalPassport, ODPSatellite, ODPRegistryRelations, ODPStatementJournal,
ODPPassportProofRegistry и соответствующие ABI/тесты. Удаление profile stop не добавило admin-права:
регистрация и role/issuer/author checks сохранены. Passport revoke остаётся только у issuer, с ненулевой
причиной и границей 72 часа. Это отдельная операция, не возвращение profile stop.

Statement/proof operation maps разделены по msg.sender; digest включает chain, registry, satellite,
caller и все аргументы операции. Exact replay проверяется до текущего lifecycle/calendar, а не создаёт
новую запись. Неуспешная транзакция не резервирует operationId. Исправление statement связывает только
собственные активные записи того же kind/passport. Внешние обращения идут в неизменяемый registry;
нового произвольного вызова или обхода прав в этой дельте не обнаружено. Это ограниченный вывод по
просмотренным путям, не доказательство отсутствия всех уязвимостей.

Ранее описанные границы сохраняются: самодекларируемые роли не подтверждают личность; данные/хеши не
доказывают физическую подлинность; доступность off-chain storage обеспечивается отдельно; при компрометации
ключа profile stop/recovery отсутствуют по выбранному дизайну. Предыдущие compiler/static результаты
сохранены в `../v07-no-stop/`, на этом этапе они не выдаются за новый прогон Slither.

## Gas и последовательность запуска

Локально: **12 440 211 gas**, сумма предложенных limits с округлённым 25% запасом: **15 600 000 gas**.
Подробности: `gas-measurements.json`. `local-rehearsal.json` содержит только локальные тестовые адреса:
**никогда не использовать их как Polygon deployment или approved generation**.

1. Получить публичный адрес и настроить соответствующий signer предусмотренным приватным способом.
   Приватный ключ в чат не нужен. Использовать отдельный от других отправок deployment account.
2. Заполнить `chain/deploy/mainnet.env.example` и копию `mainnet-spend-policy.example.json`:
   свежие fee caps и допустимый бюджет POL. Значения примера пока специально невалидны.
3. Запустить `node deploy/scripts/preflight-mainnet.mjs` из chain с экспортированными настройками.
   Требуются согласованные chain137, finalized block, nonce, достаточный баланс и текущие комиссии.
   Непривязанный кошелёк не позволяет выполнить этот шаг сейчас.
4. После успешного preflight отправить pinned release через `npm run deploy:mainnet`. На каждом шаге
   estimateGas учитывает уже созданный registry: спутники не оцениваются до существования его code.
   При сбое соблюдать recovery-процедуру, не удалять неопределённый план ради повторного деплоя.
5. Получить реальные receipts/runtime/finality, сверить source verification с standard-json input
   из release, затем отдельно утвердить generation для клиентов. Старый verify-all-polygon.sh намеренно
   отключён; его нельзя принимать за работающую проверку этого выпуска.

До выпуска паспортов приложение требует миграции на ABI6, утверждённый реальный generation и end-to-end
проверки импорта/экспорта/подписания. Развёртывание контрактов само по себе не закрывает готовность приложения.
