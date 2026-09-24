# Дельта после запечатанного аудиторского пакета ABI6

**Summary (EN).** The sealed audit package `review/audit-handoff-abi6/` describes ABI `0.7-redesign-6`.
The working tree no longer matches it: the contracts, the exported ABI and the reference tools now identify
as ABI `0.7-redesign-7`, which adds role-specific revocation windows, irreversible print finalization and a
B-only rule for every non-unique edition model. **The sealed ABI6 audit does not certify ABI7.** This document
records the code delta, the documentation delta, the local check results and the unresolved conflicts.
It is not an audit, not a deployment approval and not a statement that any generation is deployed.

**Update 2026-09-24.** The current generation is `0.7-redesign-8`. It adds one immutable mint input,
`previewHash`, the SHA-256 of a lighter public copy of the primary photo, with errors `EC(142)` and `EC(143)`.
Section 6 records that ABI7 → ABI8 delta. The approved `0.7-redesign-7` bundle does not certify ABI8 either.

Дата этой редакции: **2026-09-20**. Базовый снимок: `review/audit-handoff-abi6/` (запечатан 2026-09-19).
Ничего внутри запечатанного пакета, ZIP, его MANIFEST/hashes и прежних отчётов не изменялось.

---

## 1. Почему этот документ существует

Запечатанный пакет — снимок состояния на момент передачи аудитору. После него в рабочем дереве были
изменены контракты. Аудиторский архив остаётся верным описанием **ABI6**; он перестал быть верным описанием
**текущих исходников**. Чтобы не выдавать одно за другое, дельта ведётся отдельно от пакета.

Практическое следствие: `review/audit-handoff-abi6/CLOSURE_MATRIX.md` (R01–R14), `TESTS_AND_ANALYSIS.md`,
`release/release.json` и canonical release hash
`sha256:95cb88357a90ce962b1b8b710e9c57eb380fd28e74a34123c1b51365dd56322c`
относятся к байтам ABI6. Ни один из них не подтверждает ABI7.

---

## 2. Дельта кода: ABI6 → ABI7

Проверено прямым сравнением `review/audit-handoff-abi6/SOURCE/chain/contracts/` с `chain/contracts/`.
Отличаются ровно два файла: `ObjectDigitalPassport.sol` и `IODPRegistry.sol`. Остальные восемь спутников,
`ODPPassportLib`, `ODPPassportTypes`, `ODPSatellite` и `ODPErrors` байт-в-байт совпадают с пакетом.

| № | Изменение | Где в коде |
|---|---|---|
| D2-1 | `REVOCATION_WINDOW` (единое окно 72 часа) заменено на `PERSONAL_REVOCATION_WINDOW = 72 hours` и `ISSUER_REVOCATION_WINDOW = 24 hours`. Срок выбирается по `typePrefix` профиля издателя: `C` — 72 часа, `B`/`P`/`M` — 24 часа. | `ObjectDigitalPassport.sol` — `_revocationDeadline`, `revokePassport` |
| D2-2 | Новая функция `finalizePassportForPrint(string passportId)`: только исходный issuer, необратимо, повтор — no-op, отклоняет несуществующий (`EC(12)`), чужого вызывающего (`EC(17)`) и отозванный (`EC(18)`) паспорт. Событие `PassportFinalizedForPrint`. | `ObjectDigitalPassport.sol` |
| D2-3 | Новая ошибка `PassportPrintFinalized()`: `revokePassport` после фиксации печати. Проверка стоит **до** проверки дедлайна. | `ObjectDigitalPassport.sol` — `revokePassport` |
| D2-4 | Новое чтение `getPassportReleaseState(id) → (uint256 revocationDeadline, uint256 printFinalizedAt)`; отклоняет несуществующий ID (`EC(12)`). | `ObjectDigitalPassport.sol`, `IODPRegistry.sol` |
| D2-5 | `IODPRegistry` получил `struct PassportReleaseView` и `getPassportReleaseState`. Спутники, скомпилированные против ABI6-интерфейса, несовместимы по составу интерфейса. | `IODPRegistry.sol` |
| D2-6 | Новое правило выпуска: **любой** неуникальный `editionModel` (2 limited, 3 open, 4 dynamic), даже без unit-якорей, требует профиль `B`; иначе `EC(121)`. Прежнее правило ограничивало только биты 4096/8192. | `ObjectDigitalPassport.sol` — `_validateEditionBits` |
| D2-7 | Идентификатор поколения поднят с `0.7-redesign-6` на `0.7-redesign-7`. | `chain/generations.json`, `deploy/scripts/release.mjs`, `deploy-generation.mjs`, `preflight-mainnet.mjs`, `export-abi.mjs`, `schema/bundle-0.7/examples/generation.json` |
| D2-8 | `chain/abi/*.json` пересобран: core ABI содержит `finalizePassportForPrint`, `getPassportReleaseState`, `PERSONAL_REVOCATION_WINDOW`, `ISSUER_REVOCATION_WINDOW` и ошибку `PassportPrintFinalized`; `REVOCATION_WINDOW` отсутствует. | `chain/abi/ObjectDigitalPassport.json`, `chain/abi/IODPRegistry.json` |
| D2-9 | Reference tool `prepareIssuance` требует `issuerType` и отклоняет неуникальную модель для `C`/`P`/`M` (`Only B…`). | `chain/tools/passport.mjs`, тест `chain/tools/test/remediation.test.mjs` |

