> Изменение D2: см. [ODP_07_ABI6_DOCUMENTATION_DELTA.md](ODP_07_ABI6_DOCUMENTATION_DELTA.md), раздел 2. `0.7-redesign-7` добавляет окна отзыва по роли (72 часа для C, 24 часа для B/P/M), `finalizePassportForPrint`, `getPassportReleaseState`, ошибку `PassportPrintFinalized()` и правило «любая неуникальная модель тиража — только профиль B». Экспорт на печать ОБЯЗАН оставаться недоступным до подтверждённой фиксации, неотозванного статуса и, для тиражей, совпадающего подтверждённого open/commitment. Этот репозиторий печатный шлюз не реализует. Выводы аудита `0.7-redesign-6` текущую ABI не подтверждают.

> ABI `0.7-redesign-7`. Цель — Polygon mainnet, без обязательного Amoy. По последнему поручению запрещены подключение кошелька и любые внешние сетевые действия; это задание не разрешает deployment. Готовность приложения в этой работе не проверялась.

# Задача для сессии приложения: интеграция ODP 0.7

Работай в репозитории приложения, начиная с `docs/CONTINUE_HERE.md`, если он существует.
Проверь текущую ветку и незакоммиченные изменения, сохрани существующую работу.
Ниже — задача на реализацию, а не просьба составить ещё один план. Не меняй контрактную
модель по старым заметкам. Не разворачивай контракты, не используй реальные ключи,
не публикуй изменения на GitHub и не подставляй адреса v0.6/старой v0.7.

## Источник истины

Сначала проверь, что в контрактном отчёте действительно указана ABI `0.7-redesign-7`: рабочее дерево может развиваться после этой передачи.

Локальный репозиторий спецификации:
`/Users/Andrei/Проекты/GitHub/Object Digital Passport/specifications`

Прочитай:
- `SPEC.md` — актуальная нормативная спецификация;
- `review/audit-handoff-abi6/README.md` — зафиксированный пакет прежней `0.7-redesign-6`;
- `ODP_07_ABI6_DOCUMENTATION_DELTA.md` — дельта кода и документации после фиксации пакета и открытые противоречия;
- `docs/ru/GLOSSARY.md` — термины текущего поколения и список отменённых;
- `chain/abi/*.json` и `chain/types/ethers-contracts/` — актуальные интерфейсы;
- `schema/passport-0.7.schema.json`, `schema/bundle-0.7/`, `schema/statement-0.7.schema.json`;
- `chain/tools/passport.mjs`, `edition-commitment.mjs`, `canonical.mjs`, `edition.mjs`, `bundle.mjs`, `operations.mjs`, `statement.mjs`;
- `chain/deploy/test/ODP07Issuance.test.js`, `ODP07EditionCommitment.test.js`, `ODP07Statements.test.js`.

Версия продукта/документа — **0.7**. Текущая локальная ABI — **0.7-redesign-7**.
Byte version 7 не различает старые несовместимые ABI. `chain/generations.json` пока
содержит пустой approvedGenerations. Адресов утверждённого deployment нет. Делай
интеграцию на fixture/mock/local evidence; реальный выпуск должен оставаться заблокирован.
Синтетический example generation не является доверенным deployment.

## 1. Прямой выпуск и журнал незавершённых операций

Удалить mint-agent/on-behalf UX и старые ABI-вызовы. Выпускает сам зарегистрированный
исходный issuer. Хостинговые разрешения — отдельная функция; их не удалять по аналогии.

До отправки транзакции атомарно сохранить durable job: chainId, registry, issuer wallet,
ABI generation, entrypoint, все mint inputs, неизменные канонические bytes документа,
оригиналы и случайный ненулевой bytes32 operationId. После перезапуска нельзя создавать
новый operationId автоматически для того же задания. Сохранить hash транзакции,
состояния submitted/unknown/confirmed/conflict и локальные ошибки отдельно от chain result.

API: `mintPhysical`, `mintDigital`, `mintMixed` принимают `(PassportMintInputs, operationId)`.
Последнее поле mint tuple — `editionCommitment`. Получать точный tuple из ABI.
Из старых header/classification удалён mintAgent; не декодировать старые positional tuples.

- `AlreadyCommitted(operationId, passportId)` — повтор уже состоявшегося задания;
  перепроверить результат в правильном namespace и восстановить успех, не выпускать копию.
- `MintOperationConflict(operationId)` — другие параметры под тем же ID; остановить,
  не подменять ID и не исправлять данные молча.
