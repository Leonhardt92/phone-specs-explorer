
const CAMERA_ROLES = [
  { key: 'front', titleKey: 'frontTitle', descKey: 'frontDesc' },
  { key: 'main', titleKey: 'mainTitle', descKey: 'mainDesc' },
  { key: 'ultrawide', titleKey: 'ultrawideTitle', descKey: 'ultrawideDesc' },
  { key: 'periscope', titleKey: 'periscopeTitle', descKey: 'periscopeDesc' }
];
const ADVANCED_PANELS = ['camera', 'screen', 'wireless', 'hardware'];
const BOOLEAN_CHECKBOX_NAMES = ['frontOis', 'mainOis', 'ultrawideOis', 'periscopeOis', 'jack35', 'nfc', 'ir'];

const state = {
  lang: 'zh',
  languages: [],
  controls: {},
  optionData: {},
  phones: [],
  selectedBandTreeValues: [],
  bandTree: null,
  selectedChargingProtocolTreeValues: [],
  chargingProtocolTree: null,
  activePanel: 'camera'
};

function tr(key, options = {}) { return window.PhoneDemoI18n.t(key, options); }
function escapeHtml(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function setTextIfExists(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function getMotorOptionLabel(row) {
  return state.lang === 'en'
    ? (row.label_en || row.label_zh || row.value)
    : (row.label_zh || row.label_en || row.value);
}
function getMotorLabelByValue(value) {
  const row = (state.optionData.motorRows || []).find(item => String(item.value) === String(value));
  if (!row) return String(value || '');
  return getMotorOptionLabel(row);
}
function parseCsvFile(path) {
  return new Promise((resolve, reject) => {
    Papa.parse(path, { download: true, header: true, skipEmptyLines: true, complete: (r) => resolve(r.data || []), error: reject });
  });
}
function groupBy(rows, keyField) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row[keyField]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}
function normalizeRangeRows(rows, minKey, maxKey) {
  return rows.map(r => ({
    value: r.value, label: r.label,
    min: Number(r[minKey] || 0), max: Number(r[maxKey] || 0),
    sort: Number(r.sort_order || 0)
  })).sort((a, b) => a.sort - b.sort);
}
function normalizeValueRows(rows, valueKey='value', labelKey='label') {
  return rows.map(r => ({
    value: r[valueKey], label: r[labelKey], sort: Number(r.sort_order || 0)
  })).sort((a, b) => a.sort - b.sort);
}
function initOrRefreshMultiSelect(controlName, selector, options, placeholder) {
  const select = document.querySelector(selector);
  if (!select) return null;
  select.innerHTML = options.map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join('');
  if (state.controls[controlName]) {
    const control = state.controls[controlName];
    const selected = control.getValue();
    control.clearOptions();
    control.addOptions(options);
    control.settings.placeholder = placeholder;
    control.inputState();
    if (selected) {
      const arr = Array.isArray(selected) ? selected : [selected];
      control.setValue(arr.filter(v => options.some(o => String(o.value) === String(v))), true);
    }
    return control;
  }
  state.controls[controlName] = new TomSelect(selector, {
    plugins: ['remove_button'],
    create: false,
    persist: false,
    hideSelected: true,
    maxOptions: 1000,
    placeholder,
    onChange() {
      applyFilters();
      updateAdvancedEntrySummary();
      updatePanelSummary();
    }
  });
  return state.controls[controlName];
}
function getSelectValues(name) {
  const control = state.controls[name];
  if (!control) return [];
  const value = control.getValue();
  return Array.isArray(value) ? value : (value ? [value] : []);
}
function getCheckboxValue(name) {
  const el = document.getElementById(`${name}Check`);
  return !!(el && el.checked);
}
function bindCheckboxEvents() {
  BOOLEAN_CHECKBOX_NAMES.forEach(name => {
    const el = document.getElementById(`${name}Check`);
    if (!el || el.dataset.bound === '1') return;
    el.addEventListener('change', () => {
      applyFilters();
      updateAdvancedEntrySummary();
      updatePanelSummary();
    });
    el.dataset.bound = '1';
  });
}
function roleLabel(roleKey) { return tr(`role.${roleKey}`); }
function boolLabel(v) { return v ? tr('support') : tr('notSupport'); }
function fmtOis(v) { return v ? tr('supportOis') : tr('noOis'); }
function compactModeLabel(mode) {
  if (mode === 'LTE_FDD') return 'LTE FDD';
  if (mode === 'LTE_TDD') return 'LTE TDD';
  return mode;
}
function humanBandModeLabel(generation, mode) {
  if (generation === '5G' && mode === 'SA') return tr('band.5GSA');
  if (generation === '5G' && mode === 'NSA') return tr('band.5GNSA');
  if (generation === '4G' && mode === 'LTE_FDD') return tr('band.4GFDD');
  if (generation === '4G' && mode === 'LTE_TDD') return tr('band.4GTDD');
  if (generation === '3G' && mode === 'UMTS') return tr('band.3G');
  if (generation === '2G' && mode === 'GSM') return tr('band.2G');
  return `${generation} ${mode}`;
}
function buildBandGroups(itemBands) {
  const grouped = {};
  (itemBands || []).forEach(b => {
    const key = `${b.generation}|${b.mode}`;
    if (!grouped[key]) grouped[key] = { generation: b.generation, mode: b.mode, bands: [] };
    grouped[key].bands.push(b.band);
  });
  const order = ['5G|SA','5G|NSA','4G|LTE_FDD','4G|LTE_TDD','3G|UMTS','2G|GSM'];
  return order.filter(key => grouped[key]).map(key => grouped[key]);
}
function buildBandTreeOptions(allBandRows) {
  const modeSortMap = new Map(state.optionData.bandModes.map(item => [item.value, item.sort]));
  const bandSortMap = new Map(state.optionData.bandOptions.map(item => [item.value, item.sort]));
  const grouped = {};
  allBandRows.forEach(row => {
    const gen = row.generation || '';
    const mode = row.mode || '';
    const band = row.band || '';
    if (!gen || !mode || !band) return;
    const key = `${gen}|${mode}`;
    if (!grouped[key]) grouped[key] = { generation: gen, mode, bands: new Set() };
    grouped[key].bands.add(band);
  });
  return ['5G','4G','3G','2G'].map(gen => ({
    name: gen,
    value: `GEN|${gen}`,
    children: Object.values(grouped)
      .filter(item => item.generation === gen)
      .sort((a, b) => (modeSortMap.get(`${a.generation}_${a.mode}`) || 999) - (modeSortMap.get(`${b.generation}_${b.mode}`) || 999))
      .map(item => ({
        name: compactModeLabel(item.mode),
        value: `${item.generation}|${item.mode}`,
        children: Array.from(item.bands).sort((a, b) => (bandSortMap.get(a) || 999) - (bandSortMap.get(b) || 999))
          .map(band => ({ name: band, value: `${item.generation}|${item.mode}|${band}`, children: [] }))
      }))
  })).filter(node => node.children.length > 0);
}
function initOrRefreshBandTree(allBandRows) {
  const container = document.getElementById('wirelessBandTreeContainer');
  if (!container) return;
  const previousValue = state.selectedBandTreeValues || [];
  container.innerHTML = '';
  state.bandTree = new Treeselect({
    parentHtmlContainer: container,
    value: previousValue,
    options: buildBandTreeOptions(allBandRows),
    openLevel: 1,
    showCount: true,
    expandSelected: true
  });
  state.bandTree.srcElement.addEventListener('input', (e) => {
    state.selectedBandTreeValues = Array.isArray(e.detail) ? e.detail : [];
    applyFilters();
    updateAdvancedEntrySummary();
    updatePanelSummary();
  });
}
function buildChargingProtocolGroups(protocolRows) {
  const grouped = new Map();
  (protocolRows || []).forEach(row => {
    const protocol = row.protocol || '';
    const power = Number(row.power_w || 0);
    if (!protocol) return;
    if (!grouped.has(protocol)) grouped.set(protocol, new Set());
    if (!Number.isNaN(power) && power > 0) grouped.get(protocol).add(power);
  });
  return Array.from(grouped.entries())
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([protocol, powers]) => ({
      protocol,
      powers: Array.from(powers).sort((a, b) => a - b)
    }));
}
function buildChargingProtocolTreeOptions(allProtocolRows) {
  return buildChargingProtocolGroups(allProtocolRows).map(group => ({
    name: group.protocol,
    value: `GROUP|${group.protocol}`,
    children: group.powers.map(power => ({
      name: `${group.protocol} ${power}W`,
      value: `${group.protocol}|${power}`,
      children: []
    }))
  }));
}
function initOrRefreshChargingProtocolTree(allProtocolRows) {
  const container = document.getElementById('chargingProtocolTreeContainer');
  if (!container) return;
  const previousValue = state.selectedChargingProtocolTreeValues || [];
  container.innerHTML = '';
  state.chargingProtocolTree = new Treeselect({
    parentHtmlContainer: container,
    value: previousValue,
    options: buildChargingProtocolTreeOptions(allProtocolRows || []),
    openLevel: 1,
    showCount: true,
    expandSelected: true
  });
  state.chargingProtocolTree.srcElement.addEventListener('input', (e) => {
    state.selectedChargingProtocolTreeValues = Array.isArray(e.detail) ? e.detail : [];
    applyFilters();
    updateAdvancedEntrySummary();
    updatePanelSummary();
  });
}
function rangeMatch(value, selectedValues, ranges) {
  if (!selectedValues.length) return true;
  if (value == null || Number.isNaN(value)) return false;
  const selectedRanges = ranges.filter(r => selectedValues.includes(r.value));
  return selectedRanges.some(r => value >= r.min && value <= r.max);
}
function discreteMatch(value, selectedValues) {
  if (!selectedValues.length) return true;
  return selectedValues.includes(String(value));
}
function listMatch(values, selectedValues) {
  if (!selectedValues.length) return true;
  const set = new Set((values || []).map(v => String(v)));
  return selectedValues.some(v => set.has(String(v)));
}
function bandTreeMatch(itemBands, selectedTreeValues) {
  if (!selectedTreeValues.length) return true;
  const keys = (itemBands || []).map(b => `${b.generation}|${b.mode}|${b.band}`);
  return selectedTreeValues.some(v => keys.includes(v));
}
function chargingProtocolTreeMatch(chargingProtocols, selectedTreeValues) {
  if (!selectedTreeValues.length) return true;
  if (!chargingProtocols || !chargingProtocols.length) return false;
  return selectedTreeValues.some(v => {
    const value = String(v);
    if (value.startsWith('GROUP|')) {
      const protocol = value.slice(6);
      return chargingProtocols.some(item => item.protocol === protocol);
    }
    const [protocol, powerStr] = value.split('|');
    const power = Number(powerStr || 0);
    return chargingProtocols.some(item => item.protocol === protocol && Number(item.power_w) === power);
  });
}
function cameraRoleMatch(item, roleKey) {
  const spec = item.cameraSpecByRole[roleKey];
  const mpValues = getSelectValues(`${roleKey}Mp`);
  const cmosValues = getSelectValues(`${roleKey}Cmos`);
  const apertureValues = getSelectValues(`${roleKey}Aperture`);
  const requireOis = getCheckboxValue(`${roleKey}Ois`);
  const anyFilter = mpValues.length || cmosValues.length || apertureValues.length || requireOis;
  if (!anyFilter) return true;
  if (!spec) return false;
  return (
    rangeMatch(spec.mp, mpValues, state.optionData.cameraMpRanges) &&
    rangeMatch(spec.cmos_size_inch, cmosValues, state.optionData.cameraCmosRanges) &&
    rangeMatch(spec.aperture, apertureValues, state.optionData.cameraApertureRanges) &&
    (!requireOis || spec.ois === true)
  );
}
function screenMatch(item) {
  const spec = item.screenSpec;
  const sizeValues = getSelectValues('screenSize');
  const resolutionValues = getSelectValues('screenResolution');
  const refreshValues = getSelectValues('screenRefresh');
  const brightnessValues = getSelectValues('screenBrightness');
  const anyFilter = sizeValues.length || resolutionValues.length || refreshValues.length || brightnessValues.length;
  if (!anyFilter) return true;
  if (!spec) return false;
  return (
    rangeMatch(spec.screen_size_inch, sizeValues, state.optionData.screenSizeRanges) &&
    discreteMatch(spec.resolution_tier, resolutionValues) &&
    rangeMatch(spec.max_refresh_hz, refreshValues, state.optionData.screenRefreshRanges) &&
    rangeMatch(spec.max_brightness_nits, brightnessValues, state.optionData.screenBrightnessRanges)
  );
}
function wirelessMatch(item) {
  return (
    bandTreeMatch(item.bands, state.selectedBandTreeValues || []) &&
    discreteMatch(item.wirelessSpec?.wifi, getSelectValues('wifi'))
  );
}
function hardwareMatch(item) {
  const spec = item.hardwareSpec;
  const requireJack = getCheckboxValue('jack35');
  const requireNfc = getCheckboxValue('nfc');
  const requireIr = getCheckboxValue('ir');
  const usbValues = getSelectValues('usb');
  const motorValues = getSelectValues('motor');
  const anyFilter = requireJack || requireNfc || requireIr || usbValues.length || motorValues.length;
  if (!anyFilter) return true;
  if (!spec) return false;
  return (
    (!requireJack || spec.has_3_5mm === true) &&
    (!requireNfc || spec.has_nfc === true) &&
    (!requireIr || spec.has_ir === true) &&
    discreteMatch(spec.usb_spec, usbValues) &&
    discreteMatch(spec.motor_type, motorValues)
  );
}
function chargingMatch(item) {
  const spec = item.chargingSpec;
  const powerValues = getSelectValues('chargingPower');
  const protocolTreeValues = state.selectedChargingProtocolTreeValues || [];
  const anyFilter = powerValues.length || protocolTreeValues.length;
  if (!anyFilter) return true;
  if (!spec) return false;
  return (
    rangeMatch(spec.max_power_w, powerValues, state.optionData.chargingPowerRanges) &&
    chargingProtocolTreeMatch(item.chargingProtocols || [], protocolTreeValues)
  );
}
function applyFilters() {
  const filtered = state.phones.filter(item => (
    discreteMatch(item.brand, getSelectValues('brand')) &&
    rangeMatch(item.battery_mah, getSelectValues('battery'), state.optionData.batteryRanges) &&
    listMatch(item.ramOptions, getSelectValues('ram')) &&
    listMatch(item.storageOptions, getSelectValues('storage')) &&
    rangeMatch(item.length_mm, getSelectValues('length'), state.optionData.lengthRanges) &&
    rangeMatch(item.width_mm, getSelectValues('width'), state.optionData.widthRanges) &&
    rangeMatch(item.thickness_mm, getSelectValues('thickness'), state.optionData.thicknessRanges) &&
    chargingMatch(item) &&
    CAMERA_ROLES.every(role => cameraRoleMatch(item, role.key)) &&
    screenMatch(item) &&
    wirelessMatch(item) &&
    hardwareMatch(item)
  ));
  renderRows(filtered);
}
function getCategorySummaryCount(category) {
  if (category === 'camera') {
    return CAMERA_ROLES.reduce((sum, role) =>
      sum + ['Mp','Cmos','Aperture'].reduce((acc, suffix) => acc + getSelectValues(`${role.key}${suffix}`).length, 0) + (getCheckboxValue(`${role.key}Ois`) ? 1 : 0), 0);
  }
  if (category === 'screen') return ['screenSize','screenResolution','screenRefresh','screenBrightness'].reduce((acc, name) => acc + getSelectValues(name).length, 0);
  if (category === 'wireless') return (state.selectedBandTreeValues || []).length + getSelectValues('wifi').length;
  if (category === 'hardware') return (getCheckboxValue('jack35') ? 1 : 0) + (getCheckboxValue('nfc') ? 1 : 0) + (getCheckboxValue('ir') ? 1 : 0) + getSelectValues('usb').length + getSelectValues('motor').length;
  return 0;
}
function updateAdvancedEntrySummary() {
  ADVANCED_PANELS.forEach(category => {
    const metaEl = document.getElementById(`${category}EntryMeta`);
    if (!metaEl) return;
    const count = getCategorySummaryCount(category);
    metaEl.textContent = count ? tr('enabledCount', { count }) : tr('disabled');
  });
}
function updatePanelSummary() {
  const box = document.getElementById('panelSummary');
  const category = state.activePanel;
  const count = getCategorySummaryCount(category);
  if (!count) {
    box.innerHTML = `<span class="summary-badge">${escapeHtml(tr('summaryDisabled'))}</span>`;
    return;
  }
  const badges = [];
  if (category === 'camera') {
    CAMERA_ROLES.forEach(role => {
      const roleCount = ['Mp','Cmos','Aperture'].reduce((acc, suffix) => acc + getSelectValues(`${role.key}${suffix}`).length, 0) + (getCheckboxValue(`${role.key}Ois`) ? 1 : 0);
      if (roleCount) badges.push(tr('summaryCount', { label: roleLabel(role.key), count: roleCount }));
    });
  } else if (category === 'screen') {
    [['screenSize','screenSize'], ['screenResolution','resolution'], ['screenRefresh','refreshRate'], ['screenBrightness','brightness']].forEach(([name, labelKey]) => {
      const n = getSelectValues(name).length;
      if (n) badges.push(tr('summaryCount', { label: tr(labelKey), count: n }));
    });
  } else if (category === 'wireless') {
    const bandCount = (state.selectedBandTreeValues || []).length;
    const wifiCount = getSelectValues('wifi').length;
    if (bandCount) badges.push(tr('summaryCount', { label: tr('bands'), count: bandCount }));
    if (wifiCount) badges.push(tr('summaryCount', { label: tr('wifi'), count: wifiCount }));
  } else if (category === 'hardware') {
    if (getCheckboxValue('jack35')) badges.push(tr('summaryCount', { label: tr('jack35'), count: 1 }));
    if (getCheckboxValue('nfc')) badges.push(tr('summaryCount', { label: tr('nfc'), count: 1 }));
    if (getCheckboxValue('ir')) badges.push(tr('summaryCount', { label: tr('ir'), count: 1 }));
    const usbCount = getSelectValues('usb').length;
    if (usbCount) badges.push(tr('summaryCount', { label: tr('usb'), count: usbCount }));
    const motorCount = getSelectValues('motor').length;
    if (motorCount) badges.push(tr('summaryCount', { label: tr('motor'), count: motorCount }));
  }
  box.innerHTML = badges.map(text => `<span class="summary-badge">${escapeHtml(text)}</span>`).join('');
}
function openPanel(category) {
  state.activePanel = category;
  const shell = document.getElementById('filterShell');
  const main = shell.querySelector('.filter-main');
  const panel = shell.querySelector('.filter-panel');

  shell.classList.add('panel-open');
  if (main) main.style.display = 'none';
  if (panel) panel.style.display = 'flex';

  ADVANCED_PANELS.forEach(key => {
    const el = document.getElementById(`panelSection-${key}`);
    if (el) el.style.display = key === category ? 'block' : 'none';
  });
  setTextIfExists('panelTitle', tr(`${category}PanelTitle`));
  setTextIfExists('panelDesc', tr(`${category}PanelDesc`));
  updatePanelSummary();
}
function closePanel() {
  const shell = document.getElementById('filterShell');
  const main = shell.querySelector('.filter-main');
  const panel = shell.querySelector('.filter-panel');

  shell.classList.remove('panel-open');
  if (main) main.style.display = 'block';
  if (panel) panel.style.display = 'none';
}
function setLangSelectOptions() {
  const select = document.getElementById('langSelect');
  select.innerHTML = state.languages.map(lang => {
    const label = state.lang === 'zh' ? (lang.label_zh || lang.label_native || lang.code) : (lang.label_en || lang.label_native || lang.code);
    return `<option value="${escapeHtml(lang.code)}">${escapeHtml(label)}</option>`;
  }).join('');
  select.value = state.lang;
}
function applyLanguageToStaticText() {
  document.title = tr('appTitle');
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  setTextIfExists('pageTitle', tr('appTitle'));
  setTextIfExists('pageSub', tr('appSub'));
  setTextIfExists('languageLabel', tr('language'));
  setTextIfExists('brandLabel', tr('brand'));
  setTextIfExists('batteryLabel', tr('battery'));
  setTextIfExists('ramLabel', tr('ram'));
  setTextIfExists('storageLabel', tr('storage'));
  setTextIfExists('dimensionsTitle', tr('dimensionsTitle'));
  setTextIfExists('lengthLabel', tr('length'));
  setTextIfExists('widthLabel', tr('width'));
  setTextIfExists('thicknessLabel', tr('thickness'));
  setTextIfExists('chargingPowerLabel', tr('chargingPower'));
  setTextIfExists('chargingProtocolLabel', tr('chargingProtocolTree'));
  setTextIfExists('mainFootNote', tr('mainFoot'));
  setTextIfExists('cameraEntryLabel', tr('cameraFilter'));
  setTextIfExists('screenEntryLabel', tr('screenFilter'));
  setTextIfExists('wirelessEntryLabel', tr('wirelessFilter'));
  setTextIfExists('hardwareEntryLabel', tr('hardwareFilter'));
  setTextIfExists('cameraEntryTitle', tr('openFilter'));
  setTextIfExists('screenEntryTitle', tr('openFilter'));
  setTextIfExists('wirelessEntryTitle', tr('openFilter'));
  setTextIfExists('hardwareEntryTitle', tr('openFilter'));
  setTextIfExists('panelTitle', tr(`${state.activePanel}PanelTitle`));
  setTextIfExists('panelDesc', tr(`${state.activePanel}PanelDesc`));

  CAMERA_ROLES.forEach(role => {
    setTextIfExists(`${role.key}Title`, tr(role.titleKey));
    setTextIfExists(`${role.key}Desc`, tr(role.descKey));
    setTextIfExists(`${role.key}MpLabel`, tr('mp'));
    setTextIfExists(`${role.key}CmosLabel`, tr('cmos'));
    setTextIfExists(`${role.key}ApertureLabel`, tr('aperture'));
    setTextIfExists(`${role.key}OisLabel`, tr('ois'));
    setTextIfExists(`${role.key}OisCheckText`, tr('support'));
  });

  ['screenSize','screenResolution','screenRefresh','screenBrightness'].forEach(id => setTextIfExists(`${id}Label`, tr(id === 'screenResolution' ? 'resolution' : id === 'screenRefresh' ? 'refreshRate' : id === 'screenBrightness' ? 'brightness' : 'screenSize')));
  setTextIfExists('screenSizeTitle', tr('screenSize'));
  setTextIfExists('screenResolutionTitle', tr('resolution'));
  setTextIfExists('screenRefreshTitle', tr('refreshRate'));
  setTextIfExists('screenBrightnessTitle', tr('brightness'));
  setTextIfExists('wirelessBandsTitle', tr('bands'));
  setTextIfExists('wirelessWifiTitle', tr('wifi'));
  setTextIfExists('wifiLabel', tr('wifi'));
  setTextIfExists('hwJackTitle', tr('jack35'));
  setTextIfExists('jack35CheckText', tr('support'));
  setTextIfExists('hwUsbTitle', tr('usb'));
  setTextIfExists('usbLabel', tr('usb'));
  setTextIfExists('hwNfcTitle', tr('nfc'));
  setTextIfExists('nfcCheckText', tr('support'));
  setTextIfExists('hwIrTitle', tr('ir'));
  setTextIfExists('irCheckText', tr('support'));
  setTextIfExists('hwMotorTitle', tr('motor'));
  setTextIfExists('motorLabel', tr('motor'));

  setTextIfExists('rowHint', tr('rowHint'));
  setTextIfExists('noteTitle', tr('noteTitle'));
  setTextIfExists('note1', tr('note1'));
  setTextIfExists('note2', tr('note2'));
  setTextIfExists('note3', tr('note3'));
  setTextIfExists('thId', tr('id'));
  setTextIfExists('thBrand', tr('brandCol'));
  setTextIfExists('thModel', tr('model'));
  setTextIfExists('thSoc', tr('soc'));
  setTextIfExists('thBattery', tr('batteryCol'));
  setTextIfExists('thRam', tr('ramCol'));
  setTextIfExists('thStorage', tr('storageCol'));
  setTextIfExists('status', tr('loading'));

  setLangSelectOptions();

  initOrRefreshMultiSelect('brand', '#brandSelect', state.optionData.brands, tr('selectBrand'));
  initOrRefreshMultiSelect('battery', '#batteryRangeSelect', state.optionData.batteryRanges, tr('selectBattery'));
  initOrRefreshMultiSelect('ram', '#ramSelect', state.optionData.ramOptions, tr('selectRam'));
  initOrRefreshMultiSelect('storage', '#storageSelect', state.optionData.storageOptions, tr('selectStorage'));
  initOrRefreshMultiSelect('length', '#lengthRangeSelect', state.optionData.lengthRanges, tr('selectLength'));
  initOrRefreshMultiSelect('width', '#widthRangeSelect', state.optionData.widthRanges, tr('selectWidth'));
  initOrRefreshMultiSelect('thickness', '#thicknessRangeSelect', state.optionData.thicknessRanges, tr('selectThickness'));
  initOrRefreshMultiSelect('chargingPower', '#chargingPowerSelect', state.optionData.chargingPowerRanges, tr('selectChargingPower'));
  initOrRefreshChargingProtocolTree(window.__allChargingProtocolRows || []);

  CAMERA_ROLES.forEach(role => {
    initOrRefreshMultiSelect(`${role.key}Mp`, `#${role.key}MpRangeSelect`, state.optionData.cameraMpRanges, tr('selectMp'));
    initOrRefreshMultiSelect(`${role.key}Cmos`, `#${role.key}CmosRangeSelect`, state.optionData.cameraCmosRanges, tr('selectCmos'));
    initOrRefreshMultiSelect(`${role.key}Aperture`, `#${role.key}ApertureRangeSelect`, state.optionData.cameraApertureRanges, tr('selectAperture'));
  });

  initOrRefreshMultiSelect('screenSize', '#screenSizeSelect', state.optionData.screenSizeRanges, tr('selectScreenSize'));
  initOrRefreshMultiSelect('screenResolution', '#screenResolutionSelect', state.optionData.screenResolutionOptions, tr('selectResolution'));
  initOrRefreshMultiSelect('screenRefresh', '#screenRefreshSelect', state.optionData.screenRefreshRanges, tr('selectRefresh'));
  initOrRefreshMultiSelect('screenBrightness', '#screenBrightnessSelect', state.optionData.screenBrightnessRanges, tr('selectBrightness'));
  state.optionData.motorOptions = (state.optionData.motorRows || []).map(r => ({
    value: r.value,
    label: state.lang === 'en' ? (r.label_en || r.label_zh || r.value) : (r.label_zh || r.label_en || r.value),
    sort: r.sort || 0
  })).sort((a, b) => a.sort - b.sort);
  initOrRefreshMultiSelect('wifi', '#wifiSelect', state.optionData.wifiOptions, tr('selectWifi'));
  initOrRefreshMultiSelect('usb', '#usbSelect', state.optionData.usbOptions, tr('selectUsb'));
  initOrRefreshMultiSelect('motor', '#motorSelect', state.optionData.motorOptions, tr('selectMotor'));

  bindCheckboxEvents();
  initOrRefreshBandTree(window.__allBandRows || []);
  initOrRefreshChargingProtocolTree(window.__allChargingProtocolRows || []);
  updateAdvancedEntrySummary();
  updatePanelSummary();
  applyFilters();
}
function renderExpandCard(title, inner) {
  return `<div class="mini-card"><div class="mini-title">${title}</div>${inner}</div>`;
}
function buildExpandedContent(item) {
  const cameraInner = CAMERA_ROLES.map(role => {
    const spec = item.cameraSpecByRole?.[role.key];
    if (!spec) return `<div class="summary-line"><strong>${roleLabel(role.key)}：</strong>${tr('detailNoData')}</div>`;
    return `<div class="summary-line"><strong>${roleLabel(role.key)}：</strong><span class="tag">${spec.mp}w</span><span class="tag">${spec.cmos_size_inch.toFixed(2)} inch</span><span class="tag">f/${spec.aperture}</span><span class="tag">${fmtOis(spec.ois)}</span></div>`;
  }).join('');

  const screenInner = item.screenSpec
    ? `<div class="summary-line"><strong>${tr('screenSize')}：</strong><span class="tag">${item.screenSpec.screen_size_inch}"</span></div>
       <div class="summary-line"><strong>${tr('resolution')}：</strong><span class="tag">${escapeHtml(item.screenSpec.resolution_tier)}</span></div>
       <div class="summary-line"><strong>${tr('refreshRate')}：</strong><span class="tag">${item.screenSpec.max_refresh_hz}Hz</span></div>
       <div class="summary-line"><strong>${tr('brightness')}：</strong><span class="tag">${item.screenSpec.max_brightness_nits} nits</span></div>`
    : tr('detailNoData');

  const wirelessInner = `<div class="summary-line"><strong>${tr('wifi')}：</strong><span class="tag">${escapeHtml(item.wirelessSpec?.wifi || '-')}</span></div>` +
    buildBandGroups(item.bands || []).map(group =>
      `<div class="summary-line"><strong>${escapeHtml(humanBandModeLabel(group.generation, group.mode))}：</strong>${group.bands.map(v => `<span class="tag">${escapeHtml(v)}</span>`).join('')}</div>`
    ).join('');

  const hardwareInner = item.hardwareSpec
    ? `<div class="summary-line"><strong>${tr('jack35')}：</strong><span class="tag">${boolLabel(item.hardwareSpec.has_3_5mm)}</span></div>
       <div class="summary-line"><strong>${tr('usb')}：</strong><span class="tag">${escapeHtml(item.hardwareSpec.usb_spec)}</span></div>
       <div class="summary-line"><strong>${tr('nfc')}：</strong><span class="tag">${boolLabel(item.hardwareSpec.has_nfc)}</span></div>
       <div class="summary-line"><strong>${tr('ir')}：</strong><span class="tag">${boolLabel(item.hardwareSpec.has_ir)}</span></div>
       <div class="summary-line"><strong>${tr('motor')}：</strong><span class="tag">${escapeHtml(getMotorLabelByValue(item.hardwareSpec.motor_type))}</span></div>`
    : tr('detailNoData');

  const chargingProtocolGroups = buildChargingProtocolGroups(item.chargingProtocols || []);
  const chargingInner = item.chargingSpec
    ? `<div class="summary-line"><strong>${tr('chargingPower')}：</strong><span class="tag">${item.chargingSpec.max_power_w}W</span></div>` +
      (chargingProtocolGroups.length
        ? chargingProtocolGroups.map(group =>
            `<div class="summary-line"><strong>${escapeHtml(group.protocol)}：</strong>${group.powers.map(power => `<span class="tag">${power}W</span>`).join('')}</div>`
          ).join('')
        : `<div class="summary-line"><strong>${tr('chargingProtocol')}：</strong>${tr('detailNoData')}</div>`)
    : tr('detailNoData');

  const dimensionInner = `<div class="summary-line"><strong>${tr('length')}：</strong><span class="tag">${item.length_mm} mm</span></div>
    <div class="summary-line"><strong>${tr('width')}：</strong><span class="tag">${item.width_mm} mm</span></div>
    <div class="summary-line"><strong>${tr('thickness')}：</strong><span class="tag">${item.thickness_mm} mm</span></div>`;

  return `
    <div class="expand-wrap">
      <div class="expand-grid">
        ${renderExpandCard(tr('cameraDetailTitle'), cameraInner)}
        ${renderExpandCard(tr('screenDetailTitle'), screenInner)}
        ${renderExpandCard(tr('wirelessDetailTitle'), wirelessInner)}
        ${renderExpandCard(tr('hardwareDetailTitle'), hardwareInner)}
        ${renderExpandCard(tr('chargingDetailTitle'), chargingInner)}
        ${renderExpandCard(tr('dimensionDetailTitle'), dimensionInner)}
      </div>
    </div>
  `;
}
function renderRows(rows) {
  const tbody = document.getElementById('tbody');
  setTextIfExists('status', tr('totalStatus', { total: state.phones.length, filtered: rows.length }));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#57606a;">${tr('noResult')}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(item => `
    <tr class="clickable-row" data-phone-id="${escapeHtml(item.id)}">
      <td>${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.brand)}</td>
      <td><a class="model-link" href="detail.html?id=${encodeURIComponent(item.id)}&lang=${encodeURIComponent(state.lang)}" onclick="event.stopPropagation()">${escapeHtml(item.model)}</a></td>
      <td>${escapeHtml(item.soc)}</td>
      <td>${escapeHtml(item.battery_mah)} mAh</td>
      <td>${(item.ramOptions || []).map(v => `<span class="tag">${escapeHtml(v)}GB</span>`).join('')}</td>
      <td>${(item.storageOptions || []).map(v => `<span class="tag">${escapeHtml(v)}GB</span>`).join('')}</td>
    </tr>
    <tr>
      <td colspan="7" class="expand-cell">
        <div id="expand-${item.id}" data-open="0" style="display:none;">
          <div id="expand-content-${item.id}" data-loaded="0"></div>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.clickable-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = Number(row.dataset.phoneId);
      const content = document.getElementById(`expand-content-${id}`);
      const wrap = document.getElementById(`expand-${id}`);
      if (!content || !wrap) return;

      try {
        if (content.dataset.loaded !== '1') {
          const item = state.phones.find(p => p.id === id);
          if (!item) return;
          content.innerHTML = buildExpandedContent(item);
          content.dataset.loaded = '1';
        }
        const isOpen = wrap.dataset.open === '1';
        wrap.style.display = isOpen ? 'none' : 'block';
        wrap.dataset.open = isOpen ? '0' : '1';
      } catch (err) {
        console.error('Expand row failed:', err);
        content.innerHTML = `<div class="expand-wrap"><div class="mini-card"><div class="mini-title">Error</div><div class="summary-line">${escapeHtml(err.message || String(err))}</div></div></div>`;
        content.dataset.loaded = '1';
        wrap.style.display = 'block';
        wrap.dataset.open = '1';
      }
    });
  });
}
async function loadAllData() {
  const [
    languageRows, brandRows, batteryRows, ramRows, storageRows, lengthRows, widthRows, thicknessRows,
    chargingPowerRows,
    cameraMpRows, cameraCmosRows, cameraApertureRows,
    screenSizeRows, screenResolutionRows, screenRefreshRows, screenBrightnessRows,
    wifiRows, usbRows, motorRows, bandModeRows, bandOptionRows,
    phonesRows, memoryRows, storageItemRows, bandRows,
    cameraSpecRows, screenSpecRows, wirelessSpecRows, hardwareSpecRows, chargingSpecRows, chargingProtocolRows
  ] = await Promise.all([
    parseCsvFile('data/filters/languages.csv'),
    parseCsvFile('data/filters/brands.csv'),
    parseCsvFile('data/filters/battery_ranges.csv'),
    parseCsvFile('data/filters/ram_options.csv'),
    parseCsvFile('data/filters/storage_options.csv'),
    parseCsvFile('data/filters/length_ranges.csv'),
    parseCsvFile('data/filters/width_ranges.csv'),
    parseCsvFile('data/filters/thickness_ranges.csv'),
    parseCsvFile('data/filters/charging_power_ranges.csv'),
    parseCsvFile('data/filters/camera_mp_ranges.csv'),
    parseCsvFile('data/filters/camera_cmos_ranges.csv'),
    parseCsvFile('data/filters/camera_aperture_ranges.csv'),
    parseCsvFile('data/filters/screen_size_ranges.csv'),
    parseCsvFile('data/filters/screen_resolution_options.csv'),
    parseCsvFile('data/filters/screen_refresh_ranges.csv'),
    parseCsvFile('data/filters/screen_brightness_ranges.csv'),
    parseCsvFile('data/filters/wifi_options.csv'),
    parseCsvFile('data/filters/usb_options.csv'),
    parseCsvFile('data/filters/motor_type_options.csv'),
    parseCsvFile('data/filters/band_modes.csv'),
    parseCsvFile('data/filters/band_options.csv'),
    parseCsvFile('data/items/phones.csv'),
    parseCsvFile('data/items/phone_memory.csv'),
    parseCsvFile('data/items/phone_storage.csv'),
    parseCsvFile('data/items/phone_bands.csv'),
    parseCsvFile('data/items/phone_camera_specs.csv'),
    parseCsvFile('data/items/phone_screen_specs.csv'),
    parseCsvFile('data/items/phone_wireless_specs.csv'),
    parseCsvFile('data/items/phone_hardware_specs.csv'),
    parseCsvFile('data/items/phone_charging_specs.csv'),
    parseCsvFile('data/items/phone_charging_protocols.csv')
  ]);

  state.languages = languageRows
    .filter(r => String(r.enabled).toLowerCase() === 'true')
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  state.optionData = {
    brands: brandRows.map(r => ({ value: r.brand, label: r.brand })),
    batteryRanges: normalizeRangeRows(batteryRows, 'min_mah', 'max_mah'),
    ramOptions: normalizeValueRows(ramRows),
    storageOptions: normalizeValueRows(storageRows),
    lengthRanges: normalizeRangeRows(lengthRows, 'min_mm', 'max_mm'),
    widthRanges: normalizeRangeRows(widthRows, 'min_mm', 'max_mm'),
    thicknessRanges: normalizeRangeRows(thicknessRows, 'min_mm', 'max_mm'),
    chargingPowerRanges: normalizeRangeRows(chargingPowerRows, 'min_w', 'max_w'),
    cameraMpRanges: normalizeRangeRows(cameraMpRows, 'min_mp', 'max_mp'),
    cameraCmosRanges: normalizeRangeRows(cameraCmosRows, 'min_size', 'max_size'),
    cameraApertureRanges: normalizeRangeRows(cameraApertureRows, 'min_f', 'max_f'),
    screenSizeRanges: normalizeRangeRows(screenSizeRows, 'min_inch', 'max_inch'),
    screenResolutionOptions: normalizeValueRows(screenResolutionRows),
    screenRefreshRanges: normalizeRangeRows(screenRefreshRows, 'min_hz', 'max_hz'),
    screenBrightnessRanges: normalizeRangeRows(screenBrightnessRows, 'min_nits', 'max_nits'),
    wifiOptions: normalizeValueRows(wifiRows),
    usbOptions: normalizeValueRows(usbRows),
    motorRows: motorRows.map(r => ({ value: r.value, label_zh: r.label_zh, label_en: r.label_en, sort: Number(r.sort_order || 0) }))
      .sort((a, b) => a.sort - b.sort),
    motorOptions: motorRows.map(r => ({
      value: r.value,
      label: state.lang === 'en' ? (r.label_en || r.label_zh || r.value) : (r.label_zh || r.label_en || r.value),
      sort: Number(r.sort_order || 0)
    })).sort((a, b) => a.sort - b.sort),
    bandModes: bandModeRows.map(r => ({ value: r.value, sort: Number(r.sort_order || 0) })),
    bandOptions: bandOptionRows.map(r => ({ value: r.value, sort: Number(r.sort_order || 0) }))
  };

  window.__allBandRows = bandRows;
  window.__allChargingProtocolRows = chargingProtocolRows;

  const memMap = groupBy(memoryRows, 'phone_id');
  const storageMap = groupBy(storageItemRows, 'phone_id');
  const bandMap = groupBy(bandRows, 'phone_id');
  const cameraSpecMap = groupBy(cameraSpecRows, 'phone_id');
  const screenSpecMap = groupBy(screenSpecRows, 'phone_id');
  const wirelessSpecMap = groupBy(wirelessSpecRows, 'phone_id');
  const hardwareSpecMap = groupBy(hardwareSpecRows, 'phone_id');
  const chargingSpecMap = groupBy(chargingSpecRows, 'phone_id');
  const chargingProtocolMap = groupBy(chargingProtocolRows, 'phone_id');

  state.phones = phonesRows.map(row => {
    const id = Number(row.id);
    const key = String(id);

    const cameraSpecs = (cameraSpecMap.get(key) || []).map(spec => ({
      lens_role: spec.lens_role || '',
      mp: Number(spec.mp || 0),
      cmos_size_inch: Number(spec.cmos_size_inch || 0),
      aperture: Number(spec.aperture || 0),
      ois: String(spec.ois || '').toLowerCase() === 'true'
    }));
    const cameraSpecByRole = {};
    cameraSpecs.forEach(spec => { cameraSpecByRole[spec.lens_role] = spec; });

    return {
      id,
      brand: row.brand,
      model: row.model,
      soc: row.soc,
      battery_mah: Number(row.battery_mah || 0),
      length_mm: Number(row.length_mm || 0),
      width_mm: Number(row.width_mm || 0),
      thickness_mm: Number(row.thickness_mm || 0),
      ramOptions: (memMap.get(key) || []).map(m => Number(m.ram_gb || 0)).sort((a, b) => a - b),
      storageOptions: (storageMap.get(key) || []).map(s => Number(s.storage_gb || 0)).sort((a, b) => a - b),
      bands: (bandMap.get(key) || []).map(b => ({ generation: b.generation || '', mode: b.mode || '', band: b.band || '' })),
      cameraSpecByRole,
      screenSpec: (screenSpecMap.get(key) || []).map(spec => ({
        screen_size_inch: Number(spec.screen_size_inch || 0),
        resolution_tier: spec.resolution_tier || '',
        max_refresh_hz: Number(spec.max_refresh_hz || 0),
        max_brightness_nits: Number(spec.max_brightness_nits || 0)
      }))[0] || null,
      wirelessSpec: (wirelessSpecMap.get(key) || []).map(spec => ({ wifi: spec.wifi || '' }))[0] || null,
      hardwareSpec: (hardwareSpecMap.get(key) || []).map(spec => ({
        has_3_5mm: String(spec.has_3_5mm || '').toLowerCase() === 'true',
        usb_spec: spec.usb_spec || '',
        has_nfc: String(spec.has_nfc || '').toLowerCase() === 'true',
        has_ir: String(spec.has_ir || '').toLowerCase() === 'true',
        motor_type: spec.motor_type || ''
      }))[0] || null,
      chargingSpec: (chargingSpecMap.get(key) || []).map(spec => ({
        max_power_w: Number(spec.max_power_w || 0)
      }))[0] || null,
      chargingProtocols: (chargingProtocolMap.get(key) || []).map(spec => ({
        protocol: spec.protocol || '',
        power_w: Number(spec.power_w || 0)
      }))
    };
  });
}
function bindEvents() {
  document.getElementById('cameraEntryCard').addEventListener('click', () => openPanel('camera'));
  document.getElementById('screenEntryCard').addEventListener('click', () => openPanel('screen'));
  document.getElementById('wirelessEntryCard').addEventListener('click', () => openPanel('wireless'));
  document.getElementById('hardwareEntryCard').addEventListener('click', () => openPanel('hardware'));
  document.getElementById('panelClose').addEventListener('click', closePanel);
  document.getElementById('langSelect').addEventListener('change', async (e) => {
    state.lang = e.target.value;
    await window.PhoneDemoI18n.setLang(state.lang);
    applyLanguageToStaticText();
  });
}
async function init() {
  state.lang = await window.PhoneDemoI18n.init();
  await loadAllData();
  bindEvents();
  const shell = document.getElementById('filterShell');
  if (shell) {
    const main = shell.querySelector('.filter-main');
    const panel = shell.querySelector('.filter-panel');
    shell.classList.remove('panel-open');
    if (main) main.style.display = 'block';
    if (panel) panel.style.display = 'none';
  }
  applyLanguageToStaticText();
}
document.addEventListener('DOMContentLoaded', init);