Что **не** менялось между ABI6 и ABI7: удаление profile stop, четырёхполевой `getCreator`, модель
`operationId` для mint/journal/proof и её digest-домены, typed `editionCommitment`, `openEdition`,
активация, journal lifecycle, concerns, hosting, profile directory, relations, author attestation,
wallet document anchor, каноническое хеширование и формат `.odpass`.

### Что ABI7 не делает

- `finalizePassportForPrint` не наблюдает принтер, не открывает тираж и не меняет lifecycle спутников.
  Это отметка в реестре, а не контроль над физической печатью. Внешнюю печать он предотвратить не может.
- Фиксация печати не защищает от компрометации ключа: тот же ключ может зафиксировать паспорт и тем
  закрыть собственное окно отзыва.
- Сокращение окна для `B`/`P`/`M` до 24 часов уменьшает время на исправление собственной ошибки.
  Это продуктовый компромисс, а не защита от кражи ключа.
- Правило «неуникальная модель — только `B`» — ограничение выпуска, а не проверка того, что тираж
  действительно существует.

---

## 3. Дельта документации (эта редакция)

Нормативной остаётся английская `SPEC.md`. Переводы передают ту же семантику и не создают новых требований.

### 3.1 Созданные документы

| Файл | Назначение |
|---|---|
| `ODP_07_ABI6_DOCUMENTATION_DELTA.md` | Этот документ. На него ссылались 28 файлов, и его не существовало. |
| `docs/GLOSSARY.md` | Глоссарий текущего поколения (EN). На него ссылались 9 файлов, и его не существовало. |
| `docs/ru/GLOSSARY.md` | Русский глоссарий. На него ссылались 9 файлов, и его не существовало. |

Кроме того, `ODP_07_APP_HANDOFF.md` ссылался на несуществующий `ODP_07_ABI7_D2_IMPLEMENTATION.md`; ссылка
переведена на этот документ, чтобы описание дельты не расходилось в двух местах.

### 3.2 Таблица «устаревшее утверждение → актуальная формулировка → основание»

