> **Исторические решения/варианты ниже; не инструкции для ABI `0.7-redesign-8`.** Текущие правила: [SPEC](SPEC.md), [план](ODP_07_ACTION_PLAN.md), [таблица замен и открытых вопросов](ODP_07_ABI6_DOCUMENTATION_DELTA.md), [глоссарий](docs/ru/GLOSSARY.md). Profile stop и mint-agent удалены полностью: нет `revokeCreator`, `CreatorRevoked`, профильного `revokedAt` и `EC(131)`. Отзыв паспорта сохранён как отдельное право исходного issuer с ненулевой причиной: до 72 часов для профиля C и до 24 часов для B/P/M, и только пока нет необратимой фиксации печати (`finalizePassportForPrint`). Journal/proof требуют operationId. Цель — Polygon mainnet, Amoy не используется; кошелёк и внешняя сеть сейчас запрещены. Старые решения и их обоснования сохранены, но не являются текущими полномочиями или разрешением на deployment.

> Новое решение пользователя: stop удалён; целевая сеть Polygon mainnet без Amoy. [`0.7-redesign-6`, доказательства и состояние deployment](review/v07-no-stop/README.md) — снимок прежнего поколения. Предыдущие варианты D2/D3 ниже исторические; действующее решение D2 (окна 72/24 часа, необратимая фиксация печати, тиражи только для B) записано в `review/usage-safety-abi6/CLOSURE.md` и реализовано в текущем коде.

> Ход реализации redesign-5, доказательства и незакрытые пункты: [review/v07-remediation/README.md](review/v07-remediation/README.md). Исходные статусы ниже относятся к моменту составления плана.

# ODP 0.7 — объединённый план исправлений и выхода к deployment

Дата: 2026-09-18. **Статус: план, исправления ещё не выполнены, deployment не разрешён.**
Основание: [аудит Codex](review/combined-v07/sources/codex-REPORT.md), [его находки](review/combined-v07/sources/codex-FINDINGS.md), [аудит Opus](review/combined-v07/sources/opus-REPORT.md), [его находки](review/combined-v07/sources/opus-FINDINGS.md).

Цель: получить проверенный release candidate протокола **0.7**, затем развернуть именно его десять контрактов и выпустить работающий переносимый паспорт. «Закрыть всё» означает исправить дефекты, принять явные решения по необратимым компромиссам и доказать выполнение release gates. Это не обещание устранить кражу ключей, копирование наклеек или исчезновение файлов средствами Solidity.

## 1. Что удалось сопоставить

- Текущие SPEC, contracts, schema, tools и deployment scripts побайтно совпали с соответствующими файлами снимка Codex. Исходный dirty tree не очищался и production-код не менялся.
- Snapshot manifests двух аудитов имеют разные hashes: без полного снимка Opus нельзя утверждать совпадение всех файлов. Но **clean runtime core совпадает**: keccak256 `0x4d915a931254b3b4e01fc4657278a875a03ef50ca9200ab30714f0322f79901c`. В отчёте Codex тот же bytecode указан через SHA-256 `3228afef…129162`. Это не две несовместимые clean сборки.
- Предоставлены только REPORT/FINDINGS Opus; его SCOPE, RELEASE_GATES и PoC/logs не приложены. Заявленные им дополнительные прогоны учитываются как evidence автора отчёта, не как повторённые здесь проверки. До финального закрытия импортировать исходные PoC либо написать собственные эквиваленты.
- **F-08 Opus независимо воспроизведён на текущем коде:** обычный unknown anchor даёт mask2147483935, а constructor/__proto__/toString/hasOwnProperty —287 вместо2147483935. [PoC](review/combined-v07/check-anchor-mask.mjs), [результат](review/combined-v07/anchor-mask-reproduction.jsonl).
- Deployment gap подтверждён обоими аудитами. Разница High у Opus / Medium у Codex — шкала оценки операционного риска. В плане это **P0, блокер deployment**, независимо от ярлыка severity. Различный runtime ещё не доказывает некорректную семантику compiler; он доказывает потерю связи с проверенным artifact.
- Компрометация меняет lifecycle статусы старых заявлений, но не стирает их immutable payload hashes и event history. Кража issuer key не равна краже отдельного authorSigner key.
- В bytecode зафиксированы правила activation/label signatures, commitment и Merkle verification. HKDF, Crockford-код и конкретный QR transport реализуются вне chain. Изменение плотности QR/упаковки само по себе не требует нового контракта; изменение проверяемого payload/алгоритма может потребовать.

