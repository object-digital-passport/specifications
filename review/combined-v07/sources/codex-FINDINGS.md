# Находки независимого аудита

Все пути/строки относятся к read-only `snapshot`, а не HEAD. Ссылки `chain/...` ниже — пути внутри снимка. Полные копии PoC лежат рядом; команды выполняются из `work`. Уровни оценивают реальную достижимость и ущерб, а не число предупреждений. Подтверждённого Critical/High обхода чужих прав не найдено.

## IA-01 — Deployment не связывает разрешённую сборку, factory и runtime

**Medium; воспроизведена в mock-harness + подтверждена кодом; tooling/deployment.**

Места: `chain/deploy/scripts/deploy.js:18–36`, особенно21–22,28–34; `chain/hardhat.config.ts:43–59`.

Предусловия: оператор запускает разрешённый deployment, но artifacts устарели/подменены, compilation input изменён или доверенный RPC отвечает не тем runtime. Удалённый произвольный пользователь core такими полномочиями не обладает. Возможен и честный ошибочный запуск, злонамеренный actor не обязателен.

Сценарий: (1) Подготовить допустимый по размеру artifact A. (2) Factory возвращает B или runtime не соответствует ожидаемому шаблону. (3) Скрипт хеширует A, отправляет factory и лишь записывает фактически прочитанный runtime hash. (4) Если остальные вызовы прошли и odpRegistry pin совпал, manifest получает complete.

Ожидание для release gate: до broadcast отклонять любое несовпадение с независимо одобренной сборкой, после — проверять deployed bytes с учётом immutables. Факт: нет approved input digest, factory.bytecode equality или runtime equality. compiler metadata вписана литералами, а не извлечена из build-info. sourceDirty записан, но не блокирует запуск. sourceFiles не включает nested test source, package.json, deploy script и полный standard-json input; состав несвязанных sources может влиять на core bytecode (COMPILER_AND_BUILD).

PoC: `node review/independent-v07/deploy-harness.mjs`. `deployment-harness.json`: искусственные A/B/runtime различаются, sourceDirty=true, результат complete и десять записей. Отдельный отказ четвёртой отправки даёт interrupted, а не complete. Harness исполняет тело исходного скрипта, заменяя imports mock-зависимостями и снимая только deploy guard в памяти; реальный ODP_ENABLE_DEPLOY не включался. Это доказательство отсутствия контроля, не факт подмены текущего чистого artifact. Текущие реальные factories совпали с artifacts в EVM-тесте.

До deployment исправимо только в release tooling. После ошибочного неизменяемого deployment правильный manifest не исправит чужой код; потребуется другое поколение/адрес. Существующий README честно требует независимую ручную проверку; поэтому `complete` здесь означает завершение отправок, не безопасность. Такая процедура не является технически enforced защитой.

Рекомендация: reviewed release manifest с полным input/settings/compiler/dependency hashes; проверка его до первой отправки; сравнение factory/creation; patched immutable runtime и receipt/address/pin после каждой операции. Вариант ручной независимой проверки допустим лишь как явный временный операционный gate. Не добавлять admin/upgrade.

Regression/закрытие: stale artifact, изменённый compiler input, другая factory, неверный/пустой runtime, неверный nonce/pin должны завершаться отказом до ошибочного complete; чистая локальная репетиция десяти контрактов должна породить манифест, из которого однозначно строится bundle generation. При resume сверять tx input/receipt/runtime и canonical chain, не только nonce/code.length.

## IA-02 — Официальная подготовка принимает навсегда неоткрываемый нулевой Merkle root

**Medium; воспроизведена tools + EVM; tooling, необратимый результат ошибочной подготовки.**

Места: `chain/tools/passport.mjs:28–35`, `chain/tools/edition-commitment.mjs:3–10`, `schema/passport-0.7.schema.json:590–592,786–789`; `chain/contracts/ODPEditionUnits.sol:56–75`; core `:559–564`.

Предусловия: активный B issuer использует JSON с `unit_key_set.data.merkleRoot = sha256:000...000`, например placeholder после сбоя подготовки. Схема/prepare должны отфильтровать его; сознательный issuer всегда может обойти JS, что не считается чужим exploit.

Сценарий: заменить root валидного edition vector нулями; preparePassport возвращает mint tuple с ненулевым editionCommitment. Core принимает этот commitment. openEdition с исходным root отклоняется EC118; с любым исправленным root — EditionCommitmentMismatch. В исходный паспорт исправленный root записать нельзя.

PoC: `node review/independent-v07/tool-counterexamples.mjs` и EVM test `zero Merkle root can be committed by core but can never be opened` в `independent.test.js`. Первый подтверждает ошибочную подготовку, второй — контрактный тупик. Это два отдельных воспроизводимых звена, не заявленный полноценный UI-flow.