| Где | Устаревшее утверждение | Актуальная формулировка | Основание в коде или решении |
|---|---|---|---|
| `SPEC.md` §21 | Таблица ошибок названа «ABI6 integration table», строки — «ABI6 result»; `PassportPrintFinalized` отсутствует | Таблица названа по текущему поколению; добавлены строки `finalizePassportForPrint` и `PassportPrintFinalized` | `ObjectDigitalPassport.sol` `revokePassport`/`finalizePassportForPrint`; `chain/abi/ObjectDigitalPassport.json` |
| `README.md`, `README.ru.md` (шапка) | «Current ABI6 documentation» / «Документация ABI6» | Текущее поколение — `0.7-redesign-7`; запечатанный пакет описывает `0.7-redesign-6` | `chain/generations.json`, `deploy/scripts/release.mjs` |
| `ODP_07_IMPLEMENTATION.md` заголовок и §1 | «Текущее состояние ABI 0.7-redesign-6»; «отзыв… до 72 часов включительно» | ABI `0.7-redesign-7`; окно 72 ч для `C` и 24 ч для `B`/`P`/`M`, и только до фиксации печати | `_revocationDeadline`, `PERSONAL_REVOCATION_WINDOW`, `ISSUER_REVOCATION_WINDOW` |
| `ODP_07_ACTION_PLAN.md` статус | «текущий план для ABI `0.7-redesign-6`» | План относится к `0.7-redesign-7`; перечислена дельта D2 и её незакрытые следствия | раздел 2 этого документа |
| `docs/PROTOCOL_TRACKS.md`, `docs/ru/PROTOCOL_TRACKS.md` | «ABI 0.7-redesign-6»; «issuer revoke within 72h» | `0.7-redesign-7`; «72 ч для C / 24 ч для B/P/M, только до фиксации печати»; добавлена строка про печать | те же константы; `finalizePassportForPrint` |
| `docs/README.md`, `docs/ru/README-docs.md` | «ABI 0.7-redesign-6» в заголовке | `0.7-redesign-7`, с указанием, что запечатанный пакет — ABI6 | `chain/generations.json` |
| `docs/SECURITY.md` | «ABI6 removes profile stop entirely» без идентификатора поколения | Поколение названо явно; добавлено, что фиксация печати необратима и не защищает от компрометации ключа | `ObjectDigitalPassport.sol`; решение пользователя об удалении stop |
| `docs/VERSIONING_AND_RELEASES.md`, `docs/ru/…` | «ODP 0.7 uses ABI `0.7-redesign-6`» | `0.7-redesign-7`; байт версии 7 по-прежнему не различает ABI | `CONTRACT_VERSION`; `SPEC.md` §14 |
| `docs/EIP170_STRATEGY.md`, `docs/ru/…` | Измерения названы «ABI6 byte counts» как текущие | Измерения явно отнесены к ABI6; для ABI7 пересборка и новые числа не выполнены | `review/audit-handoff-abi6/TESTS_AND_ANALYSIS.md` |
| `chain/deploy/README.md` §«Final prelaunch checks» | «Solidity is unchanged by this documentation pass; release hash remains `sha256:95cb88…`» | Solidity изменён после пакета; закреплённый bundle остаётся ABI6 и **не** принимается текущими скриптами | `deploy-generation.mjs:17`, `preflight-mainnet.mjs:9`, `review/v07-no-stop/release.json` |
| `chain/tools/README.md` | «ABI6 signatures», «ABI6 has no profile stop» | Сигнатуры и отсутствие stop отнесены к текущему поколению | `chain/abi/*.json` |
| `schema/vectors/README.md` | «retained ABI6 digest fixture» | Фикстура операций не изменилась в ABI7; имя файла — происхождение, не селектор ABI | `chain/tools/operations.mjs`; digest-домены в контрактах не менялись |
| `ODP_07_APP_HANDOFF.md` | «миграция приложения к redesign-6»; «в reference tooling redesign-6…»; «revokePassport (72 часа)»; «stop в ABI6 отсутствует» | Миграция к `0.7-redesign-7`; окно 72/24 ч; добавлено требование к печатному шлюзу | раздел 2, D2-1…D2-4 |
| `ODP_07_APP_HANDOFF.md` строка 1 | Ссылка на несуществующий `ODP_07_ABI7_D2_IMPLEMENTATION.md` | Ссылка ведёт на этот документ | проверка ссылок, раздел 4 |
| `ODP_07_RELEASE_DECISIONS.md`, `ODP_07_CONSOLIDATED_REMEDIATION_PLAN.md`, `ODP_07_ARCHITECTURE_OPTIONS.md`, `ODP_CONCERNS_SATELLITE.md`, `ODP_REGISTRY_REDESIGN.md` (шапки) | «не инструкции для ABI6… issuer revoke сохранён до 72 часов» | «не инструкции для `0.7-redesign-7`… окно 72 ч для C и 24 ч для B/P/M, только до фиксации печати» | те же константы |
| `ODP_REGISTRY_REDESIGN.md` §«Отзыв» | Проект содержит `revokeCreator`, `CreatorRevoked`, `EC(131)`, `REVOCATION_WINDOW` | Текст сохранён как история проектирования; в шапке раздела указано, что эти элементы в реализации отсутствуют | `SPEC.md` §3; отсутствие селекторов проверяется тестом `ODP07.test.js:83` |
| `ODP_07_INDEPENDENT_AUDIT_TASK.md` | «текущая локальная ABI — `0.7-redesign-4`» | Задание относится к своему этапу; текущая ABI — `0.7-redesign-7` | `chain/generations.json` |
| `docs/ru/SPEC.md` | «отзыв активным издателем до 72 часов включительно» | «до 72 часов для C и до 24 часов для B/P/M, и только до фиксации печати» | `_revocationDeadline` |

