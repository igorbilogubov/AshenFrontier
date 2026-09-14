# Лесная почва и окружение

Сверено 14 сентября 2026 для приватного репозитория. Запуск и параллельные рабочие папки: [WORKFLOW.md](../../WORKFLOW.md).

Окружение строится в `public/game/environment.js`, общие препятствия и деревья — в `public/game/terrain.js`.

## Новый материал

- Файл проекта: `public/game/materials/forest-floor-v1.png`.
- [Текстура в проекте](../../public/game/materials/forest-floor-v1.png).
- Создана встроенным **Codex ImageGen**, без CLI/API fallback.
- Оригинальный PNG включён в репозиторий по указанному выше пути; рабочая копия вне проекта в каталоге Codex не требуется для clone, запуска или редактирования.
- В проект скопирован оригинальный PNG. Цвет и смешивание дороги настраиваются в 3D-материале; исходное изображение не перерисовывалось.
- Визуально проверена в сцене. Повторение и освещение настроены для игрового масштаба, бесшовность на всех возможных масштабах не заявляется.

### Точный промпт

> Use case: stylized-concept. Asset type: seamless tileable albedo texture for a 3D dark fantasy forest floor. Generate ONE square 1024 by 1024 texture, entire image a flat overhead orthographic material scan covering about 3 metres of ground. Art-directed painterly realism for a premium stylized RPG: compact warm grey-brown woodland earth with fine granular detail, restrained irregular muted sage moss patches, sparse small dry ochre leaves, pine needles, tiny broken twigs and embedded grey slate gravel. About 70 percent exposed soil, 25 percent soft moss, 5 percent fine debris. Rich natural micro texture but readable calm broad tonal shapes, medium-light diffuse albedo, balanced earthy colors. Perfectly flat diffuse illumination, no baked directional lighting, no cast shadows, no highlights, no ambient vignette. Must tile seamlessly in both horizontal and vertical directions, edges match. No horizon, no perspective, no large stones, no grass clumps, no plants standing up, no paths drawn into the texture, no symbols, no text, no border, no grid, no watermark.