- `InvalidOperationId()` — ошибка клиента.
- `getMintOperation(issuer, operationId)` возвращает digest + passportId; нулевой digest
  и пустой ID означают отсутствие подтверждённого задания на выбранном блоке, не обязательно
  отсутствие pending транзакции. Проверить transaction receipt и reorg/finality.
- `MintOperationCommitted` и `PassportMinted`: декодировать по текущей ABI. Последнее поле
  PassportMinted теперь operationId. Receipt должен указывать фактически успешную транзакцию.

Нельзя менять подготовленный year/month после неизвестного результата отправки. При смене
месяца сначала разрешить судьбу старого задания; контракт ищет replay прежде calendar check.
Явно новый выпуск может использовать новый ID и тот же dataHash — глобального запрета копий нет.

## 2. Тираж: подготовка → mint → open

До mint сохранить nonce, полный публичный address list, root, count, labelSigner и
неизменяемые chain/registry/edition satellite. Секреты хранить отдельно от публичного архива.
Использовать эталон `chain/tools/edition-commitment.mjs`, включая ABI encoding, а не packed.
`editionCommitment = keccak256(abi.encode("ODP-EDITION-COMMITMENT-0.7", chainId,
registry, issuer, satellite, editionNonce, merkleRoot, uint32(unitCount), labelSigner))`.
Точные типы и домен сверить с helper и тестом. Для паспорта без unit_key_set — bytes32 zero.

После подтверждённого mint вызвать openEdition с теми же параметрами. Это отдельная
транзакция; хранить её прогресс независимо. Mint успешен, open не состоялся — показать
«паспорт создан, тираж ещё не открыт», а не выдавать ещё один паспорт. Для open по-прежнему
нужен исходный issuer и nonrevoked passport. Перед повтором прочитать getEdition.
`EditionCommitmentMismatch` — конфликт данных/namespace; `EditionNonceAlreadyUsed(passportId)` —
nonce уже открыт этим issuer в этом спутнике. После revocation nonce не освобождается.
Новая допечатка = новый тираж + новый паспорт + новые nonce/ключи. Расширения старого нет.
Старый спутник закреплён навсегда; автоматической миграции активаций нет.

## 3. Полный переносимый .odpass

Реализовать создание и безопасный импорт ZIP с расширением .odpass. В корне точные имена:
`passport.json`, `generation.json`, `receipt.json`, `manifest.json`; payload — `files/<sha256hex>`.
Внешнее имя произвольное и не является ID. Шаблоны и строгие схемы — в bundle-0.7.
Generation содержит полные адреса core и всех **девяти** satellite roles, включая
`statement-journal`; отсутствующие роли явно перечислены. Receipt содержит operationId.
Подлинность generation устанавливать по независимо доверенному manifest, не по содержимому
полученного архива. Закрепить final manifest только после разрешённого deployment.

Нельзя переписывать passport.json после mint: passportId там остаётся null; receipt хранит
выданный ID отдельно. Фото и цифровые оригиналы входят в архив, проверяются по байтам.
Нельзя потерять оригинал и назвать архив полным, удалив его из manifest. Для общего тиража
вложить полный address list; восстановить Merkle root. Для индивидуального пакета проверить
index, proof, variant/salt в правильном namespace; не раскрывать чужие секреты/коды.
Точный формат индивидуального пакета, если ещё не задан, оформить отдельной схемой и
тестовыми векторами, не изобретать несовместимое кодирование в UI.

`chain/tools/bundle.mjs` уже проверяет распакованные entries и базовые межфайловые связи.
Это **не ZIP importer** и не проверка chain evidence. В reference tooling redesign-6 добавлена полная проверка дерева по address list. Реализовать ограничения
на entries, размеры, распаковку и nesting; запрет дублей, path traversal, symlink, encrypted ZIP,
неожиданных путей, wrapper directory, BOM, неправильного UTF-8, дубликатов JSON keys.
Проверять ограничения до выделения больших буферов/записи. Не извлекать недоверенный ZIP
поверх пользовательских файлов. Детерминированный export/import roundtrip должен сохранять
точные passport/original bytes; метаданные ZIP не входят в dataHash.

Перенос на другой сайт меняет только транспорт. Содержание паспорта и фотографии не менять.
Локальное фото читать из .odpass — отдельное зеркало фотографии для этого не требуется.

## 4. Утверждения, отзывы и история

