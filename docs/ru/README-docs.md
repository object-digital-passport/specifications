# Актуальная документация ODP 0.7 — ABI 0.7-redesign-8

Нормативна [английская SPEC](../../SPEC.md). Начните с [дельты и открытых решений](../../ODP_07_ABI6_DOCUMENTATION_DELTA.md), [плана](../../ODP_07_ACTION_PLAN.md), [app handoff](../../ODP_07_APP_HANDOFF.md), [безопасности](SECURITY.md), [глоссария](GLOSSARY.md), [tools](../../chain/tools/README.md) и [deployment](../../chain/deploy/README.md).

[Запечатанный пакет аудитору](../../review/audit-handoff-abi6/README.md) описывает прежнюю ABI `0.7-redesign-6` и текущие исходники не подтверждает; его hashes и отчёты сохранены. Утверждённый release-бандл `0.7-redesign-7` (`review/v07-abi7-release/`) тоже прошлый снимок. Поколение `0.7-redesign-8` добавляет неизменяемый `previewHash` (SPEC §8, §9, §22.19). Архитектурные ревью, прежние решения/ADR, аудиты, guides v0.6 и старые модели тиражей ниже — исторические материалы. Их diagrams/errors не описывают текущее поколение: profile stop, mint-agent, unit-passport hooks, governance/freeze, единое окно отзыва 72 часа и обязательный Amoy заменены текущей SPEC.

Bundle содержит `passport.json`, `generation.json`, `receipt.json`, `manifest.json` и `files/<sha256hex>`, в том числе облегчённую публичную копию фото, если она есть. Reference validator проверяет распакованные entries, но не ZIP и не chain evidence. Контракты — локальный кандидат; готовность приложения и выдачи отдельно не приняты. Цель — Polygon mainnet, Amoy не используется; ничего не развёрнуто, production generation не утверждена. Кошелёк, внешняя сеть, deployment и публикация сейчас запрещены.

## Исторический каталог и общие инструкции репозитория


# Индекс документации

*Автор: Андрей Черников*

