# ODP 0.7 — этап 1: прямой выпуск и защита от повтора

Локальная ABI `0.7-redesign-2`, без развёртывания. Удалены все mint-agent роли/состояние/события и principal-selector. Издатель всегда msg.sender. Событие PassportMinted содержит operationId вместо mintAgent; classification больше не содержит mintAgent.

Mint принимает bytes32 operationId. Неудачная первая транзакция ничего не резервирует; успешная фиксирует digest полного mint и ID результата. Повтор сообщает AlreadyCommitted, изменение payload — MintOperationConflict. Ключ scoped к issuer, digest дополнительно связан с chain/registry/типом mint. Чтение результата остаётся доступным после stop/revoke/смены месяца. Это не запрет одинаковых документов и не гарантия уникальности физического объекта.

## Проверено

- Исходные существующие artifacts: 66 passing (`baseline-no-compile.log`). Обычный baseline npm test был остановлен во время ожидания компилятора; это не успешный clean build.
- Новая компиляция solc-js 0.8.20: успешно (`compile.log`); core 11865 bytes, все контракты ниже EIP-170. Hardhat потребовался доступ к глобальному compiler cache.
- Полный новый прогон: **71 passing** (`tests-final.log`). 3 устаревших agent-handshake теста заменены 8 сценариями прямого выпуска/идемпотентности. Сохранены 1000 mint, 250 concern transitions, 101 raiser и прежние сценарии других подсистем.
- Проверены точный retry, изменение каждого поля, тип mint, scope разных issuer/registry, ошибочный initial mint, старый calldata, stop/revoke/month rollover, квота и две ожидающие транзакции одного задания.
- Канонические векторы: совпадают (`vectors.log`).

Исходные ошибки переноса тестов сохранены в промежуточных logs, не считаются контрактными findings. Сборка перегенерировала актуальные ABI/TypeChain; старый tracked TypeChain не восстанавливался, так как он должен соответствовать изменённому исходному коду.

## Граница

Это результат этапа 1, не финальный release audit. Старый Slither-отчёт не проверяет новую operation mapping. Durable client journal, edition commitment, lifecycle утверждений и полный .odpass importer/exporter ещё впереди. Хранение/компактная этикетка отложены до конца; реальные ключи и публичные сети не использовались.
