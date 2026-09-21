# Статический анализ исправленного кандидата

Slither завершил анализ успешно (`success: true`), CLI exit255 означает найденные предупреждения.
Скрытые/suppressed findings также включены. Сырой результат: `slither-js.json`, журнал: `slither-js.log`.
15 production Solidity sources; test wallet не включён в static input. Это отдельный состав от release
standard-json, где включён test wallet; bytecode статической сборки не используется для deployment.

Всего33: 4 High, 5 Medium, 18 Low, 6 Informational. Относительно предыдущего аудита добавлено одно
informational: cyclomatic complexity publishStatement стала14 после веток operation replay/conflict.
Не снижали счётчик удалением детекторов или игнорированием новых результатов.

- 4 weak-prng: three human-readable ID generators и approximate monthly bucket. Это не источники
  unit private keys или cryptographic author signatures. Генераторы проверяют занятость ID; предсказуемость
  сама по себе не даёт прав на чужую запись. Quota bucket остаётся приближённым, P/M permissionless.
- 5 incorrect-equality: equality для UTC месяца, profile identity и учёта quota. Границы проверяются EVM
  suite; это не сравнения переводимых ETH-балансов. Изменения journal/proof не добавили таких результатов.
- 18 timestamp: lifecycle/existence, UTC, expiry/revocation и переходы состояний. Время берётся из блока,
  не доказывает время события в физическом мире. Для нового journal replay статусы проверяются после
  operation mapping, поэтому stop/supersession не ломают recovery; это отдельно воспроизведено тестами.
- Informational: openEdition complexity12, publishStatement complexity14; assembly в signature recover;
  compiler-version и missing-inheritance. Новые ветки journal не выполняют внешние произвольные вызовы,
  не дают изменения старых payload и записывают operation лишь после успешной публикации.

Вывод ограничен: в новых предупреждениях не воспроизведена отдельная exploit-возможность. Это не
доказательство отсутствия ошибок. Старый compiler advisory review не переносится автоматически на новый
кандидат; compiler0.8.20 сохранён и требует отдельного решения перед публичным выпуском.
