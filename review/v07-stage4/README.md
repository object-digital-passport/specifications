# Контрактный этап ODP 0.7: ABI 0.7-redesign-4

## Реализовано

- Прямой issuer mint, без mint-agent; operationId защищает от повторного задания/конфликта.
- Core editionCommitment связывает сеть, core, issuer, спутник, nonce, root/count/labelSigner.
  Спутник проверяет commitment и одноразовый nonce issuer; старый тираж не расширяется.
- Новый `ODPStatementJournal`: собственные typed claims, immutable payload hash, исторические
  записи, явные связи замены, собственный отзыв после stop/revocation, ограниченная пагинация.
  Конкурирующая замена одного predecessor отклоняется после первой успешной транзакции.
- Issuer correction доступна и для старого/revoked паспорта; она не меняет core content и
  не расширяет право отзыва core после72ч. Author declaration публикует сам автор без issuer.
- В прежних proof/one-shot author satellites появились собственные отзывы. Getter исторической
  записи не равен текущему одобрению. Concern можно снять после stop, но нельзя поднять новый.
- ABI/TypeChain, export/size/deployment lists, generation schema (9 satellite roles), SPEC,
  statement JSON schema и CI обновлены. Тестовый wallet исключён из deployment lists.

## Проверки

- `tests.log`: **88 passing**. Включены contract-wallet caller и 40 воспроизводимых переходов
  lifecycle с проверкой неизменности истории и изоляции авторов. Это seeded scenario, не
  заявление о завершённом exhaustive fuzzing.
- `tools-tests.log`: **8 passing** для валидатора распакованного bundle.
- `vectors.log`: canonical/edition vectors проходят.
- `typecheck.log`: generated TypeScript проходит tsc (успех без вывода).
- `compile.log` / `clean-compile.log`: solc-js0.8.20, viaIR/runs1/Shanghai; все production
  контракты меньше24576bytes. Ядро12129, новый journal5903bytes.
- [Свежий Slither](STATIC_ANALYSIS.md): success=true, 32 предупреждения с ручным разбором.
  Сам по себе success=true не является security verdict.
- `artifacts.json`: SHA256 исходников/ABI и runtime templates. Immutable placeholders означают,
  что это не фактические runtime hashes ещё не существующего deployment.

## Приложение и границы выпуска

[Готовое задание для другой сессии](../../ODP_07_APP_HANDOFF.md) содержит конкретные ABI,
recovery flow, bundle, statements и verification UI. Репозиторий приложения здесь не менялся.
Историческая идентичность и offline trust — клиентские свидетельства, не новый owner/core field.

Контрактная реализация согласованного объёма выполнена локально. Это **не разрешение на выпуск**:
нет внешнего независимого ревью финального набора, утверждённой production сети/manifest,
реальных deployment адресов и сквозной проверки готового приложения. Код ещё находится в
незакоммиченном рабочем дереве; commit HEAD не описывает этот набор изменений.
Перед deployment зафиксировать reviewed sources/build, проверить актуальные compiler advisories,
репетицию итоговой конфигурации и получить отдельное разрешение пользователя. Ничего не
развёрнуто и не опубликовано. Открытые хранение/QR/NFC не реализованы в Solidity.

## Воспроизводимость чистой сборки

`generated-check.log`: две последовательные чистые сборки воспроизводят все **43** файла
ABI/TypeChain байт в байт. `tests-clean.log`: **88 passing** на чистой сборке.
При сравнении с накопленной incremental-сборкой отличался creation bytecode ядра и его
factory. Исходный снимок сохранён как `incremental-*`; release evidence — чистая сборка.
Причина различия compilation context отдельно не доказана; ни размер, ни одинаковый ABI
не заменяют byte-for-byte проверку. Перед фиксацией production build обязательно clean.

AST-проверка условий свежих compiler advisories: 127 функций, 103 ребра, 0 циклов;
см. `STATIC_ANALYSIS.md`. Переводные проверки теперь проходят hard-правила;
сохраняются soft-предупреждения о неполных исторических переводах (`translations.log`).