*Дружелюбные объяснения (быстрый старт, проверка, NFC-пломбы, Object ID, FAQ — 🇬🇧/🇷🇺) — на [вики проекта](https://github.com/object-digital-passport/specifications/wiki/Home-ru).*

## С чего начать

| Документ | Назначение |
|----------|------------|
| **[`CHANGELOG.md`](CHANGELOG.md)** | Журнал изменений проекта по формату Keep a Changelog. EN: [`../../CHANGELOG.md`](../../CHANGELOG.md). |
| **[`TRANSLATIONS.md`](../TRANSLATIONS.md)** | У каких документов есть русская версия, какие запланированы и какие намеренно не переводятся. Проверяется `tools/check-translations.mjs` в CI. |
| **[`releases/`](../releases/)** | **Начните здесь, если вопрос «что изменилось и касается ли это меня»**: одна короткая заметка без жаргона на каждую версию (на английском). Пишутся по [`.github/RELEASE_TEMPLATE.md`](../../.github/RELEASE_TEMPLATE.md). |
| **[`SPEC.md`](../../SPEC.md)** (корень, EN — нормативный) | Протокол: `passport.json`, поля в цепочке, проверка, **§15 `.odpass`**. RU (справочный полный перевод, линия v0.7): [`SPEC.md`](SPEC.md). |
| **[`V0.6.md`](../../docs/V0.6.md)** | Историческая линия v0.6 (on-chain поколение **6**, задеплоена в Polygon mainnet): карточка on-chain, `anchors[]`, append-only события. RU: [`V0.6.md`](V0.6.md). |
| **[`RELEASE_v0.6.md`](RELEASE_v0.6.md)** | Заметки к релизу v0.6: развёрнутые адреса, цифры по EIP-170, `ODPAuthorAttestation`, правки схемы и документации. EN: [`../RELEASE_v0.6.md`](../RELEASE_v0.6.md). |
| **[`REQUIREMENTS_FIELDS_V0.6.md`](REQUIREMENTS_FIELDS_V0.6.md)** | Обоснование модели хранения v0.6 и таблицы полей (на русском). |
| **[`GUIDE.md`](../GUIDE.md)** (EN) | Исторический обзор и глоссарий v0.6; для текущего поколения используйте [`GLOSSARY.md`](GLOSSARY.md). RU: [`GUIDE.md`](GUIDE.md). |
| **[`chain/deploy/README.md`](../../chain/deploy/README.md)** | Развёртывание из закреплённого выпуска, манифест и возобновление, граница разрешения для Polygon mainnet. |
| **[`GLOSSARY.md`](GLOSSARY.md)** | Термины текущего поколения и список отменённых. EN: [`../GLOSSARY.md`](../GLOSSARY.md). |
| **[`SECURITY.md`](SECURITY.md)** | Модель угроз. EN: [`../../docs/SECURITY.md`](../../docs/SECURITY.md). |
| **[`ANDROID.md`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/docs/ANDROID.md)** | Handoff и границы доверия для приложения-верификатора NFC. Опубликованного приложения пока нет — см. [GUIDE.md](GUIDE.md#как-читают-nfc-пломбу). |
| **[`ANDROID_NTAG424DNA_TAGTAMPER.md`](ANDROID_NTAG424DNA_TAGTAMPER.md)** | Практический workflow NTAG424 TagTamper (ODP web + carrier + companion). EN: [`../ANDROID_NTAG424DNA_TAGTAMPER.md`](../ANDROID_NTAG424DNA_TAGTAMPER.md). |
| **[`ISSUER_NFC_FLOW.md`](ISSUER_NFC_FLOW.md)** | Обязательный порядок минта физического паспорта с пломбой NTAG 424: сканировать чип до минта, публиковать немастер-ключ. EN: [`../ISSUER_NFC_FLOW.md`](../ISSUER_NFC_FLOW.md). |
| **[`VERSIONING_AND_RELEASES.md`](VERSIONING_AND_RELEASES.md)** | Теги git, `main`, хотфиксы против веток с возможностями. EN: [`../VERSIONING_AND_RELEASES.md`](../VERSIONING_AND_RELEASES.md). |
| **[`IDEAS_V1.md`](IDEAS_V1.md)** | Неформальные направления к v1 (не спецификация). Написан по-русски; английской версии нет. |
| **[`ORG_NAMING_AND_SITE.md`](ORG_NAMING_AND_SITE.md)** | Имена репозиториев по образцу c2pa-org и как укоротить опубликованный адрес сайта. В основном применено 22–23.08.2026 — раздел «Итог» фиксирует цену и где рассуждение было неверным. EN: [`../ORG_NAMING_AND_SITE.md`](../ORG_NAMING_AND_SITE.md). |
| **[`OBJECTID_PROFILE.md`](OBJECTID_PROFILE.md)** | Опциональный профиль: девять категорий Object ID на поля `passport.json` плюс модель приватности «публикуем при происшествии». EN: [`../OBJECTID_PROFILE.md`](../OBJECTID_PROFILE.md). |
| **[`EDITION_ISSUER_TOOL.md`](EDITION_ISSUER_TOOL.md)** | **Историческая передача, заменена** для инструмента эмитента выпуска: алгоритмы, побайтовые кодировки, выходные файлы, церемония, вызов контракта и контрольные векторы. EN: [`../EDITION_ISSUER_TOOL.md`](../EDITION_ISSUER_TOOL.md). |
| **[`REPOSITORY_LAYOUT.md`](REPOSITORY_LAYOUT.md)** | Где лежат `SPEC.md`, `schema/`, `chain/`, `docs/` и `tools/` и что выехало наружу. EN: [`../REPOSITORY_LAYOUT.md`](../REPOSITORY_LAYOUT.md). |
| **[`PROTOCOL_TRACKS.md`](PROTOCOL_TRACKS.md)** | Текущие реализованные и отложенные функции; прежние направления заменены. EN: [`../PROTOCOL_TRACKS.md`](../PROTOCOL_TRACKS.md). |
| **[`EIP170_STRATEGY.md`](EIP170_STRATEGY.md)** | Варианты по лимиту размера байткода до деплоя в основную сеть. EN: [`../EIP170_STRATEGY.md`](../EIP170_STRATEGY.md). |

## Исторические

| Документ | Назначение |
|----------|------------|
| [`V0.5.md`](V0.5.md) | Историческая линия v0.5 (поколение в цепочке **5**): развёрнута в Polygon mainnet, тега не получила, заменена v0.6. См. [`releases/v0.5.md`](../releases/v0.5.md). EN: [`../V0.5.md`](../V0.5.md). |
| [`V0.3.md`](V0.3.md) | v0.3 против v0.2. EN: [`../V0.3.md`](../V0.3.md); русская заметка к релизу: [`RELEASE_v0.3.md`](RELEASE_v0.3.md). |
| [`V0.4.md`](V0.4.md) | Заметки исторической линии v0.4. EN: [`../V0.4.md`](../V0.4.md); русская заметка к релизу: [`RELEASE_v0.4.md`](RELEASE_v0.4.md). |
| [`RELEASE_v0.4.1.md`](RELEASE_v0.4.1.md) | Заметки к патчу v0.4.1. EN: [`../RELEASE_v0.4.1.md`](../RELEASE_v0.4.1.md). |
| [`archive/DOCS_REVIEW_PLAN_v0.5.md`](../archive/DOCS_REVIEW_PLAN_v0.5.md) | Завершённая плановая записка (проход по README, SPEC и docs), на английском. |
| [`ANDROID_VERIFIER_MVP.md`](ANDROID_VERIFIER_MVP.md) | Короткая область MVP; [`ANDROID_COMPANION_APP.md`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/docs/ANDROID_COMPANION_APP.md) перенаправляет в репозиторий companion. EN: [`../ANDROID_VERIFIER_MVP.md`](../ANDROID_VERIFIER_MVP.md). |
| [`EDITION_UNIT_KEYS.md`](EDITION_UNIT_KEYS.md) | **Черновик v0.7**: паспорта тиража и ключи активации для каждой единицы серийных тиражей (профиль B). EN: [`../EDITION_UNIT_KEYS.md`](../EDITION_UNIT_KEYS.md). |
| [`community/discussion-passport-ui-v0.4-EN.md`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/docs/community/discussion-passport-ui-v0.4-EN.md) | Черновик обсуждения на GitHub (EN). |

## Бандл `.odpass` (текущий указатель)

- [SPEC §15](SPEC.md#15-бандл-odpass) ([EN](../../SPEC.md#15-odpass-bundle)), [формат бандла](../../schema/bundle-0.7/README.md): четыре корневых файла JSON и содержимое в `files/`.
- [Эталонные инструменты](../../chain/tools/README.md): `bundle.mjs` проверяет распакованные записи и список и дерево тиража. `mint.py` выведен из работы и намеренно завершается ошибкой.
- Хостинг — необязательный транспорт для неизменённых байтов. Безопасный ZIP, политика удалённой загрузки и интеграция в приложение требуют отдельной реализации и приёмки.

Полный EN-индекс: [`../../docs/README.md`](../../docs/README.md).

---

*Краткий вход: корневой [`README.ru.md`](../../README.ru.md) (EN: [`README.md`](../../README.md)) · подробный гайд по-русски: [`GUIDE.md`](GUIDE.md).*