## 2. Единый реестр работ — без дублирования находок

P0 — до approval deployment; P1 — до выдачи реальных паспортов; P2 — принятое ограничение с обязательной документацией/reader policy. У всех строк исходный статус **OPEN**; «принять риск» требует зафиксированного решения, а не исчезновения строки.

| ID | Источники | Работа | Приоритет / когда закрыть | Изменяет адреса/ABI при реализации после deploy? |
|---|---|---|---|---|
| R01 | Codex IA-01; Opus F-01/F-09 | Release build как зафиксированный artifact; запрет непроверенных factory/runtime | P0 | Tooling исправляется без смены адресов, но ошибочный deployment необратим |
| R02 | Codex OBS-03; Opus F-05 | Deployment → authenticated generation; проверяемый resume | P0 | Нет, если исходно развёрнут правильный набор |
| R03 | Codex IA-03; Opus F-03 | Идемпотентность journal и proof + durable client journal | P0 решение/API; P1 клиент | Да для нового on-chain operation API |
| R04 | Codex rights/IA-04; Opus F-02 | Семантика stop/revoke/withdraw/compromise | P0 решение | Да, если меняются полномочия |
| R05 | Codex IA-04 | Неоткрытый edition после stop/lost key; процесс mint→open→выдача | P0 принятие; P1 workflow | Да, если вводится новый способ finalization |
| R06 | Codex IA-02/OBS-01 | Zero root preflight; полный address-list/tree/count validator | P1, до любого реального mint | Нет |
| R07 | Codex IA-05 | Fatal UTF-8 decoding во всех путях подготовки | P1, до любого реального mint | Нет |
| R08 | Opus F-08 | Безопасный lookup anchor bits без Object.prototype | P1, до любого реального mint | Нет |
| R09 | Codex IA-06/OBS-05; Opus F-11 | Эталонные mint digest/statement validator + capabilities | P1 | Нет, с учётом нового API R03 |
| R10 | Codex gates/AR-02/03; Opus F-04 | Зафиксировать crypto/wire formats носителя, печать и roundtrip | P0 совместимость; P1 печать | Только если меняются контрактные semantics |
| R11 | Codex gates; Opus REPORT | ZIP exporter/importer, trusted chain evidence, reader/UI | P1, рекомендуется до production deploy | Нет |
| R12 | Opus F-06 | Unsafe hosting URL и заморозка после stop | P1/P2 | Только если менять post-stop права |
| R13 | Opus F-07 | One-shot author slot: честное описание и независимая identity | P1/P2 | Нет при сохранении модели |
| R14 | Codex compiler/static/OBS-04; Opus F-10/F-12 | Compiler decision, static triage, Sybil/trust/availability policy | P0 compiler; P1/P2 остальные | Compiler сменит bytecode; policies вне chain |

## 3. Решения до изменения контрактов

Существующие решения про отсутствие admin/upgrade, immutable содержание, прямой issuer mint, finite key-set и новый паспорт для допечатки сохраняются. Ниже — рекомендуемый пакет, а не уже данное разрешение менять права.

### D1. Journal/proof operationId — рекомендую реализовать в 0.7

Добавить nonzero bytes32 operationId в `publishStatement` и `submitProof`. Scope: caller + конкретный satellite; digest дополнительно фиксирует chainId, registry, address(this), versioned action domain и **все** inputs. Для journal включить passportId, kind, payloadHash, previousId; для proof — passportId, documentHash, documentUrl, year, month. Контекст immutable dataHash можно дополнительно включить в согласованный digest, но тогда reference function обязана получать его явно.

Результат хранится атомарно вместе с новой записью. Exact replay → AlreadyCommitted(id); изменённый input → conflict; failed initial call не резервирует ID. Replay lookup выполняется до active/revoked/calendar/previous-status guards: успешную старую операцию можно найти после stop/retract/supersede/month rollover. Новые operation IDs не запрещают осознанные независимые одинаковые statements.