Подключить новый `ODPStatementJournal`: прямые транзакции зарегистрированного
автора, включая contract wallets; off-chain signature forwarding не реализован.
`publishStatement(passportId, kind, payloadHash, previousId, operationId)`:
kind 1 issuer correction (только issuer, можно об old/revoked passport),
2 author declaration (собственный claim любого зарегистрированного профиля),
3 institutional assessment (зарегистрированный P/M); 2/3 — только о nonrevoked passport.
Профиль/роль сами по себе не доказывают личность/аккредитацию.

Payload: canonical JSON по statement-0.7.schema.json, SHA-256. Проверить все поля subject,
journal, author, kind, previousId против chain record. Контракт не парсит JSON и не гарантирует
наличие документа. `previousId=0` — независимое заявление; другое значение заменяет только
своё Active заявление того же kind/passport. Первое подтверждённое обновление выигрывает,
второе с устаревшим previousId получает StatementNotActive; показать конфликт, не перепривязать
автоматически. Независимые заявления не сводить к «последнее истинное».

`retractStatement(id, reasonHash)` разрешён автору и после отзыва паспорта. Reason bytes
сохранить/передать отдельно от hash. Status 1 Active / 2 Retracted / 3 Superseded; запись
не удаляется, снятие successor не оживляет predecessor. getStatement возвращает два tuple.
IDs локальные: всегда показывать/хранить chain+registry+journal+statementId.
Пагинация by passport / author — limit до100; читать на одном блоке, включая terminal records.

У старых satellites появились независимые признаки отзыва:
- proof: withdrawProof, proofWithdrawnAt, proofWithdrawalReason, proofAuthor;
- one-shot author attestation: withdrawAuthorAttestation (только signer),
  authorWithdrawalAt, authorWithdrawalReason. attested=true означает факт прошлой публикации;
- concern: собственный withdrawal теперь возможен с последующим новым raise.

Журнал не отзывает записи других satellites. Историю читать по всем закреплённым namespaces,
указывая block/time/completeness. Один лишь getProof или attested=true не означает действующее
одобрение. Публикация independent author declaration не требует согласия issuer.

## 5. Проверка и историческая идентичность

Разделить результаты: целостность bytes, совпадение core card/commitment, доверие к deployment,
доказательства chain state, авторство ключа/личность человека, lifecycle, полнота/свежесть истории,
доказательства единицы и соответствие физическому предмету. Нет общего зелёного «подлинный»
только по одному успешному hash/QR/activation.

Неизвестная проверка/anchor: «Не умею выполнять эту проверку». Это не verified и не fake.
Offline различать доверенную сохранённую проверку на конкретном блоке и самопредъявленный receipt;
без сети не утверждать свежесть revocations. Копия JSON не является криптографическим chain proof.

Сохранять временные свидетельства идентичности отдельно от core: источник, субъект/кошелёк,
время получения/проверки, scope, доказательные bytes/hash, срок/ограничения доверия. Текущий DNS
не доказывает владение доменом в прошлом. Directory — самодекларация; схема политики доверия
и UI должны явно показывать, что проверено, а что заявлено. Core ради этого не менять.

## 6. Отложить в конец

NFC исключён из текущей реализации. Не добавлять сервер, обязательный GitHub/Wayback или
новую схему делегирования выпуска. Хранение дополнительных копий .odpass и доставка обычному
человеку остаются открыты. Компактный QR/скретч — отдельный макет и физические тесты:
в `review/qr-07` только экспериментальные payload, не release standard. Протестировать скан
с реальной печати телефоном; не считать картинку QR доказательством пригодности этикетки.

## Приёмка

Сохранить существующую работу, реализовать поэтапно, проверить текущие тесты приложения и добавить
негативные/сквозные сценарии: перезапуск после отправки, повтор задания, другой wallet/network,
конфликт operationId, смена месяца, mint без open, подмена satellite, повтор nonce, отсутствие фото,
злонамеренный ZIP, unknown ABI, stale/offline evidence, revoked state, отзыв и конкурирующая
замена statement, historical attestation=true с withdrawal. Сверить canonical/edition векторы с repo.

На выходе: реализованные изменения, текущие результаты сборки/тестов, перечень ещё не реализованного
и отдельный список открытых продуктовых вопросов. Не объявлять release/deployment готовым по числу
тестов. Если локальный contract ABI после начала работы изменился — сообщить конкретный diff,
а не молча использовать прежние generated interfaces.


## Обязательная миграция приложения к `0.7-redesign-7`

