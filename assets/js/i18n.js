(function() {
  const STORAGE_KEY = 'phone_demo_lang';

  async function fetchCsvRows(path) {
    return new Promise((resolve, reject) => {
      Papa.parse(path, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data || []),
        error: reject
      });
    });
  }

  async function loadEnabledLanguages() {
    const rows = await fetchCsvRows('data/filters/base/languages.csv');
    return rows
      .filter(r => String(r.enabled).toLowerCase() === 'true')
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }

  function getPreferredLanguage(availableCodes) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && availableCodes.includes(saved)) return saved;
    const raw = String(navigator.language || 'zh').toLowerCase();
    if (availableCodes.includes(raw)) return raw;
    const primary = raw.split('-')[0];
    if (availableCodes.includes(primary)) return primary;
    return availableCodes.includes('zh') ? 'zh' : (availableCodes[0] || 'zh');
  }

  async function initI18n(requestedLang) {
    await i18next.use(i18nextHttpBackend).init({
      lng: requestedLang,
      fallbackLng: 'zh',
      ns: ['common'],
      defaultNS: 'common',
      backend: { loadPath: 'locales/{{lng}}/{{ns}}.json' },
      interpolation: { escapeValue: false }
    });
  }

  async function ensureI18n(requestedLang) {
    if (!i18next.isInitialized) {
      await initI18n(requestedLang);
    } else if (i18next.language !== requestedLang) {
      await i18next.changeLanguage(requestedLang);
    }
  }

  async function init() {
    const languages = await loadEnabledLanguages();
    const codes = languages.map(r => r.code);
    const lang = getPreferredLanguage(codes);
    await ensureI18n(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    return lang;
  }

  async function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    await ensureI18n(lang);
    return lang;
  }

  function t(key, options) {
    return i18next.t(key, options || {});
  }

  window.PhoneDemoI18n = {
    STORAGE_KEY,
    loadEnabledLanguages,
    getPreferredLanguage,
    ensureI18n,
    setLanguage: setLang,
    setLang,
    init,
    t
  };
})();