Старые решения не удалены. Там, где они заменены, это сказано в шапке документа с указанием,
где искать текущее правило.

---

## 4. Локальные проверки

Выполнены офлайн, без кошелька, без публичных сетей, без deployment и публикации.

| Проверка | Команда | Результат |
|---|---|---|
| Эталонные векторы | `npm run vectors` (в `chain/`) | **OK** — «All four bundle vectors and edition v2 generator match» |
| Тесты reference tools | `npm run test:tools` | **18 / 18 pass**, включая `ABI7 issuance checks registered role before any nonunique declaration` |
| Контрактные тесты | `npx hardhat test` | **116 pass, 15 fail** — две причины, обе в коде, см. раздел 5 |
| Ссылки в Markdown | локальный обход всех относительных ссылок вне `review/` и `node_modules` | было 33 файла с битыми ссылками, стало 6 — только заведомо внешние и исторические (раздел 5.5) |
| Таблица переводов | `node tools/check-translations.mjs` | **hard-проверки проходят**: добавлены строки для `docs/GLOSSARY.md`/`docs/ru/GLOSSARY.md`, этого документа и ранее не учтённого `ODP_07_CONSOLIDATED_REMEDIATION_PLAN.md`. Остаются 5 прежних soft-находок, включая `docs/ru/SPEC.md` — намеренный указатель |
| Ссылки профиля организации | `node tools/check-profile-links.mjs` | **OK**, 12 ссылок |
| Сборка сайта спецификации | `node tools/build-spec.mjs` | **OK**: `index.html`, `objectid-profile.html`, `security.html`, схема — все непустые |
| Целостность запечатанного пакета | пересчёт SHA256 по `MANIFEST.json` и по ZIP | **1687 / 1687 совпали**, 0 расхождений; SHA256 архива совпал с `ODP-0.7-ABI6-AUDIT.zip.sha256` и `audit-handoff-verification.json`. Пакет не изменялся |

`npm run compile` намеренно не запускался: он перегенерирует отслеживаемые `chain/abi/` и `chain/types/`.
Запуск `npx hardhat test` изменил три файла TypeChain (`index.ts`, `factories/index.ts`, `hardhat.d.ts`)
из-за недетерминированного порядка экспорта; они возвращены к байтам, которые были до запуска, так что
рабочее дерево по составу и содержимому не отличается от исходного, кроме правок документации.

---

## 5. Оставшиеся противоречия и решения, которые нужно принять

Ни одно из них не исправлялось в коде: это задача на согласование документации, а перечисленное ниже
затрагивает права, безопасность или принятое продуктовое решение.

### 5.1 Идентификатор поколения в поручении не совпадает с деревом

Поручение называет текущей реализацию ABI `0.7-redesign-6`. Рабочее дерево и все инструменты
идентифицируют себя как `0.7-redesign-7`. Документация приведена к тому, что действительно
реализовано, то есть к `0.7-redesign-7`. **Требуется подтверждение**, что поднятие идентификатора —
принятое решение, а не побочный эффект правки.