Контрактные исправления и остатки на момент `0.7-redesign-6`: `review/audit-handoff-abi6/CLOSURE_MATRIX.md`. Эта матрица относится к байтам ABI6 и текущие исходники не покрывает.
`publishStatement` и `submitProof` получили последний аргумент bytes32 operationId. Старые selectors
несовместимы. Использовать пересобранные `chain/abi`, явно проверять ABI generation и satellite role.
До вызова кошелька атомарно сохранить namespace/caller/operationId/полный payload; после timeout
сначала читать statementOperations/proofOperations, сверять digest и receipt. AlreadyCommitted означает
найденный результат только после проверки namespace/digest/finality; Conflict не даёт права сменить ID.
При withdraw/supersede/month rollover старый результат восстанавливается тем же operationId.
Генерацию без нового ABI не подменять адресами0.6 либо redesign-4. Утверждённого release-бандла для `0.7-redesign-7` сейчас нет, поэтому реальных адресов быть не может.

Для выпуска тиража проверять реальные address-list bytes (count, LF, lower-case, hash, Merkle root) до
mint. Восстановление незавершённого открытия требует исходного issuer; profile stop отсутствует. Проверка целостности списка не означает владение секретным кодом.
В UI показывать отдельно content integrity, generation, chain/finality, status/history, identity и каждую
способность проверки. Неизвестный якорь/C2PA/NFC/physical authenticity без реализации = unsupported.
Hosting URL может быть вредоносным: не загружать автоматически, не выполнять HTML/SVG,
проверять допустимые схемы, redirects, пределы размера и private/loopback/link-local адреса при каждом hop.
Эти изменения приложения в текущем контрактном checkout НЕ реализованы и НЕ проверены.


## Решение пользователя: stop удалён; целевая сеть Polygon mainnet

ABI `0.7-redesign-7`: getCreator возвращает4 поля (creatorId, wallet, typePrefix, timestamp).
Функция revokeCreator, событие CreatorRevoked, поле revokedAt профиля и EC131 больше не существуют.
Убрать stop из UI/encoder/profile decoder и проверок доступа. Не путать это с сохранённым revokePassport
и withdrawals отдельных заявлений. Регистрация кошелька по-прежнему однократная.

Окно отзыва паспорта зависит от типа профиля издателя: 72 часа для C, 24 часа для B/P/M, включительно,
и закрывается досрочно необратимой `finalizePassportForPrint`. Не показывать единое окно 72 часа.
Читать `getPassportReleaseState(id)` и показывать `revocationDeadline` и `printFinalizedAt` отдельно;
попытка отзыва после фиксации возвращает `PassportPrintFinalized()`, а не `EC(132)`.
Фиксация не защищает от компрометации ключа: тот же ключ может зафиксировать паспорт сам.
Наличие украденного ключа невозможно отличить on-chain от владельца; stop/recovery защиты нет.
Выбрана сеть137 напрямую, без тестового Amoy deployment. Адрес не подставлять до подтверждения нового
release и mainnet transaction/runtime/finality. Старые отчёты ABI5 — исторические.

## Газ от спонсора: кнопка «Запросить POL» (решение 2026-09-24)

Приложение не создаёт и не хранит кошельки: по App Store Review Guidelines 3.1.5(a) кошелёк может выпускать
только разработчик-организация. Кошелёк пользователя подключается только через WalletConnect.

Спонсор (университет, издатель и т. п.) оплачивает газ в 0.7 только пополнением: сам переводит небольшие
суммы POL на адреса пользователей со своего кошелька, вручную или своим скриптом автопополнения. Контракт не
меняется, оплаты газа «за пользователя» в 0.7 нет. Подписанные действия, которые отправляет третья сторона,
отложены до следующего поколения и потребуют отдельного аудита.

Что сделать в приложении:
- Кнопка «Запросить POL». Приложение отправляет запрос спонсору и не показывает никаких QR-кодов.
- Адрес приёма запросов принадлежит спонсору, а не ODP; серверов ODP нет. Приложение отправляет только адрес
  кошелька и подпись `personal_sign` над текстом с адресом, названием спонсора, chainId 137 и временем.
  Так спонсор проверяет, что запрос пришёл от владельца адреса. Паспортных данных в запросе нет.
- Если адрес приёма не задан или недоступен, открыть системное меню «Поделиться» с адресом кошелька текстом.
- Сказать пользователю прямо: спонсор увидит его адрес и все его публичные действия; спонсор не получает
  доступа к кошельку и может только перестать пополнять.
- Показывать баланс POL и примерное число операций, на которое его хватит. Оплату газа ничем не блокировать:
  пользователь всегда может пополнить кошелёк сам.
- Где и в каком виде приложение получает адрес приёма спонсора, решить при разработке. QR внутри
  приложения не использовать.
