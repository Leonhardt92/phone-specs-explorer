
const params = new URLSearchParams(window.location.search);

function tr(key, options = {}) {
  return window.PhoneDemoI18n.t(key, options);
}
function escapeHtml(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function parseCsvFile(path) {
  return new Promise((resolve, reject) => {
    Papa.parse(path, { download: true, header: true, skipEmptyLines: true, complete: (results) => resolve(results.data || []), error: reject });
  });
}
function boolLabel(v) { return v ? tr('support') : tr('notSupport'); }
function refKindLabel(kind) { return kind === 'video' ? tr('videoKind') : tr('officialKind'); }
function getLocalizedRowLabel(row, lang, fallbackValue = '') {
  if (!row) return String(fallbackValue || '');
  const direct = row[`label_${lang}`];
  if (direct) return direct;
  return row.label_en || row.label_zh || row.label_native || row.label || row.value || String(fallbackValue || '');
}
function getMappedLabel(value, rows, lang) {
  const row = (rows || []).find(item => String(item.value) === String(value));
  return row ? getLocalizedRowLabel(row, lang, value) : String(value || '');
}
function infoItem(label, value) {
  return `<div class="info-item"><div class="info-label">${escapeHtml(label)}</div><div class="info-value">${value}</div></div>`;
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
function buildBandGroups(bands) {
  const grouped = {};
  (bands || []).forEach(b => {
    const key = `${b.generation}|${b.mode}`;
    if (!grouped[key]) grouped[key] = { generation: b.generation, mode: b.mode, bands: [] };
    grouped[key].bands.push(b.band);
  });
  const order = ['5G|SA','5G|NSA','4G|LTE_FDD','4G|LTE_TDD','3G|UMTS','2G|GSM'];
  return order.filter(key => grouped[key]).map(key => grouped[key]);
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
    .map(([protocol, powers]) => ({ protocol, powers: Array.from(powers).sort((a, b) => a - b) }));
}

async function init() {
  const requestedLang = params.get('lang') || localStorage.getItem('phone_demo_lang') || 'zh';
  await window.PhoneDemoI18n.setLang(requestedLang);
  document.getElementById('backLink').textContent = tr('returnList');
  document.getElementById('status').textContent = tr('detailLoading');
  document.documentElement.lang = requestedLang;

  const id = Number(params.get('id') || 0);
  if (!id) {
    document.getElementById('status').textContent = tr('invalidId');
    document.getElementById('content').innerHTML = `<div class="panel">${tr('useDetailParam')}</div>`;
    return;
  }

  try {
    const [phonesRows, cameraRows, screenRows, wirelessRows, hardwareRows, chargingRows, chargingProtocolRows, memoryRows, storageRows, bandRows, refsRows, motorRows, socVariantRows] = await Promise.all([
      parseCsvFile('data/items/phones.csv'),
      parseCsvFile('data/items/phone_camera_specs.csv'),
      parseCsvFile('data/items/phone_screen_specs.csv'),
      parseCsvFile('data/items/phone_wireless_specs.csv'),
      parseCsvFile('data/items/phone_hardware_specs.csv'),
      parseCsvFile('data/items/phone_charging_specs.csv'),
      parseCsvFile('data/items/phone_charging_protocols.csv'),
      parseCsvFile('data/items/phone_memory.csv'),
      parseCsvFile('data/items/phone_storage.csv'),
      parseCsvFile('data/items/phone_bands.csv'),
      parseCsvFile('data/items/phone_references.csv'),
      parseCsvFile('data/filters/hardware/motor_type_options.csv'),
      parseCsvFile('data/filters/chipset/soc_variants.csv')
    ]);

    const phone = phonesRows.find(r => Number(r.id) === id);
    if (!phone) {
      document.getElementById('status').textContent = tr('detailNoPhone');
      document.getElementById('content').innerHTML = `<div class="panel">${tr('detailNoPhone')}</div>`;
      return;
    }

    const socLabel = getMappedLabel(phone.soc, socVariantRows, requestedLang);
    const camera = cameraRows.filter(r => Number(r.phone_id) === id);
    const screen = screenRows.find(r => Number(r.phone_id) === id);
    const wireless = wirelessRows.find(r => Number(r.phone_id) === id);
    const hardware = hardwareRows.find(r => Number(r.phone_id) === id);
    const charging = chargingRows.find(r => Number(r.phone_id) === id);
    const chargingProtocols = chargingProtocolRows.filter(r => Number(r.phone_id) === id);
    const chargingProtocolGroups = buildChargingProtocolGroups(chargingProtocols);
    const mem = memoryRows.filter(r => Number(r.phone_id) === id).map(r => r.ram_gb);
    const stor = storageRows.filter(r => Number(r.phone_id) === id).map(r => r.storage_gb);
    const bands = bandRows.filter(r => Number(r.phone_id) === id).map(r => ({ generation: r.generation || '', mode: r.mode || '', band: r.band || '' }));
    const bandGroups = buildBandGroups(bands);
    const refs = refsRows.filter(r => Number(r.phone_id) === id);

    document.title = `${phone.brand} ${phone.model}`;
    document.getElementById('status').textContent = tr('loadedId', { id });

    const refsHtml = refs.length ? refs.map(r => `
      <div class="ref-item">
        <div class="ref-meta">
          <div class="ref-title">${escapeHtml(r.title)}</div>
          <div class="ref-kind">${escapeHtml(refKindLabel(r.kind))}</div>
        </div>
        <a class="ref-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${tr('viewLink')}</a>
      </div>`).join('') : `<div class="empty">${tr('detailNoData')}</div>`;

    const bandGroupsHtml = bandGroups.length ? bandGroups.map(group => `
      <div class="info-item">
        <div class="info-label">${escapeHtml(humanBandModeLabel(group.generation, group.mode))}</div>
        <div class="info-value">${group.bands.map(v => `<span class="tag">${escapeHtml(v)}</span>`).join('')}</div>
      </div>`).join('') : `<div class="empty">${tr('detailNoData')}</div>`;

    document.getElementById('content').innerHTML = `
      <div class="page-grid">
        <div class="panel hero">
          <h1>${escapeHtml(phone.brand)} ${escapeHtml(phone.model)}</h1>
          <div class="sub">${tr('loadedId', { id })}</div>
          <div class="hero-sub">
            <span class="tag">ID: ${escapeHtml(phone.id)}</span>
            <span class="tag">${escapeHtml(socLabel)}</span>
            <span class="tag">${escapeHtml(phone.battery_mah)} mAh</span>
            ${charging ? `<span class="tag">${escapeHtml(charging.max_power_w)}W</span>` : ''}
            ${chargingProtocolGroups.length ? chargingProtocolGroups.map(group => `<span class="tag">${escapeHtml(group.protocol)}</span>`).join('') : ''}
          </div>
        </div>

        <div class="panel">
          <h2 class="card-title">${tr('basicInfo')}</h2>
          <div class="mini-stat-grid">
            <div class="mini-stat"><div class="mini-stat-label">${tr('length')}</div><div class="mini-stat-value">${escapeHtml(phone.length_mm)} mm</div></div>
            <div class="mini-stat"><div class="mini-stat-label">${tr('width')}</div><div class="mini-stat-value">${escapeHtml(phone.width_mm)} mm</div></div>
            <div class="mini-stat"><div class="mini-stat-label">${tr('thickness')}</div><div class="mini-stat-value">${escapeHtml(phone.thickness_mm)} mm</div></div>
            <div class="mini-stat"><div class="mini-stat-label">${tr('batteryCol')}</div><div class="mini-stat-value">${escapeHtml(phone.battery_mah)} mAh</div></div>
          </div>
        </div>
      </div>

      <div class="section-grid">
        <div class="panel">
          <h2 class="card-title">${tr('basicInfo')}</h2>
          <div class="info-grid">
            ${infoItem(tr('brandCol'), escapeHtml(phone.brand))}
            ${infoItem(tr('model'), escapeHtml(phone.model))}
            ${infoItem(tr('soc'), escapeHtml(socLabel))}
            ${infoItem(tr('batteryCol'), `${escapeHtml(phone.battery_mah)} mAh`)}
            ${infoItem(tr('length'), `${escapeHtml(phone.length_mm)} mm`)}
            ${infoItem(tr('width'), `${escapeHtml(phone.width_mm)} mm`)}
            ${infoItem(tr('thickness'), `${escapeHtml(phone.thickness_mm)} mm`)}
          </div>
        </div>

        <div class="panel">
          <h2 class="card-title">${tr('chargingParams')}</h2>
          <div class="info-grid">
            ${charging ? `${infoItem(tr('chargingPower'), `<span class="tag">${escapeHtml(charging.max_power_w)}W</span>`)}
              ${infoItem(tr('chargingProtocol'), chargingProtocolGroups.length ? chargingProtocolGroups.map(group => `<div style="margin-bottom:6px;"><span class="tag">${escapeHtml(group.protocol)}</span>${group.powers.map(power => `<span class="tag">${power}W</span>`).join('')}</div>`).join('') : `<span class="empty">${tr('detailNoData')}</span>`)}
            ` : `<div class="empty">${tr('detailNoData')}</div>`}
          </div>
        </div>

        <div class="panel">
          <h2 class="card-title">${tr('cameraParams')}</h2>
          <div class="list-block">
            ${camera.length ? camera.map(c => `<span class="tag">${escapeHtml(c.lens_role)}: ${escapeHtml(c.mp)}w / ${escapeHtml(c.cmos_size_inch)} inch / f${escapeHtml(c.aperture)} / ${String(c.ois).toLowerCase()==='true' ? tr('supportOis') : tr('noOis')}</span>`).join('') : `<div class="empty">${tr('detailNoData')}</div>`}
          </div>
        </div>

        <div class="panel">
          <h2 class="card-title">${tr('screenParams')}</h2>
          <div class="info-grid">
            ${screen ? `${infoItem(tr('screenSize'), `<span class="tag">${escapeHtml(screen.screen_size_inch)}"</span>`)}
              ${infoItem(tr('resolution'), `<span class="tag">${escapeHtml(screen.resolution_tier)}</span>`)}
              ${infoItem(tr('refreshRate'), `<span class="tag">${escapeHtml(screen.max_refresh_hz)}Hz</span>`)}
              ${infoItem(tr('brightness'), `<span class="tag">${escapeHtml(screen.max_brightness_nits)} nits</span>`)}
            ` : `<div class="empty">${tr('detailNoData')}</div>`}
          </div>
        </div>

        <div class="panel">
          <h2 class="card-title">${tr('wirelessParams')}</h2>
          <div class="info-grid">${wireless ? `${infoItem(tr('wifi'), `<span class="tag">${escapeHtml(wireless.wifi)}</span>`)}` : `<div class="empty">${tr('detailNoData')}</div>`}</div>
        </div>

        <div class="panel">
          <h2 class="card-title">${tr('bandGroupsTitle')}</h2>
          <div class="info-grid">${bandGroupsHtml}</div>
        </div>

        <div class="panel">
          <h2 class="card-title">${tr('hardwareParams')}</h2>
          <div class="info-grid">
            ${hardware ? `${infoItem(tr('jack35'), `<span class="tag">${boolLabel(String(hardware.has_3_5mm).toLowerCase()==='true')}</span>`)}
              ${infoItem(tr('usb'), `<span class="tag">${escapeHtml(hardware.usb_spec)}</span>`)}
              ${infoItem(tr('nfc'), `<span class="tag">${boolLabel(String(hardware.has_nfc).toLowerCase()==='true')}</span>`)}
              ${infoItem(tr('ir'), `<span class="tag">${boolLabel(String(hardware.has_ir).toLowerCase()==='true')}</span>`)}
              ${infoItem(tr('tfCard'), `<span class="tag">${boolLabel(String(hardware.has_tf_card).toLowerCase()==='true')}</span>`)}
              ${infoItem(tr('motor'), `<span class="tag">${escapeHtml(getMappedLabel(hardware.motor_type, motorRows, requestedLang))}</span>`)}
            ` : `<div class="empty">${tr('detailNoData')}</div>`}
          </div>
        </div>

        <div class="panel"><h2 class="card-title">${tr('memOptions')}</h2><div class="list-block">${mem.length ? mem.map(v => `<span class="tag">${escapeHtml(v)}GB</span>`).join('') : `<div class="empty">${tr('detailNoData')}</div>`}</div></div>
        <div class="panel"><h2 class="card-title">${tr('storageOptions')}</h2><div class="list-block">${stor.length ? stor.map(v => `<span class="tag">${escapeHtml(v)}GB</span>`).join('') : `<div class="empty">${tr('detailNoData')}</div>`}</div></div>
        <div class="panel full-span"><h2 class="card-title">${tr('referencesTitle')}</h2><div class="refs-list">${refsHtml}</div></div>
      </div>`;
  } catch (err) {
    document.getElementById('status').textContent = tr('detailLoadFail');
    document.getElementById('content').innerHTML = `<div class="panel">${tr('readCsvFail', { msg: err.message })}</div>`;
  }
}
document.addEventListener('DOMContentLoaded', init);