Не вводить глобальную уникальность payloadHash/documentHash. Это другая семантика и может запретить легитимную новую экспертизу. Отзыв уже терминальной записи можно оставлять one-shot с восстановлением по getter; повторный revert не трактовать как новое изменение.

### D2. Stop и компрометация — рекомендую узко отделить запрет выпуска от 72h revocation

**Предлагаемое изменение, требует отдельного решения:** разрешить исходному issuer `revokePassport` в том же72h окне и после stop. Проверки issuer, nonrevoked, deadline, nonzero reason сохраняются. Это позволяет сначала остановить выпуск, затем отозвать свежие ошибочные паспорта. Цена: украденный тот же ключ тоже сохранит72h право отзыва. После72h никаких новых прав не появляется.

Собственные retract/withdraw после stop рекомендую сохранить: их запрет лишает настоящего автора возможности снять согласие и не лечит действия вора до stop. При этом stop **не является криптографической блокировкой ключа**. Старые statements остаются исторически видимыми, а статусные изменения должны показываться с actor/block/time и состоянием профиля. «После stop» определять по порядку block/transaction/log, а не только `timestamp >= revokedAt`: разные события одного блока имеют одно время.

Новые statements/corrections после stop пока не разрешать автоматически: тот же вор сможет выпускать и их. Не добавлять recovery/admin key под видом исправления. Если продукт требует различать владельца и вора после компрометации, это отдельная архитектура identity/key recovery, а не точечный patch.

Альтернатива без изменения прав: сохранить текущий active-only revoke, явно принять его ограничения и исправить SPEC/SECURITY/UI. До выбора D2 dependent контрактную правку не выполнять; tooling R01/R02/R06–09 от этого не зависит.

### D3. Edition finalization — сохранить согласованную двухфазную модель

Для0.7 рекомендую сохранить active issuer requirement для open. Не выдавать готовый тираж/наклейки до confirmed open и проверки commitment. Сохранить подготовку/operation state до mint, защитить stop-flow от случайного закрытия незавершённых выпусков. При реальной компрометации безопасность stop может быть важнее сохранения pending edition — приложение должно показать именно этот trade-off.

Не вводить permissionless/post-stop open без отдельного анализа: нужно рассмотреть конкурирующие паспорта с одним issuer nonce, revocation и race. Если guaranteed completion после потери ключа обязательно, D3 нельзя закрыть одним UX предупреждением: потребуется пересмотр контракта до deployment.

### D4. Носитель, сеть и compiler

Сохранить текущие100-bit secrets, derivation v2 и personal_sign domains, если реальные label/reader roundtrips их подтверждают. Зафиксировать версию wire format и тестовые bytes. Не сокращать секрет до приемлемого размера QR — concealed code и публичный locator имеют разные задачи.

