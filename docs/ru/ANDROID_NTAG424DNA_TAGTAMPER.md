> **Исторический материал, заменён для ABI `0.7-redesign-8`.** NFC hardware/transport отложен; старое руководство не подтверждает реализованную или физически проверенную поддержку. Нормативна [английская SPEC](../../SPEC.md); см. [app handoff](../../ODP_07_APP_HANDOFF.md), [глоссарий](GLOSSARY.md), [дельту](../../ODP_07_ABI6_DOCUMENTATION_DELTA.md). Эта страница не разрешает кошелёк или внешнюю сеть.

# Android-гайд: NTAG 424 DNA TagTamper с ODP

Этот гайд описывает практический стек `ODP + NTAG 424 DNA TagTamper`, когда одного браузера уже недостаточно.

Коротко:

- `ODP web` нужен для выпуска паспорта, публикации `nfcPublicKey`, сборки `.odpass`, сборки `odpOffline` и якорения `ndppCommitmentHash`.
- `NXP TagWriter` нужен для записи tap carrier.
- В текущем пилоте на Pixel APK `ODP Android Companion` импортирует Android handoff, выполняет живое сканирование, пробует EV2/аутентифицированное чтение и сравнивает байты защищённого файла с on-chain `nfcPublicKey`.
- `Tag TrustLink Android` (или другое совместимое приложение для NTAG 424 DNA) оставьте как полезную перекрёстную проверку или запасной ориентир, когда нужно внешнее второе мнение об аутентификации чипа или состоянии TagTamper.

Это разные шаги доверия:

1. открытие carrier не равно аутентификации чипа,
2. аутентификация чипа ещё не означает привязку chip-to-passport,
3. привязка chip-to-passport делается сравнением задокументированного живого результата mirror-profile с on-chain `nfcPublicKey`,
4. проверка ODP `.odpass` / `dataHash` снова отдельна.

ODP остаётся слоем реестра и проверки хэшей. Android-приложение — это NFC runtime.

## Что делает каждый инструмент

### ODP web

Через ODP web вы:

- минтите паспорт
- записываете `sealType`, `nfcModel` и `nfcPublicKey`
- собираете `.odpass`
- генерируете компактный `odpOffline v0.1`
- экспортируете NFC carrier file
- при желании якорите отпечаток NDPP / offline payload on-chain
- проверяете запись в реестре, issuer и хэши файлов

Важно: `ndppCommitmentHash` якорит только **raw-байты offline / NDPP payload**. Он не хэширует весь NFC carrier целиком.

### NXP TagWriter

TagWriter нужен, когда вам надо записать carrier, который удобно открывается телефоном по тапу.

Типовой сценарий:

- записать стандартную URL / URI запись, ведущую на ODP Verify
- или записать экспортированный из [`frontend/passport.html`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/frontend/passport.html) (репозиторий сайта) файл `.ndef`

TagWriter пишет только carrier / entry layer. Он **не** аутентифицирует чип, **не** читает TagTamper status и **не** проверяет `.odpass` / `dataHash`.

### Tag TrustLink Android

Tag TrustLink нужен для операций уровня NTAG 424 DNA / TagTamper:

- валидация чипа
- secure URL / secure message flow
- чтение статуса TagTamper
- проверка через NXP-side project или validation endpoint

Tag TrustLink — это шаг аутентификации чипа. Сам по себе он **не** проверяет весь ODP-паспорт.

## Железо и софт

Минимально рекомендуемый набор:

- Android-телефон с включённым NFC
- реальный `NTAG424DNA_TAGTAMPER`
- ODP-паспорт, выпущенный как `physical` или `mixed`
- `nfcModel = NTAG424DNA_TAGTAMPER`
- `nfcPublicKey` реального чипа, записанный в ODP-паспорт

Для первого практического прототипа Android сейчас оптимален. iPhone может быть полезен через native app, но не через один только браузер.

## Протокол пилота на Pixel

Короткий практический путь проверки для текущего пилота с **пошаговым** Android companion:

1. Выпустите паспорт в ODP web с `nfcModel = NTAG424DNA_TAGTAMPER`, запишите `physical.seal.nfc.uid` в `passport.json` и опубликуйте 16-байтовый ключ приложения EV2 как on-chain `nfcPublicKey`.
2. Экспортируйте Android handoff из `Verify` (после загрузки `passport.json` / `.odpass`, чтобы в него попал `nfcUid`) или из `Manage passport`; пилот заранее выбирает `odp-ntag424-ev2-symmetric-cr-v1`, когда `nfcPublicKey` занимает 16 байт.
3. Установите debug-APK Android companion на Pixel с включённым NFC.
4. Откройте handoff и пройдите пошаговые экраны (`Get setup` → `Review values` → необязательный файл → `Tap NFC now`).
5. При желании импортируйте на шаге необязательного файла локальный `.odpass` или `passport.json`, чтобы канонический `dataHash` тоже проверился на устройстве.
6. Если метке нужна аутентификация EV2, откройте `Operator tools`, введите локальные данные сессионной аутентификации, затем вернитесь в пошаговое сканирование или сканируйте из режима оператора.
7. Приложите Pixel к объекту. Сначала прочитайте результат простыми словами, затем при необходимости `Technical details`. Для паспортов с TagTamper ищите **`highAssuranceSeal = pass`**: ключ EV2 совпал + аутентифицированный TagTamper INTACT + UID чипа совпал, когда он ожидается.
8. Tag TrustLink используйте только как дополнительный ориентир, если нужен второй путь проверки; основным путём пилота он больше не является.

## Рекомендуемый issuer flow

### 1. Подготовьте чип

Подготовьте (провижньте) физическую метку на телефоне или в инструментах NXP.

**ODP Android Companion (рекомендуется на Pixel):** Issue workflow → **Prepare to provision** → подтвердите → приложите метку → скопируйте JSON `odp-chip-provision`. Подготовка оставляет NDEF **доступным для записи** (ключ EV2 0) до шага **Write NFC carrier** после минта, который затем переводит CC/NDEF в режим только для чтения.

**NXP TagWriter / ПК:** тот же результат, если метка уже персонализирована в другом месте.

Минимально вам нужны:

- реальный чип
- **16-байтовый ключ приложения EV2** из подготовки (он становится on-chain `nfcPublicKey`)
- успешное сканирование **issuer-chip-setup** в Android companion **до** минта (см. [ISSUER_NFC_FLOW.md](./ISSUER_NFC_FLOW.md))
- tamper-aware установка чипа на объект

