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
| **[`SPEC.md`](../../SPEC.md)** (корень, EN — нормативный) | Протокол, **§15 `.odpass`**. RU (справочный, линия v0.7): [`../SPEC.md`](SPEC.md). |
| **[`V0.6.md`](../../docs/V0.6.md)** | Историческая линия v0.6 (on-chain поколение **6**, задеплоена в Polygon mainnet): карточка on-chain, `anchors[]`, append-only события. RU: [`V0.6.md`](V0.6.md). |
| **[`RELEASE_v0.6.md`](RELEASE_v0.6.md)** | Заметки к релизу v0.6: развёрнутые адреса, цифры по EIP-170, `ODPAuthorAttestation`, правки схемы и документации. EN: [`../RELEASE_v0.6.md`](../RELEASE_v0.6.md). |
| **[`REQUIREMENTS_FIELDS_V0.6.md`](REQUIREMENTS_FIELDS_V0.6.md)** | Обоснование модели хранения v0.6 и таблицы полей (на русском). |
| **[`GUIDE.md`](../GUIDE.md)** (EN) | Подробный гайд. RU: [`GUIDE.md`](GUIDE.md). |
| **[`chain/deploy/README.md`](../../chain/deploy/README.md)** | Деплой Hardhat. |
| **[`GLOSSARY.md`](GLOSSARY.md)** | Термины текущего поколения и список отменённых. EN: [`../GLOSSARY.md`](../GLOSSARY.md). |
| **[`SECURITY.md`](SECURITY.md)** | Модель угроз. EN: [`../../docs/SECURITY.md`](../../docs/SECURITY.md). |
| **[`ANDROID.md`](https://github.com/object-digital-passport/object-digital-passport.github.io/blob/main/docs/ANDROID.md)** | Handoff и границы доверия для приложения-верификатора NFC. Опубликованного приложения пока нет — см. [GUIDE.md](GUIDE.md#как-читают-nfc-пломбу). |
| **[`ANDROID_NTAG424DNA_TAGTAMPER.md`](ANDROID_NTAG424DNA_TAGTAMPER.md)** | Практический workflow TagTamper. |
| **[`ISSUER_NFC_FLOW.md`](ISSUER_NFC_FLOW.md)** | Обязательный порядок минта физического паспорта с пломбой NTAG 424: сканировать чип до минта, публиковать немастер-ключ. EN: [`../ISSUER_NFC_FLOW.md`](../ISSUER_NFC_FLOW.md). |
| **[`VERSIONING_AND_RELEASES.md`](VERSIONING_AND_RELEASES.md)** | Теги git, `main`, хотфиксы против веток с возможностями. EN: [`../VERSIONING_AND_RELEASES.md`](../VERSIONING_AND_RELEASES.md). |
| **[`IDEAS_V1.md`](IDEAS_V1.md)** | Неформальные направления к v1 (не спецификация). Написан по-русски; английской версии нет. |
| **[`ORG_NAMING_AND_SITE.md`](ORG_NAMING_AND_SITE.md)** | Имена репозиториев по образцу c2pa-org и как укоротить опубликованный адрес сайта. В основном применено 22–23.08.2026 — раздел «Итог» фиксирует цену и где рассуждение было неверным. EN: [`../ORG_NAMING_AND_SITE.md`](../ORG_NAMING_AND_SITE.md). |
| **[`OBJECTID_PROFILE.md`](OBJECTID_PROFILE.md)** | Опциональный профиль: девять категорий Object ID на поля `passport.json` плюс модель приватности «публикуем при происшествии». EN: [`../OBJECTID_PROFILE.md`](../OBJECTID_PROFILE.md). |
| **[`EDITION_ISSUER_TOOL.md`](EDITION_ISSUER_TOOL.md)** | **Историческая передача, заменена** для инструмента эмитента выпуска: алгоритмы, побайтовые кодировки, выходные файлы, церемония, вызов контракта и контрольные векторы. EN: [`../EDITION_ISSUER_TOOL.md`](../EDITION_ISSUER_TOOL.md). |
| **[`REPOSITORY_LAYOUT.md`](REPOSITORY_LAYOUT.md)** | Где лежат `SPEC.md`, `schema/`, `chain/`, `docs/` и `tools/` и что выехало наружу. EN: [`../REPOSITORY_LAYOUT.md`](../REPOSITORY_LAYOUT.md). |
| **[`PROTOCOL_TRACKS.md`](PROTOCOL_TRACKS.md)** | Текущие реализованные и отложенные функции; прежние направления заменены. EN: [`../PROTOCOL_TRACKS.md`](../PROTOCOL_TRACKS.md). |
| **[`EIP170_STRATEGY.md`](EIP170_STRATEGY.md)** | Варианты по лимиту размера байткода до деплоя в основную сеть. EN: [`../EIP170_STRATEGY.md`](../EIP170_STRATEGY.md). |
| **[`ANDROID_VERIFIER_MVP.md`](ANDROID_VERIFIER_MVP.md)** | Область MVP отдельного NFC-верификатора. Не реализована; граница по-прежнему верна. EN: [`../ANDROID_VERIFIER_MVP.md`](../ANDROID_VERIFIER_MVP.md). |

## Исторические

| Документ | Назначение |
|----------|------------|
| [`V0.5.md`](V0.5.md) | Историческая линия v0.5 (поколение **5** — вытеснена деплоем v0.6; остаётся читаемой в Verify). EN: [`../V0.5.md`](../V0.5.md). |
| [`V0.3.md`](V0.3.md) … [`V0.4.md`](V0.4.md) | Исторические линии. Заметки к релизам: [`RELEASE_v0.3.md`](RELEASE_v0.3.md), [`RELEASE_v0.4.md`](RELEASE_v0.4.md). |
| [`RELEASE_v0.4.1.md`](../../docs/RELEASE_v0.4.1.md) | Патч v0.4.1. RU: [`../RELEASE_v0.4.1.md`](RELEASE_v0.4.1.md). |

Полный EN-индекс: [`../../docs/README.md`](../../docs/README.md).

---

*Краткий вход: [`../README.md`](../README.md) (подробный гайд по-русски) · корневая главная: [`../../README.ru.md`](../../README.ru.md).*