Ущерб: потерянный выпуск/газ, необходимость нового паспорта/документа и потенциально перепечатки. В первые72h active issuer ещё может revoke, но это не ремонт исходного commitment; позже останется correction. Root не раскрывается в mint tuple, поэтому core не может вывести его из hash. Не требуется менять core ради проверки JS.

Рекомендация: nonzero root в schema и prepare; перед mint восстановить root/count из полного address list и проверить готовность открываемых параметров. Никогда не использовать placeholder как готовый commitment. Изменение типизированной схемы обязательства не нужно.

Regression/закрытие: zero root отклоняется до создания задания/подписи; положительные canonical trees сохраняются; mint/open end-to-end использует один сохранённый комплект данных.

## IA-03 — Повтор начального journal publish создаёт независимый остающийся Active дубликат

**Medium; воспроизведена EVM; архитектура/client recovery.**

Места: `chain/contracts/ODPStatementJournal.sol:45–74,77–83`; `ODP_07_APP_HANDOFF.md`, раздел4. SPEC §13 явно разрешает независимые цепочки.

Предусловия: автор отправил publish(previousId=0), получил неизвестный transport result и повторил ту же операцию новой транзакцией. Не нужен чужой ключ. Враждебный relayer не может подписать новую транзакцию автора, но может способствовать неопределённости ответа.

Сценарий: два одинаковых publish создают ID1 и ID2 с одинаковым payloadHash и Active. UI сохранил толькоID2, затем автор retract(ID2). ID1 остаётся Active. Expected бизнес-операция «опубликовать один claim, затем снять его» не выполнена. Solidity действует по заявленной независимой модели, поэтому это не нарушение current spec или чужой отзыв.

PoC: `F02 duplicate initial journal submissions survive retracting only one result`. Для replacement с previousId≠0 второе исполнение безопасно отклоняется stale-state, но клиент ещё должен найти successor. Для первичной публикации dedup нет. Тот же общий retry-риск есть у submitProof; identical documentHash не является operation identity.

Влияние: лишние endorsement/correction claims и ложное ощущение завершённого отзыва. Ущерб зависит от ещё не реализованного reader/submission flow. После deployment можно реализовать client durable journal без смены адреса; уже созданные duplicates нужно найти и явно снять. Глобальная дедупликация payloadHash может запретить легитимные повторные независимые заявления и не рекомендуется как автоматическая правка.

Рекомендация: до ABI freeze решить, нужна ли гарантированная on-chain идемпотентность journal/proof как у mint. Если scope остаётся прежним, обязательный durable transaction journal, восстановление receipt/events на фиксированном блоке, сохранение всех IDs и запрет слепого retry; явно документировать остаточный риск нескольких устройств. Изменение контракта — отдельное решение, не выполнено.

Regression/закрытие: crash-after-broadcast, потеря receipt, две pending отправки, reorg, перезапуск и отзыв после восстановления не оставляют скрытого Active claim. Для принятого client-only решения отдельно доказать отсутствие автоматического повтора неизвестной операции.

## IA-04 — Stop между mint и open навсегда оставляет корректный паспорт без тиража

**Medium риск; воспроизведена EVM; согласованный архитектурный компромисс, не новый access-control bug.**

Места: `chain/contracts/ODPEditionUnits.sol:49–75`; `ODPSatellite.sol:15–18`; `ObjectDigitalPassport.sol:215–222,353–365`; SPEC §20.2.

Предусловия: корректный edition mint подтверждён, open ещё нет; issuer сознательно/ошибочно остановил профиль либо злоумышленник с issuer key сделал stop. Потеря ключа без stop приводит к тому же отсутствию доступного authorized caller.

PoC: `F01 stopped issuer strands a correctly committed unopened passport forever`. После stop open отклоняется EC131, revokePassport тоже EC131, passport существует и nonrevoked. Commitment правильный; никакая смена месяца/ожидание не восстановит права.

Ущерб: необратимо потерянная возможность открытия именно этого edition; исходный документ и запись сохраняются. Нельзя автоматически создать новый паспорт и назвать это восстановлением прежнего. Уже открытый nonrevoked edition продолжает принимать activation после stop — другой сценарий.

Рекомендация в текущем согласованном объёме: выдавать финальные этикетки только после подтверждённого open и сравнения anchor/commitment; сохранять всю подготовку до mint; заранее показывать необратимость stop. Решение разрешить permissionless раскрытие уже committed параметров либо узкую post-stop finalization потребует изменения прав до deployment и отдельного утверждения; admin/upgrade не предлагается. Если непрерывная восстанавливаемость обязательна продукту, текущая архитектура этому требованию не соответствует.

Закрытие: либо явное принятие риска с end-to-end тестом запрета выдачи unopened edition, либо отдельный пересмотр прав и новый негативный набор. Приложение не может сделать guaranteed recovery поверх существующего stopped issuer gate.