### 5.2 Окно отзыва в поручении не совпадает с кодом; решение D2 уже принято

Поручение описывает `revokePassport` как «окно 72 часа и ненулевая причина». Код реализует **два** окна
(72 ч для `C`, 24 ч для `B`/`P`/`M`) и дополнительный барьер `PassportPrintFinalized`. `SPEC.md` §8 уже
описывает поведение кода.

Основание для кода есть и оно зафиксировано раньше: `review/usage-safety-abi6/CLOSURE.md`, пункт **D2** —
«Продуктовое решение принято: C 72h, B/P/M 24h, необратимая фиксация перед печатью; только B выпускает
тиражи», с прямым подтверждением пользователя. Значит расхождение — между формулировкой поручения и уже
принятым решением, а не между SPEC и кодом. Документация приведена к решению D2 и к коду.

Что остаётся открытым:

- Строка статуса D2 в `review/usage-safety-abi6/CLOSURE.md` («текущий код всё ещё даёт всем 72h и не
  содержит фиксации печати») устарела: код её уже реализует. Сам журнал решений не правился, потому что
  лежит рядом с аудитом; актуальное состояние — здесь.
- D2 назван там блокером deployment «до реализации и проверки». Реализация есть; **проверка не завершена**:
  перечисленный в CLOSURE.md список приёмки (роли, точные границы 24/72 ч, чужой caller, повтор фиксации,
  `revoked→фиксация`, `фиксация→revoke`, гонка транзакций, timeout/reorg, отсутствие print export до
  подтверждения, отмена задания после фиксации, обычный паспорт без тиража, сторонняя преждевременная
  печать, устаревший offline-статус) частично относится к приложению, которое печатного шлюза не имеет.
- D2 не внесён как решение в `ODP_07_RELEASE_DECISIONS.md`. **Требуется решение**: перенести его туда как
  действующее, чтобы журнал решений не расходился с реализацией.
- Сужение окна для `B`/`P`/`M` до 24 часов и фиксация печати аудитором `0.7-redesign-6` не рассматривались.

### 5.3 Закреплённый release-бандл остаётся ABI6 — deployment неработоспособен

`deploy/scripts/deploy-generation.mjs:17` и `preflight-mainnet.mjs:9` требуют
`release.abiGeneration === '0.7-redesign-7'`. Единственный имеющийся бандл
`review/v07-no-stop/release.json` имеет `abiGeneration: "0.7-redesign-6"`, `sourceCommit 5d1db8f…`,
и его core ABI содержит `REVOCATION_WINDOW` без `finalizePassportForPrint` и `getPassportReleaseState`.
Поэтому **13 из 15 падающих тестов** — это `Error: Unapproved release bundle` / `Unapproved release`.

Следствия:
- описанная в `chain/deploy/README.md` процедура «фиксированный release + проверяемый manifest/resume»
  сейчас не может быть выполнена ни для ABI6 (отвергается по идентификатору), ни для ABI7 (бандла нет);
- canonical release hash `sha256:95cb88…` больше не является хешем текущих исходников;
- утверждение «десять контрактов сверяются в конце» остаётся верным для процедуры, но непроверяемым
  на текущих байтах.

**Обновление 2026-09-21: кандидат собран, не утверждён.** Офлайн-бандл для `0.7-redesign-7` лежит в
[`review/v07-abi7-release/`](review/v07-abi7-release/README.md), canonical hash
`sha256:91c9ee4a9eb27f6b8ada9bf2bbcd394fafbe5d9dbfae539efa4e53ce0d5b76f7`. Тот же закреплённый
компилятор, ABI побайтно совпадает с `chain/abi/`, `ODP07MainnetPath.test.js` против него в изолированной
копии — 13 / 13 pass. Репозиторий при сборке не менялся.

**Закрыто 2026-09-21.** Владелец утвердил этот хеш с оговоркой, что код ещё может измениться: любое
изменение исходников даёт новый хеш и требует нового утверждения. `ODP07MainnetPath.test.js` переключён на
`review/v07-abi7-release/release.json`. Утверждение хеша не разрешает deployment: кошелёк, сеть и
публикация по-прежнему запрещены.