Выбрать конкретную production chain и её finality policy; до этого нельзя утвердить полный release manifest. Сравнить0.8.20 с выбранной стабильной исправленной версией compiler, сохранив EVM target явно. Рекомендую предпочесть прошедшую повторное ревью исправленную версию, а не закреплять0.8.20 только из-за старых зелёных тестов. Номер версии утверждать после актуальной проверки [официального реестра Solidity bugs](https://docs.soliditylang.org/en/latest/bugs.html), не брать develop/nightly из заголовка документации. Отсутствие известных triggers не является доказательством корректности optimizer.

## 4. Порядок выполнения и приёмка

### Этап 0 — закрепить исходную базу и решения

Владелец: release lead + автор протокола. Сохранить текущий tree/untracked в отдельный снимок и baseline hashes; импортировать оба набора PoC, отметив недостающие Opus artifacts. Создать `DECISIONS.md` с выбранными D1–D4, остаточными рисками и обновлённой матрицей прав. Не делать reset/stash/checkout/clean исходного dirty checkout.

**Выход:** неизменяемая база, единый список OPEN R01–R14, разрешённый объём контрактных изменений. Новый ABI identifier обязателен при D1/D2; не перезаписывать смысл `0.7-redesign-4`. Версия протокола остаётся0.7.

### Этап 1 — tools, schemas и эталонные проверки

Владелец: protocol/tooling. Начать независимо от ожидания D2.

Файлы: `chain/tools/passport.mjs`, `canonical.mjs`, `edition-commitment.mjs`, `edition.mjs`, `bundle.mjs`; `schema/passport-0.7.schema.json`, `schema/statement-0.7.schema.json`; новые reference helpers/tests/vectors в `chain/tools/` и `schema/vectors/`.

Работы:
1. `Object.hasOwn(bits,type)`/Map для mask; непредусмотренные types получают custom bit, не inherited property.
2. Fatal UTF-8 decoder до JSON; единая BOM/duplicate/NFC/surrogate политика CLI/import. Исходные bytes не меняются незаметно.
3. Nonzero edition root; восстановить canonical indexed tree из address list, сверить hash/root/count, длину proof и duplicate-odd правило; проверять variant count. Ошибки до создания durable mint intent.
4. Reference mintDigest и новые journal/proof digests; точные ABI types и domain. Не «улучшать» encoding только в одном клиенте.
5. Statement payload: strict parse/schema/canonical SHA256; сверка chain, registry, journal, passportId, dataHash, author, kind, previousId с независимо полученным envelope. relatedPassport — ссылка/claim, не автоматически проверенная преемственность.
6. Per-capability report: verified/failed/unsupported/missing evidence/not applicable; chain authentication и freshness — отдельные оси.

**Приёмка:** F-08 names дают base|CUSTOM; malformed UTF-8 и zero root отклоняются; root/list/count disagreement отклоняется; golden vectors совпадают в JS и независимом reader; mutation любого digest/envelope поля обнаруживается. Общая «целостность=true» не повышает неподдерживаемый NFC/C2PA/custom anchor до passed.

### Этап 2 — контрактная правка одним согласованным набором

Владелец: Solidity. Зависит от D1/D2; D3 меняется только отдельным решением.

Файлы: `ODPStatementJournal.sol`, `ODPPassportProofRegistry.sol`; при выборе предложения D2 — `ObjectDigitalPassport.sol`; SPEC, SECURITY, APP_HANDOFF и матрица прав. Regenerate ABI/TypeChain из чистой сборки; проверить shared IODPRegistry даже если return tuples не менялись.

**Приёмка:** exact retry/changed input/zero ID/failed call/две pending транзакции; replay после stop/revoke/retract/supersede/смены месяца; namespace author/chain/registry/satellite. Ни лишней записи, ни quota/index/event side effects после revert. Stale previousId не создаёт ветвление; successor retract не оживляет predecessor. Для D2: stop→revoke до/ровно/после72h, чужой wallet, повтор, no-recovery и атакующий с тем же ключом; expected поведение обоих actors честно одинаково.

Не менять одновременно ownership, JSON mutability, unit transfer или administration. Исправить NatSpec author attestation: независимость означает невозможность подделать подпись **заранее известного отдельного ключа**; issuer всё ещё может занять пустой one-shot slot собственным ключом. Independent authors используют journal.

### Этап 3 — release artifact и безопасное развёртывание

Владелец: release tooling. Каркас можно делать раньше; окончательные pins — после этапа2/compiler decision.

Файлы: `chain/deploy/scripts/deploy.js`, новые prepare-release/verify-release/reconcile/generation tools; hardhat config, CI, deploy README, bundle generation schema при необходимости. Рекомендуемые имена файлов не означают, что они уже существуют.

**До подписи любой транзакции:**
- В отдельном release workspace сделать чистую сборку. Сохранить все16 текущих source inputs (или фактический состав после изменений), standard-json input/output, compiler binary hash/version, settings, dependency lock, ABI и creation bytecode. Source tree hash и compiler input hash — разные необходимые сущности.
- Создать release bundle с immutable digest и approved contract roster: ровно core+9 satellites. Зафиксировать generationId/ABI/chain и constructor policy. Финальное одобрение относится к bundle digest.
- Deployment читает только этот bundle, не произвольные текущие artifacts/. Запретить implicit compile; одного `--no-compile` недостаточно без hash checks. Проверять inputs, artifacts/factory и фактический tx.data перед отправкой.
- Clean release checkout обязателен для принятого workflow; не путать его с исходным рабочим деревом, которое нельзя очищать. Чистый git status сам по себе не доказывает approved bytes. Любой дрейф approved release bundle блокирует отправку.

**Во время и после:**
- Зафиксировать signer, chain, nonce/address/args/tx input до send; использовать отдельный deployment account/process, не допускающий конкурирующих отправок по тем же nonce.
- Receipt success, canonical block/hash, contractAddress и expected address; runtime nonempty и **равен expected**, а не просто записан. Для immutable fields подставить registry/domain/chain values в проверенные offsets из compiler output; не исключать immutable regions из проверки целиком. Проверить constructor pins отдельно.
- Write-ahead manifest со planned/pending/mined/verified/interrupted; complete допускается после проверки всех десяти контрактов и finality policy. Не объявлять transaction mined равным authenticated generation.
- Reconcile/resume проверяет chain, sender+nonce, transaction input, receipt, actual runtime и constructor args. При неизвестном pending не запускать новый полный набор. При conflicting code/input — отказ; при reorg — повторное подтверждение. Записи interrupted не публикуются как approved generation.
- Детерминированный converter build+deployment evidence → schema-valid generation.json: stable roles/addresses, deployment blocks, runtime/ABI hashes, compiler/buildInfoHash, immutable generationId. Независимо проверить перед добавлением в approvedGenerations. Внешний manifest не становится доверенным от прохождения JSON Schema.

**Приёмка:** clean success; incremental edit→restore; stale/modified artifact; dirty release; другой compiler/input; неверный chain; runtime/immutable/pin mismatch; competing nonce; restart на каждой границе save/send/receipt; reorg. Все несовпадения отклоняются до следующей опасной отправки/complete. Generation проходит schema, bundle validator и независимый identity checker. Ни тестовый wallet, ни legacy0.6 адреса не попадают в deployment roster.

### Этап 4 — приложение и полный переносимый паспорт

Владелец: команда приложения. Контрактный интерфейс — после этапа2; offline ZIP/capabilities можно реализовывать раньше. Репозиторий приложения в этом плане не объявляется уже исправленным.

- Durable jobs для mint/journal/proof/open: сохранять exact inputs, full namespace, operation ID и attempts **до** отправки. Timeout ≠ failure; сначала chain reconciliation, затем решение о retry. Snapshot wallet/network не менять в текущем задании; reorg/finality моделируются явно.
- Mint→open state machine: draft/prepared/submitted/unknown/minted/unopened/open-confirmed/issued; не генерировать новый паспорт для восстановления неизвестного результата. Перед issued пересчитать JSON/core/edition равенства.
- ZIP экспорт/импорт: exact root files и originals, path/duplicate/symlink/encryption/ZIP bomb limits до выделения памяти/распаковки; canonical JSON и fatal decoding. Проверять обязательные bytes по passport, а не лишь editable manifest. Полный и индивидуальный edition packages имеют однозначные версии/схемы.
- Trusted generation встроена/аутентифицирована независимо от импортируемого архива. Receipt operationId/tx/block действительно связывает caller и выбранный mint; pin ABI/runtime/core+satellites. При offline хранить происхождение и block/time evidence, не выдавать самопредъявленный receipt за chain proof.
- Историю читать по всем pinned namespaces на одном блоке, с withdrawal/status и completeness. Не выбирать «последнее из независимых заявлений» как истину; duplicates явно reconciled.
- URL от hosting — недоверенный transport. Не открывать его автоматически как активную страницу: fetch с ограничениями/redirection policy, проверка bytes/hash до render, безопасный preview. Stop не превращает прежний URL в официальный доверенный сайт. Исправление URL после stop не вводить без решения о правах.
- Independent author key/identity evidence; self-selected P/M, domain, concern count и affiliation не дают accreditation. Показывать действия compromised/stopped профиля без попытки угадать «вор или владелец» по одной подписи.

**Приёмка:** end-to-end выпуск/чтение через реальные используемые типы кошельков на локальной сети; crash/restart после каждой фазы; другой account/network; stale/forged receipt; missing original; malicious ZIP; unknown ABI/anchor; withdrawn author/proof; offline cached evidence; dead hosting; corrupted address list. Старые namespaces сохраняются при обновлении клиента.

### Этап 5 — носитель, ключи, доступность

Владелец: продукт + приложение + operations.

Зафиксировать exact QR/label payload и version, namespace recovery, индивидуальные index/proof/variant fields; roundtrip encode→print→scan→verify без сети при полном trusted архиве. Concealed100-bit code не попадает в public locator, logs или analytics. Напечатать в целевом размере/материале и проверить целевыми телефонами; изображения QR на экране недостаточно.

Определить выдачу полного .odpass пользователю, резервные copies, хранение/восстановление master и публичного address list, срок доступности и сценарий ухода issuer. Смена сайта меняет transport, не committed bytes. Принять предел: потерянные originals и secret preimages из hashes не восстановить. NFC остаётся вне текущего объёма.

**Приёмка:** issuer/site исчезли, телефон заменён, есть только QR, полный архив offline, copied label/code, повреждённый носитель, потерян issuer key. Для каждого фиксируется достижимый результат и ограничения; ни QR, ни activation не обещают физическую подлинность/владение.

### Этап 6 — независимое повторное ревью окончательного кандидата

Владелец: проверяющий, не автор соответствующих исправлений.

Повторить оба набора негативных PoC с **новыми expected results**, baseline, vectors, tsc, full schema/bundle roundtrip, two clean builds, EIP-170, factory/runtime checks, Slither без сокрытия детекторов. Новые ABI/client integration, D2 rights и deployment/resume требуют отдельного просмотра. Добавить property/fuzz engine для operation maps/journal terminality/quota/nonce isolation, если доступен; заданное число seeded переходов не называть полноценным fuzzing. Отсутствие engine фиксировать как ограничение, не скрывать.

Перепроверить текущие официальные compiler advisories, Yul/source call graph, actual settings. После compiler/source/input change новый hash — новый review scope. Отдельно повторить maximum-count proof и max-string gas; не смешивать измерение max tree с полной генерацией всех private keys. Оценить актуальные dependency advisories: старое offline «0» и Opus «11 low» не противоречат автоматически, это разные проверки/время; документировать reachability, не делать слепой npm audit fix.

**Выход:** `CLOSURE_MATRIX.md` со всеми R01–R14: fixed + конкретный test/log/build hash, accepted + точная формулировка ограничения, либо open/blocking. Оценки двух AI-сессий не обозначать как внешний профессиональный аудит. Для заявленного внешнего независимого review нужен отдельный исполнитель и его отчёт на финальные hashes; если такой gate сохраняется, без него не отмечать его выполненным.

### Этап 7 — разрешённый deployment и проверка результата

Подготовить конкретный пакет одобрения: chain, generationId, ABI, release bundle digest, ten-contract roster, compiler decision, gas budget/nonce policy, локальная rehearsal, closure matrix и список принятых рисков. Только после этого запросить отдельное разрешение на сеть и реальные транзакции. Этот план не является таким разрешением; public testnet тоже требует отдельной авторизации.

После разрешения отправлять именно закреплённые bytes по этапу3, проверить все runtime/receipts, выполнить разрешённую source verification по точному standard-json, утвердить manifest и client pins. Explorer publication — отдельное внешнее действие в объёме разрешения. Не делать smoke mints в production автоматически: публичные fixtures необратимы; репетиция выполняется на локальной либо отдельно разрешённой staging generation.

## 5. Две разные точки готовности

**G-DEPLOY — можно зафиксировать адреса:** D1–D4 решены, R01/R02 готовы, ABI/crypto formats стабильны, локальная end-to-end rehearsal прошла, точная сборка повторно проверена, blocking findings закрыты, compiler/network определены и есть конкретное разрешение. Неоткрытые продуктовые вопросы, способные изменить контракты, блокируют этот gate.

**G-ISSUE — можно выдавать реальные паспорта:** дополнительно R06–R13, приложение/ZIP/chain evidence, физический носитель и доставка originals готовы, production manifest независимо проверен и закреплён в reader. Между gates адреса могут существовать без выдачи пользовательских паспортов. Практически рекомендую довести локальный пользовательский путь до готовности **до production deployment**, чтобы не обнаружить потребность в другом ABI после него.

## 6. Порядок зависимостей

`База+решения → контрактный пакет+reference tooling → final ABI → приложение/носитель → pinned release build → финальное ревью+локальная rehearsal → разрешение → deployment → identity verification → выдача`.

R06–R09 и каркас R01/R02 можно выполнять независимо от выбора D2; production hashes фиксируются лишь после окончания всех входящих изменений. Каждый implementation-блок должен закончиться собственным regression evidence; все риски остаются видимыми в closure matrix. Публичная публикация, коммиты и deploy не выполняются автоматически этим планом.