Библиотека: подготовка использует вендоренный код из [AndroidCrypto/Ntag424SdmFeature](https://github.com/AndroidCrypto/Ntag424SdmFeature) (`net.bplearning.ntag424`, MIT). См. [odp-android-companion/ntag424-dna/NOTICE.md](https://github.com/object-digital-passport/odp-android-companion/blob/main/ntag424-dna/NOTICE.md).

### 2. Выпустите ODP-паспорт

В [`frontend/passport.html`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/frontend/passport.html) (репозиторий сайта):

1. выберите `physical` или `mixed`
2. выберите NFC seal (`sealType = 1` или `3`)
3. задайте `NFC model = NTAG424DNA_TAGTAMPER`
4. вставьте публичный ключ чипа в NFC-секцию
5. завершите минт как обычно

Так создаётся публичная ODP-запись, которая потом связывает результат проверки чипа с паспортом.

### 3. Соберите offline / NDPP payload

В модальном окне управления паспортом:

1. откройте `Manage passport`
2. перейдите в `Offline payload / NDPP`
3. сгенерируйте компактный payload
4. при необходимости включите NDPP-совместимый carrier mode
5. скачайте:
   - `CBOR` для raw payload bytes
   - `NDEF file` для Android / NFC-writing flow
6. при желании заякорите отпечаток payload в NDPP slot on-chain

Если вы используете NDPP-совместимый carrier mode:

- **первая** NDEF-запись — это ODP Verify link
- **вторая** запись несёт детерминированный `odp:off` payload
- `ndppCommitmentHash` всё равно хэширует только raw-байты второй записи
- `ndppCommitmentUri` должен указывать на размещённую копию этих же raw public payload bytes, а не на страницу Verify

ODP web также показывает Android helper block с:

- Passport ID
- Verify link
- on-chain NFC model
- on-chain chip key

Эти значения удобно использовать при переходе в Android-инструменты.

## Flow через TagWriter

Используйте этот вариант, когда цель: "по тапу сразу открывать ODP verification".

Рекомендуемый паттерн:

1. запишите URI `odp://` первой записью — он называет паспорт и ничего больше:

```text
odp://ODP-2026-03-004829301
```

2. если нужен ODP offline payload на том же carrier, вместо этого запишите экспортированный файл `.ndef`
3. добавляйте HTTPS-запись, только если вы решили принять её цену — см. ниже

**Не записывайте имя хоста, если не готовы к тому, что это навсегда.** `SPEC.md` §12 и §22.14 прямо говорят, что
имя хоста не печатается: URL на метке — это обещание о сервере, закреплённое на объекте, который
переживёт этот сервер. Раньше эта документация советовала записывать сюда адрес GitHub Pages проекта.
Это было ошибкой, и любая записанная так метка продолжает указывать туда, куда в итоге будет вести этот адрес.

HTTPS-запись — настоящее удобство: телефон без обработчика ODP хоть что-то откроет, —
поэтому она остаётся доступной. Это выбор с последствиями, а не вариант по умолчанию.

Практический смысл:

- URL-first — самый phone-friendly entry layer
- открытие этого URL — только шаг открытия carrier
- это ещё не аутентификация чипа и не решение о подлинности паспорта

## Flow через Tag TrustLink

Используйте этот путь, когда цель: "аутентифицировать NTAG 424 DNA TagTamper и прочитать tamper state".

Рекомендуемый операторский workflow:

1. приложите Android к объекту
2. в Tag TrustLink выполните chip-side validation / secure-message flow
3. прочитайте там же TagTamper state
4. сравните задокументированные живые байты mirror-profile из Android-результата с on-chain `nfcPublicKey` в ODP
5. затем используйте ODP Verify, чтобы сравнить:
   - Passport ID
   - issuer / creator
   - детали объекта
   - `.odpass` / `dataHash`
   - при необходимости image / offline payload hashes

Так вы получаете отдельные ответы на отдельные вопросы:

- "Аутентифицировался ли чип?"
- "Был ли tamper?"
- "Совпадает ли этот чип с on-chain passport binding?"
- "Совпадают ли канонические данные паспорта с реестром?"

## Workflow верификатора

Для полевого верификатора схема такая:

1. тапнуть объект
2. если тег открывает ODP Verify link, посмотреть запись паспорта
3. если нужна повышенная уверенность, использовать Tag TrustLink на Android
4. подтвердить отдельно:
   - carrier открывает ожидаемую ODP verifier entry point
   - чип аутентифицируется
   - tamper status приемлемый
   - public key чипа совпадает с on-chain `nfcPublicKey`
   - `.odpass` / `dataHash` / изображения совпадают при необходимости
   - опциональный NDPP / offline payload совпадает с `ndppCommitmentHash`, если этот слой используется

## Что web умеет и чего не умеет

Браузер уже умеет:

- показывать ODP registry record
- показывать `nfcModel` и `nfcPublicKey`
- генерировать `odpOffline`
- экспортировать NFC carrier files
- якорить NDPP / offline payload hash
- проверять `.odpass`, изображения и публичные данные из реестра

Браузер **не** умеет:

- низкоуровневый EV2/аутентифицированный read flow для NTAG 424 DNA
- чтение TagTamper status
- прямую secure-аутентификацию чипа

Поэтому практическая архитектура сейчас такая:

- `web` для ODP registry и payload tooling
- `Android app` для аутентификации чипа и статуса tamper

Низкоуровневая работа с NTAG 424 DNA может опираться на источники вроде `AndroidCrypto/Ntag424SdmFeature`, но это должно оставаться техническим материалом, а не архитектурой самого ODP-верификатора.

## Рекомендуемый текущий пилот

Если нужен реалистичный первый деплой:

1. используйте ODP web для выпуска
2. используйте URL-first NFC carrier для tap entry
3. используйте APK ODP Android Companion на Pixel для импорта handoff, EV2/аутентифицированного чтения и пилотного `chipKeyMatch`
4. используйте ODP Verify для реестра и целостности файлов
5. сравнивайте результат Android companion с on-chain `nfcPublicKey`
6. Tag TrustLink используйте только как необязательную перекрёстную проверку, а не как основной путь пилота

Так вы уже получаете рабочую связку ODP + TagTamper для текущего пилота, не заявляя полностью универсального верификатора по максимуму спецификации и полностью заданного нативного пути произвольного challenge-response.

Для объёма dedicated-app смотрите `docs/ANDROID_VERIFIER_MVP.md`.