## IA-05 — CLI молча заменяет некорректный UTF-8 до канонизации

**Low; воспроизведена; tooling/spec conformance.**

Место: `chain/tools/passport.mjs:62`; SPEC §10.1; для сравнения `chain/tools/bundle.mjs:13–16` использует fatal TextDecoder.

Предусловия: пользователь передаёт CLI повреждённый JSON-файл, который после replacement остаётся JSON. В PoC первый байт ASCII title заменён на FF.

Сценарий: fs.readFileSync(...,'utf8') вставляет U+FFFD; parseJSON уже не видит недопустимые bytes; prepare успешно выдаёт canonical, dataHash и изменённый title. Ожидается отказ без тихого изменения символов. Нет SHA collision и не подменяется документ с уже проверенным hash: дефект до mint.

PoC: `tool-counterexamples.mjs`, fixture `invalid-utf8.json`, log `tool-counterexamples.log`: title `�ADBYTE`, exit0.

До deployment исправляется независимо от контрактов. Если такой output подписан/выпущен, изменённый текст становится неизменяемым, исправление требует нового паспорта. Bundle reader этой конкретной ошибкой не затронут.

Рекомендация: decode исходных bytes с fatal UTF-8 и явной BOM-политикой до parseJSON; единый decoder CLI/bundle. Regression: FF, overlong, truncated multibyte, encoded surrogate, BOM отклоняются; корректные Unicode/NFC vectors сохраняются.

## IA-06 — Unsupported capabilities не перечисляются в текущем verification API

**Low; воспроизведена tools + код; частично реализованный client contract, не ложный Solidity success.**

Места: `chain/tools/passport.mjs:39–46`, `chain/tools/bundle.mjs:79–88`; SPEC §11, принятый AR-10.

Предусловия: валидный документ с nfc/c2pa либо неизвестным anchor; caller отображает результат helpers как полный verification report, не добавив обязательный собственный capability layer.

PoC `independent-tools.mjs`: physical vector с verificationMethod=nfc и `future_unimplemented_check` проходит integrity matching; результат verifyPassport содержит integrity=true без списка unsupported checks. Bundle helper имеет общий physicalAuthenticity unsupported и editionProofs unsupported, но не даёт отдельного результата для каждого unknown anchor/verificationMethod.

Функция документирована как integrity-only, поэтому integrity=true само по себе корректно: подтверждённого ложного общего verdict в существующем UI нет, UI не проверялся. Нельзя утверждать, что принятое требование полностью реализовано. Риск — потеря обязательной проверки при интеграции и ошибочная зелёная интерпретация; предотвращается приложением без смены адреса.

Рекомендация: типизированный capability report с unknown/unsupported/missing/failed/verified по каждой требуемой проверке; integrity остаётся отдельной осью. Закрытие: неизвестный anchor, nfc/c2pa/hybrid без реализации явно отображаются как unsupported; положительный hash не повышает их статус. В текущем scope это gate приложения, а не причина менять core.

## Наблюдения, не выдаваемые за новые exploits

- **OBS-01 noncanonical tree:** воспроизведено root=leaf(index0,key), count=2^20, proof=[]; activation0 проходит. Контракт не обещает проверить полную форму дерева; SPEC §20.3 переносит её клиенту. Это issuer-controlled malformed edition, а не получение чужого unit key. Canonical address-list/root/count проверка обязательна до mint и в reader; full count из on-chain getter не доказывает существование миллиона корректных leaves.
- **OBS-02 build context:** исторический отчёт упоминает creation mismatch, но его собственные hashes показывают и runtime mismatch. Свежий controlled compiler experiment подтвердил механизм разных spill slots. Две полные clean builds совпали; точный старый standard-json не сохранился, поэтому старый hash не воспроизведён. Подробнее COMPILER_AND_BUILD.
- **OBS-03 generation packaging:** deploy manifest schema отличается от bundle generation; отсутствует реализованный доверенный converter/recovery workflow. README это не скрывает. Нельзя назвать raw complete manifest уже approved generation.json.
- **OBS-04 permissionless Sybil:** P/M unrestricted mint/proof/concern доступны саморегистрации. Counts/affiliation/DNS не accreditation; платный spam влияет на индексирование и UX, не на hash core. C/B quotas не глобальный anti-spam барьер.
- **OBS-05 payload envelope:** журнал не проверяет JSON author/kind/subject/previousId или SHA-256 preimage. Это неизбежная граница hash commitment, не обход chain attribution. Приложение обязано сравнивать payload с envelope; отдельного готового statement validator здесь нет.
- **OBS-06 loss/clone:** 100-bit concealed codes, подпись и Merkle membership не связывают предмет с владельцем. Копия кода допускает раннюю activation, подпись этикетки допускает копирование. Никакой first-use timestamp не доказывает покупку/аутентичность.