### 5.4 Правило «неуникальная модель — только B» противоречит поставляемым примерам

`schema/examples/0.7/physical.json` объявляет `edition.model = "limited"`, а `mixed.json` —
`"dynamic"`. Тест `ODP07Bundle.test.js` регистрирует для них профиль `C`. С правилом D2-6 оба выпуска
теперь отвергаются с `EC(121)` — это оставшиеся **2 из 15** падающих тестов.

Те же модели стоят в `schema/vectors/physical.passport.json` и `mixed.passport.json`. Хеш-векторы
проходят, потому что проверяют каноническое кодирование, а не право выпуска.

Дополнительно: `preparePassport` (в отличие от `prepareIssuance`) не требует `issuerType` и выдаёт
mint-tuple, который затем гарантированно отвергается ядром. Это расхождение внутри reference tools.

Правило не случайно: `review/usage-safety-abi6/CLOSURE.md`, D2 — «Только B выпускает тиражи… Ограничение
тиражей требуется проверить также на уровне classification/schema/preflight: существующая проверка B для
unit_key_set/openEdition сама по себе не доказывает запрета всех деклараций limited/open/dynamic без этих
anchors». Контракт выполняет именно это требование. Значит устарели **фикстуры**, а не правило.

**Требуется работа в коде, не в документации**: привести `schema/examples/0.7/physical.json`,
`mixed.json`, соответствующие `schema/vectors/*.passport.json` и профиль в `ODP07Bundle.test.js` в
соответствие с правилом — отдельным проверенным изменением протокольных фикстур, с пересчётом эталонных
хешей. Заодно решить, должен ли `preparePassport` требовать `issuerType` так же, как `prepareIssuance`.
Ни примеры, ни векторы, ни тесты, ни контракт в этой работе не менялись.

**Закрыто 2026-09-21 (вариант 1, выбран владельцем).** Правило осталось строгим; примеры приведены к нему.
В `schema/examples/0.7/physical.json` и `mixed.json` и в `schema/vectors/physical|mixed.passport.json`
`edition` заменён на `{"model": "unique"}`. Пересчитаны `*.canonical.json` и `*.expected.json`:
physical `dataHash` `0x4dafcd…975e` → `0xcecd76bc…10d7`, mixed `0xc23a77…d568` → `0x90ebef12…8fd3`;
`anchorsHash` не изменились. Контракт и тесты не менялись. Итог: `npm run vectors` OK,
`npm run test:tools` 18 / 18, `npx hardhat test` **131 / 131**. Вопрос о `preparePassport` закрыт
тем же днём: необязательный `issuerType` включает правило B-only, проверяющие его не передают; `test:tools` 19 / 19.

### 5.5 Прочие незакрытые ссылки

Осознанно не исправлялись, потому что относятся к внешним или историческим объектам:

- `docs/CONTRIBUTING.md`, `docs/ru/CONTRIBUTING.md` — ссылки на GitHub-фильтры issue (внешние);
- `ODP_ASTRA_REVIEW.md` → `chain/deploy/test/ODPAstraReview.test.js` — исторический отчёт ссылается на
  удалённый тест прежней базы;
- `docs/EDITION_ISSUER_TOOL.md`, `docs/ru/EDITION_ISSUER_TOOL.md` → `ODPEditionVectors.test.js` —
  то же, в документе, уже помеченном как исторический;
- `docs/ru/RELEASE_v0.3.md` → удалённые `contracts/examples/*.sol` линии 0.3.

### 5.6 Границы, сохраняющиеся по модели

- Реестр фиксирует заявления, действия кошельков и хеши. Он не доказывает личность, собственность
  или физическую подлинность.
- Самообъявленная роль `P`/`M` — не аккредитация. Подпись выбранного issuer ключа в one-shot слоте
  автора не устанавливает личность автора.
- Восстановления утраченных ключей, скрытых кодов или оригиналов из хешей нет.
- Неизменяемы payload, карточка и история; изменяемы lifecycle-состояния (revoked, статусы заявлений,
  hosting-адреса, фиксация печати).
