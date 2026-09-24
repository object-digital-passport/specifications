# Свежий статический анализ ABI 0.7-redesign-4

Slither 0.11.6, solc-js 0.8.20, viaIR, optimizer runs=1, Shanghai.
`slither-js.json`: success=true; 32 результата: 4 High, 5 Medium, 18 Low, 5 Informational.
Проверены все production Solidity sources одним standard-json compilation unit;
вывод Slither считает 14 contracts (включая abstract/library), развёртываемых контрактов 10.
Тестовый ODPTestWallet не входит в этот production-анализ.
`--show-ignored-findings` включён: inline-подавления не скрывают weak-prng.
Код выхода255 означает наличие детектов, а не неуспех анализа.

## Разбор

- **High weak-prng (4)**: `_generatePassportId`, `_generateCreatorNumber`, `_generateProofId`
  используют управляемые/предсказуемые блоковые данные для читаемых ID. Это не источник
  unit keys, подписи или полномочий. Проверка занятости не даёт перезаписать существующую
  запись; лимит25 попыток остаётся вероятностной границей отказа. `_currentMonth` с `%`
  считает приблизительный квотный период, не случайность. Это сохранённые ограничения
  текущей модели, не доказательство криптографической случайности.
- **Medium incorrect-equality (5)**: проверки UTC месяца/года, пустого профиля и фиксированного
  типа C/B/P/M. Равенство здесь задаёт допустимые значения; принудительный перевод средств
  или изменение баланса в этих выражениях не участвует.
- **Low timestamp (18)**: календарь, 72ч, сроки хостингового разрешения и stop/lifecycle timestamps.
  В journal детектор помечает author/status из структур, также содержащих timestamp;
  доступ определяется wallet и enum, а не сравнением с управляемым временем блока.
  В остальных местах время блока намеренно является on-chain временем, не датой события
  физического мира. Тесты проверяют 72ч и отзыв после stop; это не доказательство всех границ.
- **Informational assembly (2)**: старые ECDSA декодеры, длина65, low-s, v и zero-recovery
  проверяются. Новый journal не добавляет signature recovery или delegatecall.
- **Informational cyclomatic-complexity (1)**: валидатор mint inputs ядра; предупреждение
  о сложности, а не найденный обход. Негативные тесты полей и commitments сохранены.
- **Informational missing-inheritance (1)**: core структурно реализует IODPRegistry без
  явного inheritance; тест проверяет одинаковые селекторы/return tuples общей ABI.
- **Informational solc-version (1)**: версия закреплена в Hardhat, предупреждение остаётся.
  Исторический разбор известных compiler bugs — `review/v07/STATIC_ANALYSIS.md`.
  Он не заменяет свежую проверку актуального списка compiler advisories перед release.

Нового подтверждённого обхода полномочий этими детектами не установлено. Это не внешний
аудит и не гарантия отсутствия ошибок. Новые claims требуют независимо проверенной
личности автора; доступность payload и полнота истории остаются задачами приложения.

## Воспроизведение

Установить Slither 0.11.6 в отдельный venv, использовать уже проверенный soljson0.8.20:

```
python3 review/v07-stage4/run-slither-js.py /path/to/venv/bin/slither /path/to/soljson-v0.8.20+commit.a1b79de6.js
```

`solcjs-cli.mjs` использует wrapper установленного Hardhat и standard-json API компилятора,
а не переписывает код/AST для анализатора. Все production imports включены как content.
Неудачная попытка native x86 compiler на ARM сохранена в `slither/`; это ошибка среды,
а не результат проверки контрактов. Успешный анализ — именно `slither-js.json`.

## Дополнительная проверка compiler advisories, 2026-09-18

Проверены свежие официальные сообщения:
- [Spill Slot Collision Across Mutual Recursion](https://www.soliditylang.org/blog/2026/09/10/spill-slot-collision-across-mutual-recursion-bug/): важное необходимое условие — взаимная рекурсия.
- [Memory Byte Array Element Delete](https://www.soliditylang.org/blog/2026/09/10/memory-byte-array-element-delete-clears-whole-word-bug/): условие — delete элемента bytes в memory.

`check-ast.mjs` на текущих production sources: 127 функций с телом, 103 разрешённых ребра,
0 циклов, 0 inline-assembly function definitions. Все найденные delete относятся к
storage/scalar expressions, а не bytes memory. По этим необходимым условиям триггеры
указанных двух advisories в исходниках не обнаружены. Это screening известных условий,
не исчерпывающая проверка optimizer/Yul и не полный актуальный реестр compiler bugs.
Результат: `ast-check.json`. Компилятор не менялся молча между тестами и артефактами.
