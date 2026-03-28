import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'en' | 'ru';

export const translations = {
  en: {
    catalog: {
      createBootstrap: 'Create Bootstrap Image',
      builderTitle: 'Bootstrap Image Builder',
      builderDescription: 'Build a self-contained worker image with one or more isolated Python environments, the Cloud Forge SDK, and an editable Dockerfile preview.',
      imageName: 'Image name',
      imageNameHelp: 'The name of your image in Docker Hub. Use lowercase, numbers, dots, underscores, or dashes.',
      tag: 'Tag / Version',
      tagHelp: 'Semantic version or a unique label for this build (e.g., 0.1.0, latest).',
      baseImage: 'Base Docker image',
      baseImageHelp: 'The starting point for your image. If it contains weights, the build might take longer.',
      extraPackages: 'Extra pip packages (one per line)',
      extraPackagesHelp: 'List of Python packages to install in the default environment.',
      dockerHubUser: 'Username',
      dockerHubUserHelp: 'Your Docker Hub account username.',
      dockerHubPass: 'Password / Access token',
      dockerHubPassHelp: 'A personal access token or password with push permissions.',
      nextPreview: 'Next: Preview Dockerfile',
      buildAndPublish: 'Build & Publish',
      back: 'Back',
      building: 'The backend is building and pushing your bootstrap image',
      completed: 'Bootstrap image completed',
      failed: 'Bootstrap image failed',
      currentStage: 'Current stage',
      buildStages: 'Build stages',
      summary: 'Summary',
      rawLogs: 'Raw build logs',
      resumeAutoScroll: 'Resume auto-scroll',
      waitingLogs: 'Waiting for build logs...',
      cancelBuild: 'Cancel build',
      cancelling: 'Cancelling...',
      clearStatus: 'Clear build status',
      close: 'Close',
      hide: 'Hide',
      largeLayersTitle: 'Large base-image layers detected',
      largeLayersWarning: 'The builder is downloading very large layers from the selected base image. The first build can take a long time and may require tens of GB of free disk space.',
      largeLayersInfo: 'Large container layers are being downloaded. This is expected for model-heavy images and usually happens before the Dockerfile steps start running.',
      stages: {
        queued: { title: 'Queued', description: 'Preparing build request and generating context.' },
        assets: { title: 'Runtime assets', description: 'Injecting Cloud Forge runtime assets and SDK files.' },
        pulling: { title: 'Base image', description: 'Resolving and pulling the selected base image.' },
        downloading: { title: 'Large layers', description: 'Downloading and extracting container layers.' },
        building: { title: 'Build image', description: 'Executing Dockerfile steps and creating the derived image.' },
        pushing: { title: 'Push image', description: 'Publishing the final bootstrap image to Docker Hub.' },
      },
    },
    floating: {
      buildInProgress: 'Build is in progress. You can reopen the logs monitor.',
      buildCompleted: 'Build completed successfully.',
      buildFailed: 'Build failed or was cancelled.',
      openMonitor: 'Open Monitor',
      dismiss: 'Dismiss',
    },
  },
  ru: {
    catalog: {
      createBootstrap: 'Создать Bootstrap Image',
      builderTitle: 'Конструктор Bootstrap-образов',
      builderDescription: 'Соберите изолированный образ воркера с одним или несколькими окружениями Python, Cloud Forge SDK и возможностью редактирования Dockerfile.',
      imageName: 'Имя образа',
      imageNameHelp: 'Имя вашего образа в Docker Hub. Используйте строчные буквы, цифры, точки, подчеркивания или дефисы.',
      tag: 'Тег / Версия',
      tagHelp: 'Семантическая версия или уникальная метка для этой сборки (например, 0.1.0, latest).',
      baseImage: 'Базовый Docker-образ',
      baseImageHelp: 'Исходный образ. Если он содержит веса моделей, сборка может занять больше времени.',
      extraPackages: 'Доп. pip-пакеты (по одному на строку)',
      extraPackagesHelp: 'Список Python-пакетов для установки в окружение по умолчанию.',
      dockerHubUser: 'Имя пользователя',
      dockerHubUserHelp: 'Ваше имя пользователя в Docker Hub.',
      dockerHubPass: 'Пароль / Токен доступа',
      dockerHubPassHelp: 'Личный токен доступа или пароль с правами на push.',
      nextPreview: 'Далее: Предпросмотр Dockerfile',
      buildAndPublish: 'Собрать и опубликовать',
      back: 'Назад',
      building: 'Бэкенд собирает и публикует ваш bootstrap-образ',
      completed: 'Сборка завершена',
      failed: 'Ошибка сборки',
      currentStage: 'Текущий этап',
      buildStages: 'Этапы сборки',
      summary: 'Сводка',
      rawLogs: 'Логи сборки',
      resumeAutoScroll: 'Вернуть автопрокрутку',
      waitingLogs: 'Ожидание логов...',
      cancelBuild: 'Отменить сборку',
      cancelling: 'Отмена...',
      clearStatus: 'Очистить статус',
      close: 'Закрыть',
      hide: 'Скрыть',
      largeLayersTitle: 'Обнаружены тяжелые слои базы',
      largeLayersWarning: 'Сборщик загружает очень тяжелые слои базового образа. Первая сборка может занять много времени и потребовать десятки ГБ места.',
      largeLayersInfo: 'Загружаются тяжелые слои контейнера. Это ожидаемо для образов с моделями и обычно происходит до начала выполнения шагов Dockerfile.',
      stages: {
        queued: { title: 'В очереди', description: 'Подготовка запроса на сборку и генерация контекста.' },
        assets: { title: 'Ассеты рантайма', description: 'Инъекция ассетов Cloud Forge и файлов SDK.' },
        pulling: { title: 'Базовый образ', description: 'Разрешение и загрузка выбранного базового образа.' },
        downloading: { title: 'Тяжелые слои', description: 'Загрузка и распаковка слоев контейнера.' },
        building: { title: 'Сборка образа', description: 'Выполнение шагов Dockerfile и создание производного образа.' },
        pushing: { title: 'Публикация', description: 'Публикация финального образа в Docker Hub.' },
      },
    },
    floating: {
      buildInProgress: 'Сборка всё ещё идёт. Можно снова открыть окно с логами.',
      buildCompleted: 'Сборка завершена успешно.',
      buildFailed: 'Сборка завершилась ошибкой или была отменена.',
      openMonitor: 'Открыть монитор',
      dismiss: 'Скрыть',
    },
  },
};

type TranslationKey = typeof translations.en;

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TranslationKey;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('cloudforge.lang');
    if (saved === 'ru' || saved === 'en') return saved;
    return navigator.language.startsWith('ru') ? 'ru' : 'en';
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('cloudforge.lang', newLang);
  };

  const t = translations[lang];

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