- Необратимы: регистрация профиля, mint, отзыв паспорта, фиксация печати, открытие тиража,
  занятие one-shot слота автора. Окно исправления ошибки ограничено и после него закрыто.
- Утверждённой production generation нет. Готовность контрактов, приложения и выдачи паспортов —
  три разных статуса, ни один из которых не подтверждён этой работой.
- Приложение не реализует печатный шлюз. `finalizePassportForPrint` нельзя описывать как работающую
  защиту от печати отзываемого паспорта, пока клиент этого не реализовал и это не принято.

---

## 6. Дельта ABI7 → ABI8 (`0.7-redesign-8`, 2026-09-24)

Основание — решения владельца от 2026-09-24 о хранении фото, оплате публикации и спонсоре газа. Исследования
хранения и оплаты лежат вне репозитория; их выводы перенесены в SPEC §22.19 и §22.20. Контракты, схемы,
инструменты и новый release-бандл меняет отдельная работа (`chain/**`, `schema/**`, `review/v07-abi8-release/`).
Этот раздел описывает утверждённый интерфейс и документацию; код он не проверяет.

### 6.1 Интерфейс

| № | Изменение | Где |
|---|---|---|
| D3-1 | В `PassportMintInputs` новое поле `bytes32 previewHash` сразу после `imageHash`. Порядок: `core, dataHash, imageHash, previewHash, fileHash, anchorsHash, anchorTypesMask, editionCommitment`. | `IODPRegistry.sol`, `ObjectDigitalPassport.sol` |
| D3-2 | `PassportMediaView` (`getPassportMedia`) возвращает `previewHash` сразу после `imageHash`. | `IODPRegistry.sol` |
| D3-3 | `previewHash` — SHA-256 точных байтов облегчённой публичной копии главного фото (JPEG ≤ 1 048 576 байт, без GPS и метаданных местоположения). `bytes32(0)` — копии нет. Поле неизменяемо. | SPEC §8 |
| D3-4 | Ненулевой `previewHash` при нулевом `imageHash` отклоняется с `EC(142)`; `previewHash == imageHash` (ненулевые) — с `EC(143)`. Размер, формат и метаданные контракт не проверяет. | SPEC §8, §21.1 |
| D3-5 | Mint-digest охватывает поле, потому что оно входит в кортеж `m`. Digest операций выпуска из ABI7 для ABI8 не годится; digest journal и proof не меняются. | SPEC §3 |
| D3-6 | Событие `PassportMinted` не меняется. `CONTRACT_VERSION` остаётся 7. Идентификатор поколения — `0.7-redesign-8`. | SPEC §7, §14 |
| D3-7 | В `passport.json` копия описывается не более чем одним якорем `{"type":"photo","data":{"role":"preview"},"hash":"sha256:<hex>"}`, только при наличии `photo` с `role: "primary"`. Якорь есть тогда и только тогда, когда `previewHash != 0`, и его хеш равен `previewHash`. Новый бит маски не добавляется. | SPEC §9, §11 |
| D3-8 | Файл копии — обычный payload `files/<sha256hex>`; `.odpass` содержит и оригинал, и копию. | SPEC §15 |

### 6.2 Правила клиента

| Раздел SPEC | Что добавлено |
|---|---|
| §22.19, CA-19.1–19.11 | Копия делается только при решении опубликовать фото; превью именно копии перед публикацией; копия в `.odpass`; публикация `.odpass` без копии; IPFS-адрес из хеша (CIDv1, raw, sha2-256, один блок ≤ 1 МиБ); несколько адресов в `ODPHosting`; несколько шлюзов и проверка по хешу; загрузка после подтверждения mint; три способа оплаты (бесплатный лимит, POL из кошелька пользователя, спонсор) без продаж и секретов в приложении; приватность. |
| §22.20, CA-20.1–20.6 | Кошелёк только через WalletConnect; спонсор газа в 0.7 только пополняет адрес POL; «Запросить POL» на адрес приёма спонсора с подписью `personal_sign`; запасной путь через меню «Поделиться»; что видит спонсор; relayer отложен. |
| §22.5, CA-5.8–5.10; §22.6, CA-6.6 | Граница UTC-месяца для Safe-предложений mint и `submitProof`: предупреждение, статус «неисполнимо» (Safe 1.4.1, `GS013`, nonce не расходуется), отклоняющая транзакция с тем же nonce, переподготовка с тем же `operationId`; риск не успеть к 24-часовому окну отзыва. Основание — `review/logic-recheck-abi7/REPORT.ru.md`, п. 2. |
| §7, §21.2 | Amoy не используется (решение владельца 2026-09-24). Deployment не выполнялся, адресов нет. Бандлы ABI6 и ABI7 текущие исходники не описывают. |

`ODPHosting.sol` проверен на совместимость с несколькими адресами в одном поле: контракт ограничивает только
длину (`EC(138)` при > 512 байт) и строку не разбирает, так что список через пробел допустим без изменения кода.

### 6.3 Документация

| Где | Было | Стало |
|---|---|---|
| `SPEC.md` шапка, §7, §13, §21 | `0.7-redesign-7` как текущее поколение | `0.7-redesign-8`; ABI7 названо прошлым снимком |
| `SPEC.md` §8, §9, §11, §15, §19 | Нет `previewHash`; «Storage providers and distribution policy remain undecided» | Поле, якорь `preview`, проверка в алгоритме, копия в бандле, ссылка на §22.19; сервисы и шлюзы — заменяемое удобство |
| `SPEC.md` §21.1 | Таблица ошибок ABI7 | Добавлены `EC(142)` и `EC(143)` |
| `README.md`, `README.ru.md`, `docs/README.md`, `docs/ru/README-docs.md`, `docs/GLOSSARY.md`, `docs/ru/GLOSSARY.md`, `docs/SECURITY.md`, `docs/ru/SECURITY.md`, `docs/PROTOCOL_TRACKS.md`, `docs/ru/PROTOCOL_TRACKS.md`, `docs/VERSIONING_AND_RELEASES.md`, `docs/ru/VERSIONING_AND_RELEASES.md`, `docs/EIP170_STRATEGY.md`, `docs/ru/EIP170_STRATEGY.md`, `docs/ru/SPEC.md` | `0.7-redesign-7`; «Amoy не обязателен» | `0.7-redesign-8`; `previewHash`, спонсор газа; Amoy не используется |
| Шапки исторических документов в `docs/` и `docs/ru/`, `ODP_07_RELEASE_DECISIONS.md`, `ODP_07_CONSOLIDATED_REMEDIATION_PLAN.md`, `ODP_07_ARCHITECTURE_OPTIONS.md` | «не инструкции для `0.7-redesign-7`» | «не инструкции для `0.7-redesign-8`» |
| `ODP_07_IMPLEMENTATION.md`, `ODP_07_ACTION_PLAN.md`, `ODP_07_INDEPENDENT_AUDIT_TASK.md` | Текущая ABI `0.7-redesign-7`; единственный бандл — ABI6 | Текущая ABI `0.7-redesign-8`; бандлы ABI6 и ABI7 прошлые; добавлен тестовый вектор CID как открытый пункт |

Разделы 1–5 выше не переписывались: они описывают переход ABI6 → ABI7 и остаются историей.

### 6.4 Открыто

- Эквивалентность CID из хеша и CID от `ipfs add` (Kubo, Helia) выведена из спецификаций IPFS, но не проверена.
  До релиза нужен тестовый вектор, включая файл ровно 1 048 576 байт.
- Release-бандл для `0.7-redesign-8` не собран и не утверждён; deployment по-прежнему неисполним и требует
  отдельного разрешения.
- Код ABI8, схема `passport-0.7`, `chain/tools` и векторы меняются отдельной работой. Совпадение кода с этим
  разделом и с SPEC нужно проверить после неё.
- Оплата публикации криптовалютой в приложении — серая зона правил App Store (п. 3.1.1); бесплатный путь и
  спонсор этой зоны не касаются.
