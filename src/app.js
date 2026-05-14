const SVG_NS = 'http://www.w3.org/2000/svg';
const PERSISTENCE_KEY = 'qt-svg-editor-state-v1';
const PERSISTENCE_VERSION = 1;


const QT_COLOR_LIST = {
  'Розовый': 'ffa3a3', 'розовый': 'ffa3a3',
  'Жёлтый': 'ffd072', 'жёлтый': 'ffd072', 'Желтый': 'ffd072', 'желтый': 'ffd072',
  'Фиолетовый': 'd6a2d3', 'фиолетовый': 'd6a2d3',
  'Голубой': 'a5aaf0', 'голубой': 'a5aaf0',
  'Мятный': '97e3d9', 'мятный': '97e3d9',
  'Зелёный': 'a6d6a2', 'зелёный': 'a6d6a2', 'Зеленый': 'a6d6a2', 'зеленый': 'a6d6a2',
  'Белый': 'ffffff', 'белый': 'ffffff',
  'Синий': '4a9fe6', 'синий': '4a9fe6',
  'Чёрный': '333333', 'чёрный': '333333', 'Черный': '333333', 'черный': '333333',
  'Серый1': '606060', 'серый1': '606060',
  'Серый2': '909090', 'серый2': '909090',
  'Серый3': 'cccccc', 'серый3': 'cccccc',
  'Серый4': 'dfdfdf', 'серый4': 'dfdfdf',
  'Серый5': 'eeeeee', 'серый5': 'eeeeee',
  'Серый6': 'f2f2f2', 'серый6': 'f2f2f2',
};

const QT_COLOR_NAME_BY_HEX = new Map([
  ['ffa3a3', 'Розовый'],
  ['ffd072', 'Жёлтый'],
  ['d6a2d3', 'Фиолетовый'],
  ['a5aaf0', 'Голубой'],
  ['97e3d9', 'Мятный'],
  ['a6d6a2', 'Зелёный'],
  ['ffffff', 'Белый'],
  ['4a9fe6', 'Синий'],
  ['333333', 'Чёрный'],
  ['606060', 'Серый1'],
  ['909090', 'Серый2'],
  ['cccccc', 'Серый3'],
  ['dfdfdf', 'Серый4'],
  ['eeeeee', 'Серый5'],
  ['f2f2f2', 'Серый6'],
]);

const els = {
  svg: document.getElementById('editorSvg'),
  canvasWrap: document.getElementById('canvasWrap'),
  cameraLayer: document.getElementById('cameraLayer'),
  hallBackgroundLayer: document.getElementById('hallBackgroundLayer'),
  hallObjectsLayer: document.getElementById('hallObjectsLayer'),
  objectLayer: document.getElementById('objectLayer'),
  hallPlacesLayer: document.getElementById('hallPlacesLayer'),
  serviceLayer: document.getElementById('serviceLayer'),
  hallSqlInput: document.getElementById('hallSqlInput'),
  hallStyle: document.getElementById('hallStyle'),
  hallStatus: document.getElementById('hallStatus'),
  objX: document.getElementById('objX'),
  objY: document.getElementById('objY'),
  objWidth: document.getElementById('objWidth'),
  objHeight: document.getElementById('objHeight'),
  strokeColor: document.getElementById('strokeColor'),
  strokeWidth: document.getElementById('strokeWidth'),
  fillColor: document.getElementById('fillColor'),
  pathInput: document.getElementById('pathInput'),
  scaleX: document.getElementById('scaleX'),
  scaleY: document.getElementById('scaleY'),
  applyScale: document.getElementById('applyScale'),
  translateX: document.getElementById('translateX'),
  translateY: document.getElementById('translateY'),
  applyTranslate: document.getElementById('applyTranslate'),
  rotateX: document.getElementById('rotateX'),
  rotateY: document.getElementById('rotateY'),
  rotateAngle: document.getElementById('rotateAngle'),
  applyRotate: document.getElementById('applyRotate'),
  pathStatus: document.getElementById('pathStatus'),
  commandsList: document.getElementById('commandsList'),
  selectedCommandStatus: document.getElementById('selectedCommandStatus'),
  insertCommandType: document.getElementById('insertCommandType'),
  replaceCommandType: document.getElementById('replaceCommandType'),
  objectImportInput: document.getElementById('objectImportInput'),
  objectImportModal: document.getElementById('objectImportModal'),
  objectImportStatus: document.getElementById('objectImportStatus'),
  openObjectImportModal: document.getElementById('openObjectImportModal'),
  closeObjectImportModal: document.getElementById('closeObjectImportModal'),
  cancelObjectImportModal: document.getElementById('cancelObjectImportModal'),
  sqlOutput: document.getElementById('sqlOutput'),
  sqlMode: document.getElementById('sqlMode'),
  insertHallId: document.getElementById('insertHallId'),
  insertHallIdField: document.getElementById('insertHallIdField'),
  copySql: document.getElementById('copySql'),
  phpOutput: document.getElementById('phpOutput'),
  snapToPixel: document.getElementById('snapToPixel'),
  coords: document.getElementById('coords'),
  previewToggle: document.getElementById('previewToggle'),
};

const state = {
  viewBox: { x: -30, y: -30, w: 720, h: 560 },
  hall: null,
  hallMarkup: '',
  object: {
    x: 0,
    y: 0,
    width: 295,
    height: 445,
    stroke: 'Чёрный',
    strokeWidth: 2,
    fill: 'none',
    inFront: 1,
    path: 'M 0 0 L 295 0 L 295 210 Q 209 275 208 445 H 0 Z'
  },
  drag: null,
  pan: null,
  selectedCommandIndex: -1,
  sql: { insert: '', update: '' },
  history: [],
  historyIndex: -1,
  historyLock: false,
  dragDirty: false,
  previewMode: false,
  persistenceReady: false,
  persistenceTimer: null,
};

function n(value, fallback = 0) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value, fallback = 0) {
  const parsed = n(value, fallback);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function positiveIntValue(value, fallback = 1) {
  return Math.max(1, intValue(value, fallback));
}

function roundToStep(value, step) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function fmt(value, decimals = 3) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  if (Object.is(rounded, -0)) return '0';
  return String(rounded).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeSqlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\r?\n/g, ' ');
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  return node;
}

function getSvgViewportSize() {
  const rect = els.svg.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width || els.svg.clientWidth || 1),
    height: Math.max(1, rect.height || els.svg.clientHeight || 1),
  };
}

function normalizeBoxToViewport(box = state.viewBox) {
  const viewport = getSvgViewportSize();
  const viewportAspect = viewport.width / Math.max(viewport.height, 1);
  let w = Math.max(1e-9, Number(box.w) || 1);
  let h = Math.max(1e-9, Number(box.h) || 1);
  const cx = (Number(box.x) || 0) + w / 2;
  const cy = (Number(box.y) || 0) + h / 2;

  // В реальном зале все слои масштабируются единым коэффициентом.
  // Поэтому при изменении размеров окна нельзя применять разные sx/sy:
  // это деформирует места, HTML place_obj и итоговый SVG-объект.
  // Вместо этого расширяем видимую область по одной из осей под aspect ratio viewport.
  if (w / h < viewportAspect) {
    w = h * viewportAspect;
  } else {
    h = w / viewportAspect;
  }

  return {
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
  };
}

function getCameraMetrics(box = state.viewBox) {
  const viewport = getSvgViewportSize();
  const normalizedBox = normalizeBoxToViewport(box);
  const scale = Math.min(
    viewport.width / Math.max(normalizedBox.w, 1e-9),
    viewport.height / Math.max(normalizedBox.h, 1e-9)
  );
  const tx = (viewport.width - normalizedBox.w * scale) / 2 - normalizedBox.x * scale;
  const ty = (viewport.height - normalizedBox.h * scale) / 2 - normalizedBox.y * scale;
  return { ...viewport, box: normalizedBox, scale, tx, ty };
}

function setViewBox(box = state.viewBox) {
  state.viewBox = normalizeBoxToViewport(box);
  updateCameraTransform();
  schedulePersistState();
}

function updateCameraTransform() {
  const camera = getCameraMetrics(state.viewBox);
  els.svg.setAttribute('viewBox', `0 0 ${fmt(camera.width, 3)} ${fmt(camera.height, 3)}`);

  if (els.cameraLayer) {
    els.cameraLayer.setAttribute('transform', `matrix(${fmt(camera.scale, 8)} 0 0 ${fmt(camera.scale, 8)} ${fmt(camera.tx, 4)} ${fmt(camera.ty, 4)})`);
  }
}

function screenToSvg(evt, box = state.viewBox) {
  const rect = els.svg.getBoundingClientRect();
  const camera = getCameraMetrics(box);
  return {
    x: (evt.clientX - rect.left - camera.tx) / camera.scale,
    y: (evt.clientY - rect.top - camera.ty) / camera.scale,
  };
}

function readInputs() {
  state.object.x = intValue(els.objX.value);
  state.object.y = intValue(els.objY.value);
  state.object.width = positiveIntValue(els.objWidth.value, 1);
  state.object.height = positiveIntValue(els.objHeight.value, 1);
  state.object.stroke = els.strokeColor.value || 'Чёрный';
  state.object.strokeWidth = Math.max(0, intValue(els.strokeWidth.value, 2));
  state.object.fill = els.fillColor.value || 'none';
  state.object.inFront = 1;
  state.object.path = els.pathInput.value.trim();
}

function writeInputs() {
  els.objX.value = fmt(state.object.x, 0);
  els.objY.value = fmt(state.object.y, 0);
  els.objWidth.value = fmt(state.object.width, 0);
  els.objHeight.value = fmt(state.object.height, 0);
  els.strokeColor.value = colorToSelectValue(state.object.stroke, false, 'Чёрный');
  els.strokeWidth.value = fmt(state.object.strokeWidth, 0);
  els.fillColor.value = colorToSelectValue(state.object.fill, true, 'none');
  els.pathInput.value = state.object.path;
}

function makeHistorySnapshot() {
  return {
    object: { ...state.object },
    selectedCommandIndex: state.selectedCommandIndex,
  };
}

function snapshotKey(snapshot = makeHistorySnapshot()) {
  return JSON.stringify(snapshot);
}

function pushHistory() {
  if (state.historyLock) return;
  const snapshot = makeHistorySnapshot();
  const key = snapshotKey(snapshot);
  const current = state.history[state.historyIndex];
  if (current && current.key === key) return;
  state.historyIndex += 1;
  state.history.splice(state.historyIndex, state.history.length - state.historyIndex, { key, snapshot });
  if (state.history.length > 100) {
    state.history.shift();
    state.historyIndex -= 1;
  }
  schedulePersistState();
}

function applyHistorySnapshot(snapshot) {
  if (!snapshot) return;
  state.historyLock = true;
  state.object = { ...state.object, ...snapshot.object };
  state.selectedCommandIndex = Number.isInteger(snapshot.selectedCommandIndex) ? snapshot.selectedCommandIndex : state.selectedCommandIndex;
  writeInputs();
  render();
  state.historyLock = false;
  schedulePersistState();
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex -= 1;
  applyHistorySnapshot(state.history[state.historyIndex]?.snapshot);
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex += 1;
  applyHistorySnapshot(state.history[state.historyIndex]?.snapshot);
}

function renderAndSaveHistory() {
  render();
  pushHistory();
  schedulePersistState();
}

function makePersistedState() {
  return {
    version: PERSISTENCE_VERSION,
    viewBox: { ...state.viewBox },
    object: { ...state.object },
    selectedCommandIndex: state.selectedCommandIndex,
    previewMode: !!state.previewMode,
    hallSql: els.hallSqlInput ? els.hallSqlInput.value : '',
    hallStyle: els.hallStyle ? els.hallStyle.value : 'view',
    sqlMode: els.sqlMode ? els.sqlMode.value : 'insert',
    insertHallId: els.insertHallId ? els.insertHallId.value : '',
    snapToPixel: els.snapToPixel ? !!els.snapToPixel.checked : true,
    operations: {
      scaleX: els.scaleX ? els.scaleX.value : '1',
      scaleY: els.scaleY ? els.scaleY.value : '1',
      translateX: els.translateX ? els.translateX.value : '0',
      translateY: els.translateY ? els.translateY.value : '0',
      rotateX: els.rotateX ? els.rotateX.value : '0',
      rotateY: els.rotateY ? els.rotateY.value : '0',
      rotateAngle: els.rotateAngle ? els.rotateAngle.value : '0',
    },
  };
}

function schedulePersistState() {
  if (!state.persistenceReady) return;
  if (!window.localStorage) return;
  window.clearTimeout(state.persistenceTimer);
  state.persistenceTimer = window.setTimeout(persistStateNow, 120);
}

function persistStateNow() {
  if (!state.persistenceReady) return;
  try {
    window.localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(makePersistedState()));
  } catch (error) {
    console.warn('Не удалось сохранить состояние редактора.', error);
  }
}

function restoreStateFromStorage() {
  if (!window.localStorage) return false;
  let saved = null;
  try {
    saved = JSON.parse(window.localStorage.getItem(PERSISTENCE_KEY) || 'null');
  } catch (error) {
    console.warn('Не удалось прочитать сохранённое состояние редактора.', error);
    return false;
  }
  if (!saved || saved.version !== PERSISTENCE_VERSION) return false;

  if (saved.object && typeof saved.object === 'object') {
    state.object = { ...state.object, ...saved.object };
  }
  if (saved.viewBox && typeof saved.viewBox === 'object') {
    const x = n(saved.viewBox.x, state.viewBox.x);
    const y = n(saved.viewBox.y, state.viewBox.y);
    const w = n(saved.viewBox.w, state.viewBox.w);
    const h = n(saved.viewBox.h, state.viewBox.h);
    if (w > 0 && h > 0) state.viewBox = { x, y, w, h };
  }
  if (Number.isInteger(saved.selectedCommandIndex)) {
    state.selectedCommandIndex = saved.selectedCommandIndex;
  }
  state.previewMode = !!saved.previewMode;

  if (els.hallSqlInput && typeof saved.hallSql === 'string') els.hallSqlInput.value = saved.hallSql;
  if (els.hallStyle && typeof saved.hallStyle === 'string') els.hallStyle.value = saved.hallStyle;
  if (els.sqlMode && typeof saved.sqlMode === 'string') els.sqlMode.value = saved.sqlMode;
  if (els.insertHallId && typeof saved.insertHallId === 'string') els.insertHallId.value = saved.insertHallId;
  if (els.snapToPixel && typeof saved.snapToPixel === 'boolean') els.snapToPixel.checked = saved.snapToPixel;

  const operations = saved.operations || {};
  if (els.scaleX && operations.scaleX !== undefined) els.scaleX.value = operations.scaleX;
  if (els.scaleY && operations.scaleY !== undefined) els.scaleY.value = operations.scaleY;
  if (els.translateX && operations.translateX !== undefined) els.translateX.value = operations.translateX;
  if (els.translateY && operations.translateY !== undefined) els.translateY.value = operations.translateY;
  if (els.rotateX && operations.rotateX !== undefined) els.rotateX.value = operations.rotateX;
  if (els.rotateY && operations.rotateY !== undefined) els.rotateY.value = operations.rotateY;
  if (els.rotateAngle && operations.rotateAngle !== undefined) els.rotateAngle.value = operations.rotateAngle;

  return true;
}

function colorToSelectValue(color, allowNone = false, fallback = 'Чёрный') {
  const raw = String(color ?? '').trim();
  if (allowNone && (!raw || /^none$/i.test(raw) || /^null$/i.test(raw))) return 'none';
  if (QT_COLOR_LIST[raw]) {
    const hex = QT_COLOR_LIST[raw].toLowerCase();
    return QT_COLOR_NAME_BY_HEX.get(hex) || fallback;
  }
  const normalized = normalizeColor(raw);
  if (normalized) {
    return QT_COLOR_NAME_BY_HEX.get(normalized.slice(1).toLowerCase()) || fallback;
  }
  return fallback;
}

function normalizeColor(color) {
  const raw = String(color ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return '#' + raw.slice(1).split('').map(c => c + c).join('').toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return '#' + raw.toLowerCase();
  if (QT_COLOR_LIST[raw]) return '#' + QT_COLOR_LIST[raw];
  return null;
}

function resolveGeneratorColor(value, defaultHex = null, allowNull = false) {
  const raw = String(value ?? '').trim();
  if (allowNull && (!raw || /^none$/i.test(raw) || /^null$/i.test(raw))) {
    return { css: 'none', html: 'none', php: null, hex: null };
  }

  let hex = null;
  let php = null;

  if (QT_COLOR_LIST[raw]) {
    hex = QT_COLOR_LIST[raw].toLowerCase();
    php = raw;
  } else {
    const normalized = normalizeColor(raw || defaultHex);
    if (normalized) {
      hex = normalized.slice(1).toLowerCase();
      php = QT_COLOR_NAME_BY_HEX.get(hex) || ('#' + hex);
    }
  }

  if (!hex && defaultHex) {
    const normalized = normalizeColor(defaultHex);
    hex = normalized ? normalized.slice(1).toLowerCase() : '333333';
    php = QT_COLOR_NAME_BY_HEX.get(hex) || ('#' + hex);
  }

  if (!hex) {
    return { css: 'none', html: 'none', php: null, hex: null };
  }

  return { css: '#' + hex, html: '#' + hex, php, hex };
}

function phpQuote(value) {
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function phpScalar(value, decimals = 3) {
  const formatted = fmt(Number(value), decimals);
  return /^-?\d+$/.test(formatted) ? formatted : formatted;
}

function render() {
  readInputs();
  renderHall();
  renderObject();
  renderCommandPanel();
  updateSql();
}

function renderHall() {
  for (const layer of [els.hallBackgroundLayer, els.hallObjectsLayer, els.hallPlacesLayer]) {
    layer.style.opacity = '1';
    layer.classList.toggle('hall-view-old', els.hallStyle.value === 'view_old');
    layer.classList.toggle('hall-view', els.hallStyle.value !== 'view_old');
  }

  if (!state.hall) {
    els.hallBackgroundLayer.innerHTML = '';
    els.hallObjectsLayer.innerHTML = '';
    els.hallPlacesLayer.innerHTML = '';
    return;
  }

  els.hallBackgroundLayer.innerHTML = renderHallBackgroundMarkup(state.hall, els.hallStyle.value);
  els.hallObjectsLayer.innerHTML = renderHallObjectsMarkup(state.hall, els.hallStyle.value);
  els.hallPlacesLayer.innerHTML = renderHallPlacesMarkup(state.hall, els.hallStyle.value);
}

function getGeneratedShapeGeometry() {
  const width = Math.max(1, state.object.width);
  const height = Math.max(1, state.object.height);
  const borderSize = Math.max(0, state.object.strokeWidth);

  if (borderSize >= width || borderSize >= height) {
    return {
      valid: false,
      width,
      height,
      borderSize,
      innerWidth: width - borderSize,
      innerHeight: height - borderSize,
      scaleX: 1,
      scaleY: 1,
      translate: 0,
      transform: 'matrix(1 0 0 1 0 0)',
      shapeRendering: 'geometricPrecision'
    };
  }

  const innerWidth = width - borderSize;
  const innerHeight = height - borderSize;
  const scaleX = innerWidth / width;
  const scaleY = innerHeight / height;
  const translate = borderSize / 2;

  return {
    valid: true,
    width,
    height,
    borderSize,
    innerWidth,
    innerHeight,
    scaleX,
    scaleY,
    translate,
    transform: `matrix(${fmt(scaleX, 8)} 0 0 ${fmt(scaleY, 8)} ${fmt(translate, 4)} ${fmt(translate, 4)})`,
    shapeRendering: borderSize === 1 ? 'crispEdges' : 'geometricPrecision'
  };
}

function toGeneratedShapePoint(point, geom = getGeneratedShapeGeometry()) {
  return {
    x: point.x * geom.scaleX + geom.translate,
    y: point.y * geom.scaleY + geom.translate,
  };
}

function fromGeneratedShapePoint(point, geom = getGeneratedShapeGeometry()) {
  return {
    x: (point.x - geom.translate) / geom.scaleX,
    y: (point.y - geom.translate) / geom.scaleY,
  };
}

function renderObject() {
  els.objectLayer.innerHTML = '';
  if (els.serviceLayer) els.serviceLayer.innerHTML = '';
  if (els.svg) els.svg.classList.toggle('preview-mode', !!state.previewMode);
  if (els.previewToggle) {
    els.previewToggle.classList.toggle('active', !!state.previewMode);
    els.previewToggle.textContent = state.previewMode ? 'Правка' : 'Просмотр';
    els.previewToggle.title = state.previewMode ? 'Вернуться к редактированию' : 'Включить режим просмотра';
  }

  const parsed = parsePath(state.object.path);
  const geom = getGeneratedShapeGeometry();
  const pathIsValid = parsed.commands.length > 0 && !parsed.error && geom.valid;
  els.pathStatus.textContent = pathIsValid ? 'ok' : (geom.valid ? 'ошибка' : 'border');
  els.pathStatus.className = pathIsValid ? 'badge badge--ok' : 'badge badge--bad';
  if (!pathIsValid) return;

  const fillColor = resolveGeneratorColor(state.object.fill, null, true);
  const borderColor = resolveGeneratorColor(state.object.stroke, '#333333', false);

  // Итоговый preview рисуем как настоящий place_obj в зале:
  // foreignObject -> HTML div -> generated_object -> svg -> path.
  // Это повторяет логику qt.local / hall.qt.local, где весь зал является HTML-блоком
  // и масштабируется целиком через общий transform. Поэтому визуальное масштабирование
  // stroke совпадает с тем, как объект будет выглядеть в реальном зале.
  els.objectLayer.innerHTML = buildFinalObjectForeignObjectMarkup(
    state.object.x,
    state.object.y,
    geom,
    buildGeneratedObjectHtml(state.object.path, geom, fillColor, borderColor)
  );

  if (state.previewMode) return;

  const overlay = svgEl('g', { class: 'object-edit-overlay', transform: `translate(${fmt(state.object.x)} ${fmt(state.object.y)})` });
  overlay.appendChild(svgEl('rect', {
    class: 'object-guide',
    x: 0,
    y: 0,
    width: state.object.width,
    height: state.object.height,
  }));

  // Service path guide: solid helper line between path points/segments, rendered above the final figure.
  overlay.appendChild(svgEl('path', {
    class: 'service-path-guide',
    d: state.object.path,
    transform: geom.transform,
  }));

  const handles = buildHandles(parsed.commands);
  for (const line of handles.lines) {
    const p1 = toGeneratedShapePoint({ x: line.x1, y: line.y1 }, geom);
    const p2 = toGeneratedShapePoint({ x: line.x2, y: line.y2 }, geom);
    overlay.appendChild(svgEl('line', {
      class: 'control-line',
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
    }));
  }
  handles.points.forEach((point, idx) => {
    const visual = toGeneratedShapePoint(point, geom);
    const circle = svgEl('circle', {
      class: point.kind === 'control' ? 'control-point' : 'target-point',
      cx: visual.x,
      cy: visual.y,
      r: 5 * state.viewBox.w / Math.max(els.svg.getBoundingClientRect().width, 1),
      'data-index': idx,
    });
    circle.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      state.drag = { point };
      els.svg.classList.add('dragging');
    });
    overlay.appendChild(circle);
  });

  // Service handles are rendered in the last SVG layer, above the final object and places.
  // The final object itself stays in objectLayer, so SQL preview remains 1:1 with place_obj.param.
  (els.serviceLayer || els.objectLayer).appendChild(overlay);
}

function buildGeneratedPathAttributes(path, geom, fillColor, borderColor) {
  return {
    d: path,
    transform: geom.transform,
    fill: fillColor.css,
    stroke: geom.borderSize > 0 ? borderColor.css : 'none',
    'stroke-width': geom.borderSize,
    'vector-effect': 'non-scaling-stroke',
    'stroke-linejoin': 'miter',
    'shape-rendering': geom.shapeRendering,
  };
}

function buildFinalPreviewPathAttributes(path, geom, fillColor, borderColor) {
  const previewPath = bakeGeneratedShapeTransform(path, geom) || path;
  return {
    d: previewPath,
    fill: fillColor.css,
    stroke: geom.borderSize > 0 ? borderColor.css : 'none',
    'stroke-width': geom.borderSize,
    'vector-effect': 'non-scaling-stroke',
    'stroke-linejoin': 'miter',
    'shape-rendering': geom.shapeRendering,
    'data-sql-d': path,
    'data-sql-transform': geom.transform,
  };
}

function bakeGeneratedShapeTransform(path, geom) {
  const parsed = parsePath(path);
  if (parsed.error || parsed.commands.length === 0 || !geom.valid) return '';
  const commands = transformCommandsForPreview(parsed.commands, point => toGeneratedShapePoint(point, geom), {
    scaleX: geom.scaleX,
    scaleY: geom.scaleY,
  });
  return commandsToPath(commands);
}

function transformCommandsForPreview(commands, transformer, options = {}) {
  const result = [];
  let current = { x: 0, y: 0 };
  let subStart = { x: 0, y: 0 };
  for (const command of commands) {
    const abs = absoluteCommandAt(command, current, subStart);
    const upper = abs.type;
    const a = abs.args;
    if (upper === 'M') {
      const p = transformer({ x: a[0], y: a[1] });
      result.push({ type: 'M', args: [p.x, p.y] });
      current = { x: a[0], y: a[1] };
      subStart = { ...current };
    } else if (upper === 'L' || upper === 'T') {
      const p = transformer({ x: a[0], y: a[1] });
      result.push({ type: upper, args: [p.x, p.y] });
      current = { x: a[0], y: a[1] };
    } else if (upper === 'Q' || upper === 'S') {
      const p1 = transformer({ x: a[0], y: a[1] });
      const p2 = transformer({ x: a[2], y: a[3] });
      result.push({ type: upper, args: [p1.x, p1.y, p2.x, p2.y] });
      current = { x: a[2], y: a[3] };
    } else if (upper === 'C') {
      const p1 = transformer({ x: a[0], y: a[1] });
      const p2 = transformer({ x: a[2], y: a[3] });
      const p3 = transformer({ x: a[4], y: a[5] });
      result.push({ type: 'C', args: [p1.x, p1.y, p2.x, p2.y, p3.x, p3.y] });
      current = { x: a[4], y: a[5] };
    } else if (upper === 'A') {
      const end = transformer({ x: a[5], y: a[6] });
      const rx = Number.isFinite(options.scaleX) ? Math.abs(a[0] * options.scaleX) : a[0];
      const ry = Number.isFinite(options.scaleY) ? Math.abs(a[1] * options.scaleY) : a[1];
      result.push({ type: 'A', args: [rx, ry, a[2], a[3], a[4], end.x, end.y] });
      current = { x: a[5], y: a[6] };
    } else if (upper === 'Z') {
      result.push({ type: 'Z', args: [] });
      current = { ...subStart };
    }
  }
  return result;
}

function buildGeneratedObjectHtml(path, geom, fillColor, borderColor) {
  const fill = fillColor.html;
  const stroke = geom.borderSize > 0 ? borderColor.html : 'none';
  return `<div style="width:${fmt(geom.width)}px;height:${fmt(geom.height)}px;box-sizing:border-box;" generated_object><svg viewBox="0 0 ${fmt(geom.width)} ${fmt(geom.height)}" preserveAspectRatio="none" style="display:block;width:100%;height:100%;" xmlns="http://www.w3.org/2000/svg"><path d="${escapeXml(path)}" transform="${geom.transform}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${fmt(geom.borderSize)}" vector-effect="non-scaling-stroke" stroke-linejoin="miter" shape-rendering="${geom.shapeRendering}"></path></svg></div>`;
}

function buildFinalObjectForeignObjectMarkup(x, y, geom, generatedObjectHtml) {
  const width = Math.max(1, geom.width);
  const height = Math.max(1, geom.height);
  return `<foreignObject class="final-object-svg" x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}">
    <div xmlns="http://www.w3.org/1999/xhtml" class="qt-hall-object final-object-html" style="position:relative;left:0;top:0;width:${fmt(width)}px;height:${fmt(height)}px;overflow:visible;box-sizing:border-box;">
      ${generatedObjectHtml}
    </div>
  </foreignObject>`;
}

function getInsertHallIdSqlValue() {
  const raw = String(els.insertHallId ? els.insertHallId.value : '').trim();
  if (!raw || raw === '$$$') {
    if (els.insertHallId) els.insertHallId.setCustomValidity('');
    return '$$$';
  }
  if (raw === '@hall_id') {
    if (els.insertHallId) els.insertHallId.setCustomValidity('');
    return '@hall_id';
  }
  if (/^\d+$/.test(raw)) {
    if (els.insertHallId) els.insertHallId.setCustomValidity('');
    return raw;
  }

  if (els.insertHallId) {
    els.insertHallId.setCustomValidity('Допустимо только $$$, @hall_id или число');
    els.insertHallId.reportValidity();
  }
  return '$$$';
}

function buildInsertSql(html, geom) {
  const hallId = getInsertHallIdSqlValue();
  return `INSERT INTO place_obj (id, hall_id, x, y, width, height, type, param, in_front) VALUES\n(NULL, ${hallId}, ${fmt(state.object.x)}, ${fmt(state.object.y)}, ${fmt(geom.width)}, ${fmt(geom.height)}, 0, '${escapeSqlString(html)}', ${state.object.inFront});`;
}

function buildUpdateSql(html, geom) {
  return `UPDATE place_obj SET
  x = ${fmt(state.object.x)},
  y = ${fmt(state.object.y)},
  width = ${fmt(geom.width)},
  height = ${fmt(geom.height)},
  type = 0,
  param = '${escapeSqlString(html)}'
WHERE `;
}

function updateSqlModeUi() {
  if (!els.sqlMode) return;
  const isUpdate = els.sqlMode.value === 'update';
  if (els.insertHallIdField) els.insertHallIdField.style.display = isUpdate ? 'none' : '';
}

function updateSql() {
  const geom = getGeneratedShapeGeometry();
  const path = state.object.path.replace(/\s+/g, ' ').trim();
  const fillColor = resolveGeneratorColor(state.object.fill, null, true);
  const borderColor = resolveGeneratorColor(state.object.stroke, '#333333', false);
  const html = buildGeneratedObjectHtml(path, geom, fillColor, borderColor);
  state.sql.insert = buildInsertSql(html, geom);
  state.sql.update = buildUpdateSql(html, geom);
  els.sqlOutput.value = (els.sqlMode && els.sqlMode.value === 'update') ? state.sql.update : state.sql.insert;
  if (els.phpOutput) els.phpOutput.value = buildAddShapePhpCommand(path, geom, fillColor, borderColor);
}

function buildAddShapePhpCommand(path, geom, fillColor, borderColor) {
  const background = fillColor.php === null ? 'null' : phpQuote(fillColor.php);
  const border = borderColor.php === null ? 'null' : phpQuote(borderColor.php);
  const lines = [
    '$g->добавитьФигуру([',
    `    'x' => ${phpScalar(state.object.x, 3)},`,
    `    'y' => ${phpScalar(state.object.y, 3)},`,
    `    'width' => ${phpScalar(geom.width, 3)},`,
    `    'height' => ${phpScalar(geom.height, 3)},`,
    `    'path' => ${phpQuote(path)},`,
    `    'backgroundColor' => ${background},`,
    `    'borderColor' => ${border},`,
    `    'borderSize' => ${phpScalar(geom.borderSize, 3)},`,
    ']);'
  ];
  return lines.join('\n');
}

function htmlDecode(value) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(value ?? '');
  return textarea.value;
}

function parseStyleNumber(style, name) {
  const re = new RegExp(`${name}\\s*:\\s*([+-]?(?:\\d+\\.?\\d*|\\.\\d+))px`, 'i');
  const m = String(style || '').match(re);
  return m ? n(m[1], null) : null;
}

function parseAttributes(tagText) {
  const attrs = {};
  String(tagText || '').replace(/([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (_m, name, _full, dq, sq) => {
    attrs[name.toLowerCase()] = htmlDecode(dq ?? sq ?? '');
    return _m;
  });
  return attrs;
}

function normalizePastedObjectSource(text) {
  return htmlDecode(String(text ?? ''))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/''/g, "'");
}

function extractGeneratedObjectDiv(text) {
  const source = normalizePastedObjectSource(text);
  const divOpenRe = /<div\b[^>]*>/ig;
  let match;
  while ((match = divOpenRe.exec(source))) {
    const openTag = match[0];
    const start = match.index;
    const closeIndex = source.indexOf('</div>', divOpenRe.lastIndex);
    if (closeIndex < 0) continue;
    const fragment = source.slice(start, closeIndex + '</div>'.length);
    const isGenerated = /\bgenerated_object\b/i.test(openTag);
    const hasSvgPath = /<svg\b[\s\S]*<path\b/i.test(fragment);
    if (isGenerated && hasSvgPath) return fragment;
  }

  divOpenRe.lastIndex = 0;
  while ((match = divOpenRe.exec(source))) {
    const start = match.index;
    const closeIndex = source.indexOf('</div>', divOpenRe.lastIndex);
    if (closeIndex < 0) continue;
    const fragment = source.slice(start, closeIndex + '</div>'.length);
    if (/<svg\b[\s\S]*<path\b/i.test(fragment)) return fragment;
  }

  return null;
}

function parseGeneratedObjectHtml(text) {
  const originalSource = String(text ?? '');

  // Если вставлен полный SQL INSERT/UPDATE, сначала пробуем достать HTML из поля param,
  // чтобы вместе с HTML подтянуть x/y/width/height из колонок place_obj.
  const sqlObject = parseSqlPlaceObjGeneratedObject(originalSource);
  if (sqlObject && sqlObject.html) {
    const html = extractGeneratedObjectDiv(sqlObject.html) || sqlObject.html;
    const parsedHtml = parseGeneratedObjectHtmlFragment(html);
    if (parsedHtml) {
      return Object.assign(parsedHtml, sqlObject.meta, {
        path: parsedHtml.path,
        fill: parsedHtml.fill,
        stroke: parsedHtml.stroke,
        strokeWidth: parsedHtml.strokeWidth,
      });
    }
  }

  // Любой другой текст: UPDATE с произвольным WHERE, письмо, комментарий,
  // PHP-строка с HTML и т.п. Главное — найти внутри div со вложенным svg/path.
  const html = extractGeneratedObjectDiv(originalSource);
  if (!html) return null;
  return parseGeneratedObjectHtmlFragment(html);
}

function parseGeneratedObjectHtmlFragment(text) {
  const source = normalizePastedObjectSource(text);
  const result = {};

  const divMatch = source.match(/<div\b[^>]*>/i);
  if (!divMatch || !/<svg\b[\s\S]*<path\b/i.test(source)) return null;

  const divAttrs = parseAttributes(divMatch[0]);
  const style = divAttrs.style || '';
  const width = parseStyleNumber(style, 'width');
  const height = parseStyleNumber(style, 'height');
  if (width !== null) result.width = width;
  if (height !== null) result.height = height;

  const svgMatch = source.match(/<svg\b[^>]*>/i);
  if (svgMatch) {
    const svgAttrs = parseAttributes(svgMatch[0]);
    const vb = String(svgAttrs.viewbox || '').trim().split(/[\s,]+/).map(Number);
    if ((result.width === undefined || result.height === undefined) && vb.length >= 4 && vb.every(Number.isFinite)) {
      result.width = vb[2];
      result.height = vb[3];
    }
  }

  const pathMatch = source.match(/<path\b[^>]*>/i);
  if (!pathMatch) return null;
  const pathAttrs = parseAttributes(pathMatch[0]);
  if (!pathAttrs.d) return null;

  result.path = pathAttrs.d;
  if (pathAttrs.fill && !/^none$/i.test(pathAttrs.fill)) result.fill = colorToSelectValue(pathAttrs.fill, true, 'none');
  if (pathAttrs.fill && /^none$/i.test(pathAttrs.fill)) result.fill = 'none';
  if (pathAttrs.stroke && !/^none$/i.test(pathAttrs.stroke)) result.stroke = colorToSelectValue(pathAttrs.stroke, false, 'Чёрный');
  if (pathAttrs['stroke-width'] !== undefined) result.strokeWidth = n(pathAttrs['stroke-width'], state.object.strokeWidth);

  return result;
}

function parseSqlPlaceObjGeneratedObject(text) {
  const source = String(text || '');
  const insert = parsePlaceObjInsertRecord(source);
  if (insert && /generated_object|<path\b/i.test(String(insert.record.param || ''))) {
    return {
      html: String(insert.record.param || ''),
      meta: {
        x: n(insert.record.x, state.object.x),
        y: n(insert.record.y, state.object.y),
        width: n(insert.record.width, state.object.width),
        height: n(insert.record.height, state.object.height),
        inFront: n(insert.record.in_front, state.object.inFront),
      },
    };
  }

  const update = parsePlaceObjUpdateRecord(source);
  if (update && /generated_object|<path\b/i.test(String(update.record.param || ''))) {
    return {
      html: String(update.record.param || ''),
      meta: {
        x: n(update.record.x, state.object.x),
        y: n(update.record.y, state.object.y),
        width: n(update.record.width, state.object.width),
        height: n(update.record.height, state.object.height),
        inFront: n(update.record.in_front, state.object.inFront),
      },
    };
  }

  return null;
}

function parsePlaceObjInsertRecord(text) {
  const inserts = parseInsertStatements(text);
  const insert = inserts.find(item => String(item.table).replace(/`/g, '').toLowerCase() === 'place_obj' && item.rows.length);
  if (!insert) return null;
  const row = insert.rows[0];
  const columns = insert.columns && insert.columns.length ? insert.columns : QT_DEFAULT_SQL_COLUMNS.place_obj;
  const record = {};
  columns.forEach((col, idx) => { record[String(col).replace(/[ `]/g, '').toLowerCase()] = row[idx]; });
  return { record, row, columns };
}

function parsePlaceObjUpdateRecord(text) {
  const source = stripSqlComments(text);
  const m = source.match(/UPDATE\s+`?place_obj`?\s+SET\s+/i);
  if (!m) return null;
  let setPart = source.slice(m.index + m[0].length);
  const whereIndex = findSqlKeywordOutsideQuotes(setPart, 'WHERE');
  if (whereIndex >= 0) setPart = setPart.slice(0, whereIndex);
  setPart = setPart.replace(/;\s*$/, '');
  const record = {};
  for (const part of splitCsv(setPart)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).replace(/[ `]/g, '').toLowerCase();
    record[key] = parseSqlValue(part.slice(eq + 1));
  }
  return Object.keys(record).length ? { record } : null;
}

function findSqlKeywordOutsideQuotes(text, keyword) {
  const source = String(text || '');
  const upperKeyword = String(keyword || '').toUpperCase();
  let quote = null;
  for (let i = 0; i <= source.length - upperKeyword.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (ch === quote) {
        if (source[i + 1] === quote) { i++; continue; }
        if (prev !== '\\') quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    const before = i === 0 ? ' ' : source[i - 1];
    const after = source[i + upperKeyword.length] || ' ';
    if (/\W/.test(before) && /\W/.test(after) && source.slice(i, i + upperKeyword.length).toUpperCase() === upperKeyword) {
      return i;
    }
  }
  return -1;
}

function unescapePhpString(value) {
  return String(value ?? '')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

function parsePhpArrayParams(text) {
  const params = {};
  const re = /['"]?([a-zA-Z_][\w]*)['"]?\s*=>\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|(null|NULL)|([+-]?(?:\d+\.?\d*|\.\d+)))/g;
  let m;
  while ((m = re.exec(String(text)))) {
    const key = m[1];
    if (m[2] !== undefined) params[key] = unescapePhpString(m[2]);
    else if (m[3] !== undefined) params[key] = unescapePhpString(m[3]);
    else if (m[4] !== undefined) params[key] = null;
    else if (m[5] !== undefined) params[key] = Number(m[5]);
  }
  return Object.keys(params).length ? params : null;
}

function parseAddShapeText(text) {
  const source = String(text || '').trim();
  if (!source) return null;

  const htmlResult = parseGeneratedObjectHtml(source);
  if (htmlResult) return htmlResult;

  const params = parsePhpArrayParams(source);
  if (!params || params.path === undefined) return null;
  return {
    x: params.x !== undefined && params.x !== null ? n(params.x, state.object.x) : state.object.x,
    y: params.y !== undefined && params.y !== null ? n(params.y, state.object.y) : state.object.y,
    width: params.width !== undefined ? n(params.width, state.object.width) : state.object.width,
    height: params.height !== undefined ? n(params.height, state.object.height) : state.object.height,
    path: String(params.path),
    fill: params.backgroundColor === null ? 'none' : colorToSelectValue(params.backgroundColor, true, 'none'),
    stroke: params.borderColor === null ? 'Чёрный' : colorToSelectValue(params.borderColor, false, 'Чёрный'),
    strokeWidth: params.borderSize !== undefined ? n(params.borderSize, state.object.strokeWidth) : n(params.border, state.object.strokeWidth),
  };
}

function loadObjectFromText() {
  const parsed = parseAddShapeText(els.objectImportInput ? els.objectImportInput.value : '');
  if (!parsed) {
    if (els.objectImportStatus) {
      els.objectImportStatus.hidden = false;
      els.objectImportStatus.className = 'modal-status';
      els.objectImportStatus.textContent = 'Не удалось найти и разобрать объект. Для HTML/SQL/любого текста нужен <div ... generated_object> или <div> со вложенным <svg><path ...>. Для PHP нужен $g->добавитьФигуру([...]) с параметром path.';
    }
    if (els.pathStatus) {
      els.pathStatus.textContent = 'не разобрано';
      els.pathStatus.className = 'badge badge--bad';
    }
    return;
  }

  if (parsed.x !== undefined) state.object.x = parsed.x;
  if (parsed.y !== undefined) state.object.y = parsed.y;
  if (parsed.width !== undefined) state.object.width = Math.max(1, n(parsed.width, state.object.width));
  if (parsed.height !== undefined) state.object.height = Math.max(1, n(parsed.height, state.object.height));
  if (parsed.path !== undefined) state.object.path = String(parsed.path).replace(/\s+/g, ' ').trim();
  if (parsed.fill !== undefined) state.object.fill = parsed.fill;
  if (parsed.stroke !== undefined) state.object.stroke = parsed.stroke;
  if (parsed.strokeWidth !== undefined) state.object.strokeWidth = Math.max(0, n(parsed.strokeWidth, state.object.strokeWidth));

  state.selectedCommandIndex = 0;
  writeInputs();
  render();
  pushHistory();
  closeObjectImportModal();
}

function openObjectImportModal() {
  if (!els.objectImportModal) return;
  if (els.objectImportStatus) {
    els.objectImportStatus.hidden = true;
    els.objectImportStatus.textContent = '';
  }
  els.objectImportModal.classList.add('is-open');
  els.objectImportModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => els.objectImportInput?.focus(), 0);
}

function closeObjectImportModal() {
  if (!els.objectImportModal) return;
  els.objectImportModal.classList.remove('is-open');
  els.objectImportModal.setAttribute('aria-hidden', 'true');
}

function tokenizePath(d) {
  return String(d).match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
}

const ARG_COUNTS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const COMMAND_TYPES = ['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z'];
const COMMAND_NAMES = {
  M: 'M Move to',
  L: 'L Line to',
  H: 'H Horizontal',
  V: 'V Vertical',
  C: 'C Cubic',
  S: 'S Smooth cubic',
  Q: 'Q Quadratic',
  T: 'T Smooth quadratic',
  A: 'A Arc',
  Z: 'Z Close path',
};
const COMMAND_ARG_LABELS = {
  M: ['x', 'y'],
  L: ['x', 'y'],
  H: ['x'],
  V: ['y'],
  C: ['x1', 'y1', 'x2', 'y2', 'x', 'y'],
  S: ['x2', 'y2', 'x', 'y'],
  Q: ['x1', 'y1', 'x', 'y'],
  T: ['x', 'y'],
  A: ['rx', 'ry', 'rot', 'large', 'sweep', 'x', 'y'],
  Z: [],
};
const ARC_FLAG_ARG_INDEXES = new Set([3, 4]);

function populateCommandTypeSelects() {
  for (const select of [els.insertCommandType, els.replaceCommandType]) {
    if (!select) continue;
    select.innerHTML = COMMAND_TYPES.map(type => `<option value="${type}">${COMMAND_NAMES[type]}</option>`).join('');
  }
  if (els.insertCommandType) els.insertCommandType.value = 'L';
  if (els.replaceCommandType) els.replaceCommandType.value = 'L';
}

function getParsedCommands() {
  const parsed = parsePath(state.object.path);
  return parsed.error ? [] : parsed.commands;
}

function commitCommands(commands, selectedIndex = state.selectedCommandIndex, saveHistory = true) {
  state.object.path = commandsToPath(commands);
  state.selectedCommandIndex = Math.min(Math.max(selectedIndex, -1), commands.length - 1);
  els.pathInput.value = state.object.path;
  render();
  if (saveHistory) pushHistory();
}

function pointBeforeCommand(commands, commandIndex) {
  const before = commands.slice(0, Math.max(0, commandIndex));
  const handles = buildHandles(before);
  return handles.current || { x: 0, y: 0 };
}

function pointAfterCommand(commands, commandIndex) {
  const before = commands.slice(0, Math.max(0, commandIndex + 1));
  const handles = buildHandles(before);
  return handles.current || { x: 0, y: 0 };
}

function defaultCommand(type, point = { x: 0, y: 0 }, previousPoint = point) {
  const t = String(type || 'L').toUpperCase();
  const x = Number.isFinite(point.x) ? point.x : 0;
  const y = Number.isFinite(point.y) ? point.y : 0;
  const px = Number.isFinite(previousPoint.x) ? previousPoint.x : x;
  const py = Number.isFinite(previousPoint.y) ? previousPoint.y : y;
  if (t === 'M' || t === 'L' || t === 'T') return { type: t, args: [x, y] };
  if (t === 'H') return { type: t, args: [x] };
  if (t === 'V') return { type: t, args: [y] };
  if (t === 'Q') return { type: t, args: [px, py, x, y] };
  if (t === 'C') return { type: t, args: [px, py, x, y, x, y] };
  if (t === 'S') return { type: t, args: [x, y, x, y] };
  if (t === 'A') return { type: t, args: [1, 1, 0, 0, 0, x, y] };
  return { type: 'Z', args: [] };
}

function commandEndpoint(command, startPoint = { x: 0, y: 0 }) {
  const t = command.type;
  const upper = t.toUpperCase();
  const rel = t === t.toLowerCase();
  const bx = rel ? startPoint.x : 0;
  const by = rel ? startPoint.y : 0;
  const a = command.args;
  if (upper === 'M' || upper === 'L' || upper === 'T') return { x: bx + a[0], y: by + a[1] };
  if (upper === 'H') return { x: bx + a[0], y: startPoint.y };
  if (upper === 'V') return { x: startPoint.x, y: by + a[0] };
  if (upper === 'Q' || upper === 'S') return { x: bx + a[2], y: by + a[3] };
  if (upper === 'C') return { x: bx + a[4], y: by + a[5] };
  if (upper === 'A') return { x: bx + a[5], y: by + a[6] };
  return startPoint;
}

function convertCommand(command, newType, startPoint = { x: 0, y: 0 }) {
  const type = String(newType || command.type).toUpperCase();
  const end = commandEndpoint(command, startPoint);
  const converted = defaultCommand(type, end, startPoint);
  const upperOld = command.type.toUpperCase();
  if (type === upperOld && ARG_COUNTS[type] === command.args.length) {
    return { type, args: [...command.args] };
  }

  // Частично сохраняем уже введенные управляющие точки, когда это безопасно.
  if ((type === 'Q' || type === 'S') && command.args.length >= 4) {
    converted.args[0] = command.args[0];
    converted.args[1] = command.args[1];
  }
  if (type === 'C' && command.args.length >= 6) {
    converted.args[0] = command.args[0];
    converted.args[1] = command.args[1];
    converted.args[2] = command.args[2];
    converted.args[3] = command.args[3];
  }
  if (type === 'A' && upperOld === 'A') {
    converted.args = [...command.args];
  }
  return converted;
}

function renderCommandPanel() {
  if (!els.commandsList) return;
  const parsed = parsePath(state.object.path);
  if (parsed.error || parsed.commands.length === 0) {
    els.commandsList.innerHTML = `<div class="commands-empty">Path не разобран: ${escapeXml(parsed.error || 'нет команд')}</div>`;
    if (els.selectedCommandStatus) els.selectedCommandStatus.textContent = 'ошибка';
    return;
  }

  if (state.selectedCommandIndex >= parsed.commands.length) state.selectedCommandIndex = parsed.commands.length - 1;
  if (state.selectedCommandIndex < 0 && parsed.commands.length) state.selectedCommandIndex = 0;
  const selected = parsed.commands[state.selectedCommandIndex];
  if (els.selectedCommandStatus) {
    els.selectedCommandStatus.textContent = selected ? `${state.selectedCommandIndex + 1}: ${selected.type.toUpperCase()}` : 'не выбрано';
    els.selectedCommandStatus.className = selected ? 'badge badge--ok' : 'badge';
  }
  if (els.replaceCommandType && selected) els.replaceCommandType.value = selected.type.toUpperCase();

  els.commandsList.innerHTML = '';
  parsed.commands.forEach((command, index) => {
    const upper = command.type.toUpperCase();
    const row = document.createElement('div');
    row.className = 'command-row' + (index === state.selectedCommandIndex ? ' selected' : '');
    row.dataset.index = String(index);

    const idx = document.createElement('button');
    idx.type = 'button';
    idx.className = 'command-index';
    const isRelative = command.type === command.type.toLowerCase();
    idx.textContent = isRelative ? 'О' : 'А';
    idx.title = isRelative
      ? `${index + 1}. Команда относительная. Нажми, чтобы сделать абсолютной.`
      : `${index + 1}. Команда абсолютная. Нажми, чтобы сделать относительной.`;
    idx.addEventListener('click', () => toggleCommandRelative(index));
    row.appendChild(idx);

    const typeSelect = document.createElement('select');
    typeSelect.className = 'command-type';
    typeSelect.innerHTML = COMMAND_TYPES.map(type => `<option value="${type}">${type}</option>`).join('');
    typeSelect.value = upper;
    typeSelect.title = COMMAND_NAMES[upper] || upper;
    typeSelect.addEventListener('change', () => {
      const commands = getParsedCommands();
      const start = pointBeforeCommand(commands, index);
      commands[index] = convertCommand(commands[index], typeSelect.value, start);
      commitCommands(commands, index);
    });
    row.appendChild(typeSelect);

    const args = document.createElement('div');
    args.className = 'command-args';
    const labels = COMMAND_ARG_LABELS[upper] || [];
    if (command.args.length === 0) {
      const z = document.createElement('span');
      z.className = 'command-no-args';
      z.textContent = 'без координат';
      args.appendChild(z);
    }
    command.args.forEach((value, argIndex) => {
      const wrap = document.createElement('label');
      wrap.className = 'command-arg';
      const span = document.createElement('span');
      span.textContent = labels[argIndex] || String(argIndex + 1);
      const input = document.createElement('input');
      input.type = 'number';
      input.step = (upper === 'A' && ARC_FLAG_ARG_INDEXES.has(argIndex)) ? '1' : '0.5';
      input.value = fmt(value, 4);
      input.addEventListener('focus', () => {
        state.selectedCommandIndex = index;
        if (els.selectedCommandStatus) {
          els.selectedCommandStatus.textContent = `${index + 1}: ${upper}`;
          els.selectedCommandStatus.className = 'badge badge--ok';
        }
      });
      input.addEventListener('change', () => {
        const commands = getParsedCommands();
        if (!commands[index]) return;
        let nextValue = n(input.value, 0);
        if (upper === 'A' && ARC_FLAG_ARG_INDEXES.has(argIndex)) nextValue = nextValue ? 1 : 0;
        commands[index].args[argIndex] = nextValue;
        commitCommands(commands, index);
      });
      wrap.appendChild(span);
      wrap.appendChild(input);
      args.appendChild(wrap);
    });
    row.appendChild(args);

    row.addEventListener('click', event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;
      state.selectedCommandIndex = index;
      renderCommandPanel();
      renderObject();
    });
    els.commandsList.appendChild(row);
  });
}

function insertCommandAfterSelected() {
  const commands = getParsedCommands();
  if (commands.length === 0) return;
  const selected = Math.min(Math.max(state.selectedCommandIndex, 0), commands.length - 1);
  const after = pointAfterCommand(commands, selected);
  const type = els.insertCommandType?.value || 'L';
  commands.splice(selected + 1, 0, defaultCommand(type, after, after));
  commitCommands(commands, selected + 1);
}

function replaceSelectedCommandType() {
  const commands = getParsedCommands();
  if (commands.length === 0 || state.selectedCommandIndex < 0) return;
  const index = Math.min(state.selectedCommandIndex, commands.length - 1);
  const start = pointBeforeCommand(commands, index);
  commands[index] = convertCommand(commands[index], els.replaceCommandType?.value || commands[index].type, start);
  commitCommands(commands, index);
}

function deleteSelectedCommand() {
  const commands = getParsedCommands();
  if (commands.length <= 1 || state.selectedCommandIndex <= 0) return;
  const index = Math.min(state.selectedCommandIndex, commands.length - 1);
  commands.splice(index, 1);
  commitCommands(commands, Math.min(index, commands.length - 1));
}

function convertCommandToMode(command, startPoint, makeRelative) {
  const upper = command.type.toUpperCase();
  const isRelative = command.type === command.type.toLowerCase();
  if (upper === 'Z' || isRelative === makeRelative) return { type: makeRelative ? upper.toLowerCase() : upper, args: [...command.args] };

  const bx = startPoint.x;
  const by = startPoint.y;
  const args = [...command.args];
  const convertPair = (xIndex, yIndex) => {
    if (xIndex !== null && xIndex !== undefined) args[xIndex] = makeRelative ? args[xIndex] - bx : args[xIndex] + bx;
    if (yIndex !== null && yIndex !== undefined) args[yIndex] = makeRelative ? args[yIndex] - by : args[yIndex] + by;
  };

  if (upper === 'M' || upper === 'L' || upper === 'T') convertPair(0, 1);
  else if (upper === 'H') args[0] = makeRelative ? args[0] - bx : args[0] + bx;
  else if (upper === 'V') args[0] = makeRelative ? args[0] - by : args[0] + by;
  else if (upper === 'Q' || upper === 'S') { convertPair(0, 1); convertPair(2, 3); }
  else if (upper === 'C') { convertPair(0, 1); convertPair(2, 3); convertPair(4, 5); }
  else if (upper === 'A') convertPair(5, 6);

  return { type: makeRelative ? upper.toLowerCase() : upper, args };
}

function toggleCommandRelative(index) {
  const commands = getParsedCommands();
  if (!commands[index]) return;
  const start = pointBeforeCommand(commands, index);
  const isRelative = commands[index].type === commands[index].type.toLowerCase();
  commands[index] = convertCommandToMode(commands[index], start, !isRelative);
  commitCommands(commands, index);
}

function absoluteCommandAt(command, current, subStart = { x: 0, y: 0 }) {
  const upper = command.type.toUpperCase();
  const rel = command.type === command.type.toLowerCase();
  const bx = rel ? current.x : 0;
  const by = rel ? current.y : 0;
  const a = command.args;
  if (upper === 'M' || upper === 'L' || upper === 'T') return { type: upper, args: [bx + a[0], by + a[1]] };
  if (upper === 'H') return { type: 'L', args: [bx + a[0], current.y] };
  if (upper === 'V') return { type: 'L', args: [current.x, by + a[0]] };
  if (upper === 'Q' || upper === 'S') return { type: upper, args: [bx + a[0], by + a[1], bx + a[2], by + a[3]] };
  if (upper === 'C') return { type: 'C', args: [bx + a[0], by + a[1], bx + a[2], by + a[3], bx + a[4], by + a[5]] };
  if (upper === 'A') return { type: 'A', args: [a[0], a[1], a[2], a[3], a[4], bx + a[5], by + a[6]] };
  return { type: 'Z', args: [] };
}

function transformPath(transformer, options = {}) {
  readInputs();
  const parsed = parsePath(state.object.path);
  if (parsed.error || parsed.commands.length === 0) return;
  const commands = [];
  let current = { x: 0, y: 0 };
  let subStart = { x: 0, y: 0 };
  for (const command of parsed.commands) {
    const abs = absoluteCommandAt(command, current, subStart);
    const upper = abs.type;
    const a = abs.args;
    if (upper === 'M') {
      const p = transformer({ x: a[0], y: a[1] });
      commands.push({ type: 'M', args: [p.x, p.y] });
      current = { x: a[0], y: a[1] };
      subStart = { ...current };
    } else if (upper === 'L' || upper === 'T') {
      const p = transformer({ x: a[0], y: a[1] });
      commands.push({ type: upper, args: [p.x, p.y] });
      current = { x: a[0], y: a[1] };
    } else if (upper === 'Q' || upper === 'S') {
      const p1 = transformer({ x: a[0], y: a[1] });
      const p2 = transformer({ x: a[2], y: a[3] });
      commands.push({ type: upper, args: [p1.x, p1.y, p2.x, p2.y] });
      current = { x: a[2], y: a[3] };
    } else if (upper === 'C') {
      const p1 = transformer({ x: a[0], y: a[1] });
      const p2 = transformer({ x: a[2], y: a[3] });
      const p3 = transformer({ x: a[4], y: a[5] });
      commands.push({ type: 'C', args: [p1.x, p1.y, p2.x, p2.y, p3.x, p3.y] });
      current = { x: a[4], y: a[5] };
    } else if (upper === 'A') {
      const end = transformer({ x: a[5], y: a[6] });
      const rx = Number.isFinite(options.scaleX) ? Math.abs(a[0] * options.scaleX) : a[0];
      const ry = Number.isFinite(options.scaleY) ? Math.abs(a[1] * options.scaleY) : a[1];
      const rotation = Number.isFinite(options.rotateAngle) ? a[2] + options.rotateAngle : a[2];
      commands.push({ type: 'A', args: [rx, ry, rotation, a[3], a[4], end.x, end.y] });
      current = { x: a[5], y: a[6] };
    } else if (upper === 'Z') {
      commands.push({ type: 'Z', args: [] });
      current = { ...subStart };
    }
  }
  commitCommands(commands, state.selectedCommandIndex);
}

function applyScale() {
  const sx = n(els.scaleX?.value, 1);
  const sy = n(els.scaleY?.value, 1);
  transformPath(point => ({ x: point.x * sx, y: point.y * sy }), { scaleX: sx, scaleY: sy });
  if (els.scaleX) els.scaleX.value = '1';
  if (els.scaleY) els.scaleY.value = '1';
}

function applyTranslate() {
  const dx = n(els.translateX?.value, 0);
  const dy = n(els.translateY?.value, 0);
  transformPath(point => ({ x: point.x + dx, y: point.y + dy }));
  if (els.translateX) els.translateX.value = '0';
  if (els.translateY) els.translateY.value = '0';
}

function applyRotate() {
  const cx = n(els.rotateX?.value, 0);
  const cy = n(els.rotateY?.value, 0);
  const angle = n(els.rotateAngle?.value, 0);
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  transformPath(point => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }, { rotateAngle: angle });
  if (els.rotateAngle) els.rotateAngle.value = '0';
}

function parsePath(d) {
  const tokens = tokenizePath(d);
  const commands = [];
  let i = 0;
  let cmd = null;
  let error = null;
  try {
    while (i < tokens.length) {
      if (/^[AaCcHhLlMmQqSsTtVvZz]$/.test(tokens[i])) {
        cmd = tokens[i++];
      } else if (!cmd) {
        throw new Error('Path должен начинаться с команды');
      }
      const upper = cmd.toUpperCase();
      const count = ARG_COUNTS[upper];
      if (count === 0) {
        commands.push({ type: cmd, args: [] });
        cmd = null;
        continue;
      }
      if (i + count > tokens.length) throw new Error(`Недостаточно координат для ${cmd}`);
      while (i + count <= tokens.length) {
        if (/^[AaCcHhLlMmQqSsTtVvZz]$/.test(tokens[i])) break;
        const args = tokens.slice(i, i + count).map(Number);
        if (args.some(v => !Number.isFinite(v))) throw new Error(`Неверное число в ${cmd}`);
        commands.push({ type: cmd, args });
        i += count;
        if (upper === 'M') cmd = cmd === 'M' ? 'L' : 'l';
        if (i >= tokens.length || /^[AaCcHhLlMmQqSsTtVvZz]$/.test(tokens[i])) break;
      }
    }
  } catch (e) {
    error = e.message;
  }
  return { commands, error };
}

function commandsToPath(commands) {
  return commands.map(command => {
    if (command.args.length === 0) return command.type;
    return `${command.type} ${command.args.map(v => fmt(v)).join(' ')}`;
  }).join(' ');
}

function updatePathCommandPoint(point, localX, localY) {
  const parsed = parsePath(state.object.path);
  const command = parsed.commands[point.commandIndex];
  if (!command) return;
  const rel = command.type === command.type.toLowerCase();
  const baseX = rel ? point.baseX : 0;
  const baseY = rel ? point.baseY : 0;
  if (point.xArg !== null) command.args[point.xArg] = localX - baseX;
  if (point.yArg !== null) command.args[point.yArg] = localY - baseY;
  state.object.path = commandsToPath(parsed.commands);
  els.pathInput.value = state.object.path;
}

function buildHandles(commands) {
  const points = [];
  const lines = [];
  let current = { x: 0, y: 0 };
  let subStart = { x: 0, y: 0 };

  const addPoint = (commandIndex, xArg, yArg, kind, label, x, y, baseX, baseY) => {
    points.push({ commandIndex, xArg, yArg, kind, label, x, y, baseX, baseY });
  };

  commands.forEach((command, commandIndex) => {
    const t = command.type;
    const upper = t.toUpperCase();
    const rel = t === t.toLowerCase();
    const bx = rel ? current.x : 0;
    const by = rel ? current.y : 0;
    const a = command.args;

    if (upper === 'M') {
      const x = bx + a[0];
      const y = by + a[1];
      addPoint(commandIndex, 0, 1, 'target', 'M', x, y, bx, by);
      current = { x, y };
      subStart = { ...current };
    } else if (upper === 'L' || upper === 'T') {
      const x = bx + a[0];
      const y = by + a[1];
      addPoint(commandIndex, 0, 1, 'target', upper, x, y, bx, by);
      current = { x, y };
    } else if (upper === 'H') {
      const x = bx + a[0];
      addPoint(commandIndex, 0, null, 'target', 'H', x, current.y, bx, by);
      current = { x, y: current.y };
    } else if (upper === 'V') {
      const y = by + a[0];
      addPoint(commandIndex, null, 0, 'target', 'V', current.x, y, bx, by);
      current = { x: current.x, y };
    } else if (upper === 'Q') {
      const c = { x: bx + a[0], y: by + a[1] };
      const end = { x: bx + a[2], y: by + a[3] };
      lines.push({ x1: current.x, y1: current.y, x2: c.x, y2: c.y });
      lines.push({ x1: c.x, y1: c.y, x2: end.x, y2: end.y });
      addPoint(commandIndex, 0, 1, 'control', 'Q', c.x, c.y, bx, by);
      addPoint(commandIndex, 2, 3, 'target', 'Q', end.x, end.y, bx, by);
      current = end;
    } else if (upper === 'C') {
      const c1 = { x: bx + a[0], y: by + a[1] };
      const c2 = { x: bx + a[2], y: by + a[3] };
      const end = { x: bx + a[4], y: by + a[5] };
      lines.push({ x1: current.x, y1: current.y, x2: c1.x, y2: c1.y });
      lines.push({ x1: c2.x, y1: c2.y, x2: end.x, y2: end.y });
      addPoint(commandIndex, 0, 1, 'control', 'C1', c1.x, c1.y, bx, by);
      addPoint(commandIndex, 2, 3, 'control', 'C2', c2.x, c2.y, bx, by);
      addPoint(commandIndex, 4, 5, 'target', 'C', end.x, end.y, bx, by);
      current = end;
    } else if (upper === 'S') {
      const c2 = { x: bx + a[0], y: by + a[1] };
      const end = { x: bx + a[2], y: by + a[3] };
      lines.push({ x1: c2.x, y1: c2.y, x2: end.x, y2: end.y });
      addPoint(commandIndex, 0, 1, 'control', 'S', c2.x, c2.y, bx, by);
      addPoint(commandIndex, 2, 3, 'target', 'S', end.x, end.y, bx, by);
      current = end;
    } else if (upper === 'A') {
      const end = { x: bx + a[5], y: by + a[6] };
      addPoint(commandIndex, 5, 6, 'target', 'A', end.x, end.y, bx, by);
      current = end;
    } else if (upper === 'Z') {
      current = { ...subStart };
    }
  });

  return { points, lines, current };
}

function fitObjectToPath() {
  readInputs();
  const box = measurePath(state.object.path);
  if (!box) return;

  // Важно: "Размер по path" подгоняет габариты только по геометрии исходного path.
  // Толщина обводки здесь не прибавляется, потому что добавитьФигуру() уже
  // вписывает обводку внутрь итоговых width/height через matrix(...).
  state.object.x += box.x;
  state.object.y += box.y;
  state.object.width = Math.max(1, Math.ceil(box.width));
  state.object.height = Math.max(1, Math.ceil(box.height));
  state.object.path = translatePath(state.object.path, -box.x, -box.y);
  writeInputs();
  render();
  pushHistory();
}

function measurePath(pathData) {
  const hidden = document.createElementNS(SVG_NS, 'svg');
  hidden.setAttribute('class', 'hidden-measurer');
  const path = svgEl('path', { d: pathData });
  hidden.appendChild(path);
  document.body.appendChild(hidden);
  let box = null;
  try {
    const b = path.getBBox();
    box = { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch (_) {
    box = null;
  }
  hidden.remove();
  return box;
}

function translatePath(pathData, dx, dy) {
  const parsed = parsePath(pathData);
  if (parsed.error) return pathData;
  parsed.commands.forEach(command => {
    if (command.type !== command.type.toUpperCase()) return;
    const t = command.type;
    if (t === 'M' || t === 'L' || t === 'T') {
      command.args[0] += dx; command.args[1] += dy;
    } else if (t === 'H') {
      command.args[0] += dx;
    } else if (t === 'V') {
      command.args[0] += dy;
    } else if (t === 'Q' || t === 'S') {
      command.args[0] += dx; command.args[1] += dy; command.args[2] += dx; command.args[3] += dy;
    } else if (t === 'C') {
      command.args[0] += dx; command.args[1] += dy; command.args[2] += dx; command.args[3] += dy; command.args[4] += dx; command.args[5] += dy;
    } else if (t === 'A') {
      command.args[5] += dx; command.args[6] += dy;
    }
  });
  return commandsToPath(parsed.commands);
}



const QT_DEFAULT_SQL_COLUMNS = {
  halls: ['id', 'name', 'address', 'cplace', 'show_place', 'width', 'height', 'archive', 'background_width', 'background_height', 'background_time_update', 'background_url'],
  hall: ['id', 'name', 'address', 'cplace', 'show_place', 'width', 'height', 'archive', 'background_width', 'background_height', 'background_time_update', 'background_url'],
  place_stool: ['id', 'width', 'height', 'type', 'rotate'],
  place: ['id', 'hall_id', 'stool_id', 'x', 'y', 'block', 'series', 'place', 'disabled'],
  place_obj: ['id', 'hall_id', 'x', 'y', 'width', 'height', 'type', 'param', 'in_front'],
};

class TempHallDb {
  constructor() {
    // Временная БД нужна только для отрисовки фона: заливка/рамка зала, объекты, стулья и места.
    // halls используется только как в qt.local/qt_hall: размеры и show_place,
    // без названия/адреса и без обращения к серверу за фоном.
    this.tables = { halls: [], place_stool: [], place: [], place_obj: [] };
    this.nextIds = { halls: 1, place_stool: 1, place: 1, place_obj: 1 };
    this.placeholderIds = new Map();
    this.warnings = [];
  }

  normalizeTable(table) {
    const t = String(table || '').replace(/`/g, '').toLowerCase();
    return t === 'hall' ? 'halls' : t;
  }

  defaultColumns(table) {
    return QT_DEFAULT_SQL_COLUMNS[this.normalizeTable(table)] || [];
  }

  insert(tableName, record = {}, meta = {}) {
    const table = this.normalizeTable(tableName);
    if (!this.tables[table]) this.tables[table] = [];
    const row = { ...record };

    if (row.id === undefined) row.id = null;
    if (row.id === null || row.id === '' || /^NULL$/i.test(String(row.id))) {
      if (table === 'place_stool' && meta.marker) {
        row.id = `#${String(meta.marker).replace(/^#|#$/g, '')}#`;
      } else {
        row.id = this.nextIds[table] || (this.tables[table].length + 1);
      }
    }

    if (table === 'place_stool') {
      const clean = String(row.id).replace(/^#|#$/g, '');
      this.placeholderIds.set(clean, row.id);
      this.placeholderIds.set(`#${clean}#`, row.id);
      if (meta.marker) {
        this.placeholderIds.set(meta.marker, row.id);
        this.placeholderIds.set(`#${meta.marker}#`, row.id);
      }
    }

    this.tables[table].push(row);
    if (typeof row.id === 'number') this.nextIds[table] = Math.max(this.nextIds[table] || 1, row.id + 1);
    return row;
  }

  insertSqlRow(insert, row, rowIndex = 0) {
    const table = this.normalizeTable(insert.table);
    const columns = insert.columns && insert.columns.length ? insert.columns : this.defaultColumns(table);
    const record = {};
    columns.forEach((col, idx) => { record[String(col).replace(/[ `]/g, '').toLowerCase()] = row[idx]; });
    this.insert(table, record, { marker: insert.marker, rowIndex });
  }

  fillFromSql(sqlText) {
    const inserts = parseInsertStatements(sqlText);
    for (const insert of inserts) {
      insert.rows.forEach((row, rowIndex) => this.insertSqlRow(insert, row, rowIndex));
    }
    return this;
  }

  toHall() {
    const hall = makeEmptyHall();
    hall.tempDb = this;
    hall.warnings.push(...this.warnings);

    const hallRow = this.tables.halls[0] || null;
    if (hallRow) applyHallRowToHall(hallRow, hall);

    this.tables.place_stool.forEach((row, idx) => {
      const id = row.id ?? idx + 1;
      const width = n(row.width ?? row.w, 24);
      const height = n(row.height ?? row.h, width);
      const type = normalizeStoolType(row.type ?? 'circle');
      const rotate = n(row.rotate, 0);
      const stool = { id: String(id), width, height, type, rotate };
      registerStool(hall, [id, String(id), String(idx + 1), String(id).replace(/^#|#$/g, '')], stool);
    });

    this.tables.place.forEach(row => {
      const stoolIdRaw = row.stool_id ?? row.stool ?? row.place_stool_id ?? '1';
      const stoolId = String(stoolIdRaw);
      const resolvedId = this.placeholderIds.get(stoolId) || this.placeholderIds.get(stoolId.replace(/^#|#$/g, '')) || stoolId;
      const stool = hall.stools.get(String(resolvedId))
        || hall.stools.get(String(stoolId).replace(/^#|#$/g, ''))
        || hall.stools.get(String(stoolId))
        || hall.stools.get('1')
        || { width: 24, height: 24, type: 'circle', rotate: 0 };
      hall.places.push({
        x: n(row.x, 0),
        y: n(row.y, 0),
        width: n(stool.width, 24),
        height: n(stool.height, 24),
        stool,
        label: String(row.place ?? row.name ?? row.place_name ?? row.number ?? ''),
        series: String(row.series ?? ''),
        block: String(row.block ?? ''),
        disabled: n(row.disabled, 0) === 1,
      });
    });

    this.tables.place_obj.forEach(row => {
      hall.objects.push({
        x: n(row.x, 0),
        y: n(row.y, 0),
        width: Math.max(1, n(row.width, 10)),
        height: Math.max(1, n(row.height, 10)),
        type: n(row.type, 0),
        param: String(row.param ?? ''),
        inFront: n(row.in_front ?? row.inFront, 1),
      });
    });

    finishHallSize(hall);
    return hall;
  }
}

function normalizeStoolType(type) {
  const t = String(type ?? '').replace(/['"]/g, '').trim().toLowerCase();
  if (t === '0') return 'circle';
  if (t === '1') return 'rectangle';
  if (t.includes('rect')) return 'rectangle';
  return t || 'circle';
}

function parseSqlFile(text) {
  const tempDb = new TempHallDb();
  tempDb.fillFromSql(text);
  const hall = tempDb.toHall();
  hall.sourceKind = 'sql-temp-db';
  return hall;
}

function makeEmptyHall() {
  return {
    name: '',
    address: '',
    showPlace: 1,
    width: 0,
    height: 0,
    backgroundWidth: 0,
    backgroundHeight: 0,
    backgroundUrl: '',
    hasHallRow: false,
    stools: new Map(),
    places: [],
    objects: [],
    warnings: [],
  };
}

function finishHallSize(hall) {
  const maxX = Math.max(
    0,
    ...hall.places.map(p => p.x + p.width + 10),
    ...hall.objects.map(o => o.x + o.width + 10),
    hall.backgroundWidth || 0
  );
  const maxY = Math.max(
    0,
    ...hall.places.map(p => p.y + p.height + 10),
    ...hall.objects.map(o => o.y + o.height + 10),
    hall.backgroundHeight || 0
  );
  hall.width = Math.max(hall.width || 0, Math.ceil(maxX), 400);
  hall.height = Math.max(hall.height || 0, Math.ceil(maxY), 300);
  return hall;
}

function parseInsertStatements(sqlText) {
  const sql = stripSqlComments(sqlText);
  const inserts = [];
  const re = /INSERT\s+INTO\s+`?([\w]+)`?\s*(?:\(([^)]*)\))?\s*VALUES\s*/gi;
  let match;
  while ((match = re.exec(sql))) {
    const table = match[1];
    const columns = match[2] ? splitCsv(match[2]).map(c => c.replace(/[`\s]/g, '').toLowerCase()) : [];
    const start = re.lastIndex;
    const foundEnd = findStatementEnd(sql, start);
    const end = foundEnd < 0 ? sql.length : foundEnd;
    const values = sql.slice(start, end);
    const after = sql.slice(Math.min(end + 1, sql.length), Math.min(end + 160, sql.length));
    const markerMatch = after.match(/###\s*(new_[a-z0-9_]+)\s*###/i);
    inserts.push({ table, columns, rows: parseValuesTuples(values), marker: markerMatch ? markerMatch[1] : null });
    re.lastIndex = Math.min(end + 1, sql.length);
  }
  return inserts;
}

function stripSqlComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .replace(/^\s*#(?!new_[a-z0-9_]+#).*$/gim, '');
}

function findStatementEnd(text, start) {
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (quote) {
      if (ch === quote) {
        if (text[i + 1] === quote) { i++; continue; }
        if (prev !== '\\') quote = null;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === ';') {
      return i;
    }
  }
  return -1;
}

function splitCsv(text) {
  const result = [];
  let buffer = '';
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (quote) {
      buffer += ch;
      if (ch === quote) {
        if (text[i + 1] === quote) { buffer += text[++i]; continue; }
        if (prev !== '\\') quote = null;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      buffer += ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
      buffer += ch;
    } else if (ch === ')' || ch === ']') {
      depth--;
      buffer += ch;
    } else if (ch === ',' && depth === 0) {
      result.push(buffer.trim());
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  if (buffer.trim()) result.push(buffer.trim());
  return result;
}

function parseValuesTuples(values) {
  const tuples = [];
  let quote = null;
  let depth = 0;
  let buffer = '';
  for (let i = 0; i < values.length; i++) {
    const ch = values[i];
    const prev = values[i - 1];
    if (quote) {
      buffer += ch;
      if (ch === quote) {
        if (values[i + 1] === quote) { buffer += values[++i]; continue; }
        if (prev !== '\\') quote = null;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      buffer += ch;
    } else if (ch === '(') {
      if (depth > 0) buffer += ch;
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        tuples.push(splitCsv(buffer).map(parseSqlValue));
        buffer = '';
      } else {
        buffer += ch;
      }
    } else if (depth > 0) {
      buffer += ch;
    }
  }
  return tuples;
}

function parseSqlValue(value) {
  const raw = String(value).trim();
  if (/^null$/i.test(raw)) return null;

  // Плейсхолдеры генератора (#new_stool_id_2#, #new_hall_id#, $$$, @hall_id)
  // нельзя превращать в 0. Для координат вида 30+0 арифметика нужна,
  // но id стула должен остаться строкой, иначе все места получают первый тип стула.
  if (/^#new_[a-z0-9_]+#$/i.test(raw) || raw === '$$$' || /^@[a-z_][a-z0-9_]*$/i.test(raw)) {
    return raw;
  }

  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/''/g, "'")
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  }
  const exprValue = safeEvalNumericExpression(raw);
  if (exprValue !== null) return exprValue;
  return raw;
}

function safeEvalNumericExpression(raw) {
  let expr = String(raw).trim();
  if (!expr) return null;
  expr = expr.replace(/#new_[a-z0-9_]+#/gi, '0').replace(/\$\$\$/g, '0');
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;
  if (!/[0-9]/.test(expr)) return null;
  try {
    // Safe after the strict character whitelist above.
    const value = Function(`"use strict"; return (${expr});`)();
    return Number.isFinite(value) ? value : null;
  } catch (_) {
    return null;
  }
}

function mapRecord(columns, row) {
  const record = {};
  columns.forEach((col, idx) => { record[col.toLowerCase()] = row[idx]; });
  return record;
}

function pick(record, row, names, fallbackIndex = -1, fallback = null) {
  for (const name of names) {
    if (record[name] !== undefined) return record[name];
  }
  if (fallbackIndex >= 0 && row[fallbackIndex] !== undefined) return row[fallbackIndex];
  return fallback;
}

function parseHall(record, row, hall) {
  applyHallRowToHall(record, hall, row);
}

function applyHallRowToHall(record, hall, row = []) {
  const width = pick(record, row, ['width', 'w'], 5, 0);
  const height = pick(record, row, ['height', 'h'], 6, 0);
  hall.width = Math.max(hall.width, n(width));
  hall.height = Math.max(hall.height, n(height));
  hall.name = String(pick(record, row, ['name'], 1, hall.name || '') ?? '');
  hall.address = String(pick(record, row, ['address'], 2, hall.address || '') ?? '');
  hall.showPlace = n(pick(record, row, ['show_place'], 4, hall.showPlace), 1);
  hall.backgroundWidth = Math.max(hall.backgroundWidth || 0, n(pick(record, row, ['background_width', 'backgroundwidth'], 8, 0), 0));
  hall.backgroundHeight = Math.max(hall.backgroundHeight || 0, n(pick(record, row, ['background_height', 'backgroundheight'], 9, 0), 0));
  const backgroundUrl = pick(record, row, ['background_url', 'backgroundurl', 'background', 'background_src', 'backgroundsrc'], 11, '');
  if (backgroundUrl && !/^NULL$/i.test(String(backgroundUrl))) hall.backgroundUrl = String(backgroundUrl);
  hall.hasHallRow = true;
}

function registerStool(hall, keys, stool) {
  for (const key of keys) {
    if (key !== null && key !== undefined && String(key) !== '') hall.stools.set(String(key), stool);
  }
}

function parseStool(record, row, hall, insert, rowIndex) {
  const marker = insert.marker;
  const rawId = pick(record, row, ['id'], 0, null);
  const generatedId = rawId === null ? `#${marker || `new_stool_id_${hall.stools.size + 1}`}#` : rawId;
  const width = n(pick(record, row, ['width', 'w'], 1, 24), 24);
  const height = n(pick(record, row, ['height', 'h'], 2, width), width);
  const type = String(pick(record, row, ['type'], 3, 'circle') || 'circle').replace(/['"]/g, '');
  const rotate = n(pick(record, row, ['rotate'], 4, 0));
  const stool = { id: String(generatedId), width, height, type, rotate };
  const keys = [generatedId, rawId, String(hall.stools.size + 1), marker, marker ? `#${marker}#` : null, rowIndex + 1];
  registerStool(hall, keys, stool);
}

function parsePlace(record, row, hall) {
  const x = n(pick(record, row, ['x'], 3, 0));
  const y = n(pick(record, row, ['y'], 4, 0));
  const stoolId = String(pick(record, row, ['stool_id', 'stool', 'place_stool_id'], 2, '1'));
  const stool = hall.stools.get(stoolId)
    || hall.stools.get(stoolId.replace(/^#|#$/g, ''))
    || hall.stools.get(`#${stoolId.replace(/^#|#$/g, '')}#`)
    || hall.stools.get('1')
    || { width: 24, height: 24, type: 'circle', rotate: 0 };
  const block = String(pick(record, row, ['block'], 5, '') ?? '');
  const series = String(pick(record, row, ['series'], 6, '') ?? '');
  const label = String(pick(record, row, ['place', 'name', 'place_name', 'number'], 7, '') ?? '');
  const disabled = n(pick(record, row, ['disabled'], 8, 0)) === 1;
  hall.places.push({ x, y, width: n(stool.width, 24), height: n(stool.height, 24), stool, label, series, block, disabled });
}

function parseObject(record, row, hall) {
  const x = n(pick(record, row, ['x'], 2, 0));
  const y = n(pick(record, row, ['y'], 3, 0));
  const width = n(pick(record, row, ['width'], 4, 10), 10);
  const height = n(pick(record, row, ['height'], 5, 10), 10);
  const type = n(pick(record, row, ['type'], 6, 0));
  const param = String(pick(record, row, ['param'], 7, '') ?? '');
  const inFront = n(pick(record, row, ['in_front'], 8, 1));
  hall.objects.push({ x, y, width, height, type, param, inFront });
}

function renderHallLayerMarkup(hall, style, innerHtml) {
  const styleClass = style === 'view_old' ? 'qt-style-old' : 'qt-style-view';
  const contentClass = style === 'view_old' ? 'qt-hall-content hall qt-old-hall-content' : 'qt-hall-content hall qt-view-hall-content';
  return `<foreignObject x="0" y="0" width="${fmt(hall.width)}" height="${fmt(hall.height)}">
    <div xmlns="http://www.w3.org/1999/xhtml" class="qt-hall-html ${styleClass}" style="width:${fmt(hall.width)}px;height:${fmt(hall.height)}px;">
      <div class="${contentClass}" style="width:${fmt(hall.width)}px;height:${fmt(hall.height)}px;">
        ${innerHtml}
      </div>
    </div>
  </foreignObject>`;
}

function renderHallBackgroundMarkup(hall, style) {
  // view: копируем структуру hall.qt.local: #hallBackground с картинкой + #hallBorder.
  // view_old: копируем старую страницу qt.local: .hall с dashed-рамкой, фон белый.
  const width = Math.max(1, hall.width || hall.backgroundWidth || 1);
  const height = Math.max(1, hall.height || hall.backgroundHeight || 1);
  const bgWidth = Math.max(1, hall.backgroundWidth || width);
  const bgHeight = Math.max(1, hall.backgroundHeight || height);
  const img = hall.backgroundUrl
    ? `<div id="hallBackground" class="qt-hall-background"><img src="${escapeXml(hall.backgroundUrl)}" alt="" style="width:${fmt(bgWidth)}px;height:${fmt(bgHeight)}px;" /></div>`
    : '';
  const fill = `<div class="qt-hall-fill" style="width:${fmt(width)}px;height:${fmt(height)}px;"></div>`;
  const border = style === 'view_old'
    ? `<div class="qt-old-hall-border" style="width:${fmt(width)}px;height:${fmt(height)}px;"></div>`
    : `<div id="hallBorder" class="qt-view-hall-border" style="width:${fmt(width + 2)}px;height:${fmt(height + 2)}px;left:-1px;top:-1px;"></div>`;
  return renderHallLayerMarkup(hall, style, `${fill}${img}${border}`);
}

function renderHallObjectsMarkup(hall, style) {
  // Фон строится только из place_obj. Все объекты рисуются ниже редактора,
  // даже если в исходном SQL у них in_front=1: helper должен быть между
  // place_obj и place.
  const objects = hall.objects.map(o => renderHallObjectHtml(o, style)).join('');
  return renderHallLayerMarkup(hall, style, objects);
}

function renderHallPlacesMarkup(hall, style) {
  // Места всегда рисуются поверх редактора, чтобы объект можно было подгонять
  // относительно фактической схемы мест.
  const places = hall.places.map(p => style === 'view_old' ? renderOldPlaceHtml(p, hall) : renderViewPlaceHtml(p, hall)).join('');
  return renderHallLayerMarkup(hall, style, places);
}

function renderOldPlaceHtml(p, hall) {
  const h = p.stool.type === 'circle' ? Math.round(p.width / 2) : 0;
  const w = p.stool.type === 'circle' ? Math.round(p.height / 2) : 0;
  const h2 = p.stool.type === 'circle' ? Math.round(h / 2) : 0;
  const style = [
    `left:${fmt(p.x)}px`,
    `top:${fmt(p.y)}px`,
    `width:${fmt(p.width)}px`,
    `height:${fmt(p.height)}px`,
    p.stool.type === 'circle' ? `-moz-border-radius:${fmt(w)}px/${fmt(h)}px` : '',
    p.stool.type === 'circle' ? `-webkit-border-radius:${fmt(w)}px/${fmt(h)}px` : '',
    p.stool.type === 'circle' ? `border-radius:${fmt(w)}px/${fmt(h)}px` : '',
    p.stool.rotate ? `transform:rotate(${fmt(p.stool.rotate)}deg)` : '',
    p.stool.rotate ? `-ms-transform:rotate(${fmt(p.stool.rotate)}deg)` : '',
    p.stool.rotate ? `-webkit-transform:rotate(${fmt(p.stool.rotate)}deg)` : ''
  ].filter(Boolean).join(';');
  const cls = `r ${p.disabled ? 'disabled' : 'c0'}`;
  const label = hall.showPlace ? escapeXml(p.label || '') : '';
  return `<div class="${cls}" style="${style}"><div class="n" style="height:${fmt(Math.floor((p.height / 2) - 1 - h2))}px;">${label}</div><div class="p"></div></div>`;
}

function renderViewPlaceHtml(p) {
  const width = Math.max(1, p.width);
  const height = Math.max(1, p.height);
  const borderWidth = 1;
  const textFontSize = 10;
  const fontSize = height * 0.5;
  const style = [
    `left:${fmt(p.x)}px`,
    `top:${fmt(p.y)}px`,
    `width:${fmt(width)}px`,
    `height:${fmt(height)}px`,
    `border-width:${fmt(borderWidth)}px`,
    `font-size:${fmt(fontSize)}px`,
    `line-height:${fmt(height - borderWidth * 2)}px`,
    'border-style:solid',
    p.stool.rotate ? `transform:rotate(${fmt(p.stool.rotate)}deg)` : ''
  ].filter(Boolean).join(';');
  const shape = p.stool.type === 'rectangle' ? 'rectangle' : 'circle';
  const status = p.disabled ? 'disabled not_hovered' : 'free color0';
  const cls = `hallPlace qt_organisation hall prices_none ${status} ${shape}`;
  if (p.disabled) {
    return `<div class="${cls}" style="${style}"><span class="qt-place-ban">×</span></div>`;
  }
  const label = escapeXml(p.label || '-');
  const textStyle = [
    `width:${fmt(width - borderWidth * 2)}px`,
    `height:${fmt(height - borderWidth * 2)}px`,
    'left:0px',
    'top:0px',
    `font-size:${fmt(textFontSize)}px`,
    `line-height:${fmt(height - borderWidth * 2)}px`
  ].join(';');
  return `<div class="${cls}" style="${style}"><div class="place_text place_text--single" style="${textStyle}">${label}</div></div>`;
}

function renderHallObjectHtml(o, style = 'view') {
  if (!o.param || String(o.param).toLowerCase() === 'null') return '';
  const common = `left:${fmt(o.x)}px;top:${fmt(o.y)}px;width:${fmt(Math.max(o.width, 1))}px;height:${fmt(Math.max(o.height, 1))}px;`;
  const cls = style === 'view_old' ? 'o' : 'hallBlock qt-hall-object';
  if (Number(o.type) === 1) {
    return `<div class="${cls}" style="${common}"><img src="${escapeXml(o.param)}" style="display:block;max-width:100%;max-height:100%;" /></div>`;
  }
  return `<div class="${cls}" style="${common}">${o.param}</div>`;
}

function loadHallSqlFromTextarea({ fit = true } = {}) {
  const sqlText = els.hallSqlInput ? els.hallSqlInput.value.trim() : '';
  if (!sqlText) {
    state.hall = null;
    els.hallStatus.textContent = 'нет зала';
    render();
    schedulePersistState();
    return;
  }

  try {
    state.hall = parseSqlFile(sqlText);
    state.hall.sourceName = 'SQL из textarea';
    const counts = [
      `${state.hall.places.length} мест`,
      `${state.hall.objects.length} объектов`,
    ].join(', ');
    els.hallStatus.textContent = counts;
    if (state.hall.warnings && state.hall.warnings.length) {
      console.warn(state.hall.warnings.join('\n'));
    }
    if (fit) fitToHall();
    render();
    schedulePersistState();
  } catch (error) {
    state.hall = null;
    els.hallStatus.textContent = 'ошибка SQL';
    console.error(error);
    render();
    schedulePersistState();
  }
}

function fitToHall() {
  const width = state.hall ? state.hall.width : Math.max(state.object.width + state.object.x + 60, 600);
  const height = state.hall ? state.hall.height : Math.max(state.object.height + state.object.y + 60, 400);
  const pad = 40;
  setViewBox({ x: -pad, y: -pad, w: width + pad * 2, h: height + pad * 2 });
}

function copyText(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function zoom(factor, center) {
  const c = center || { x: state.viewBox.x + state.viewBox.w / 2, y: state.viewBox.y + state.viewBox.h / 2 };
  const nextW = state.viewBox.w * factor;
  const nextH = state.viewBox.h * factor;
  setViewBox({
    x: c.x - (c.x - state.viewBox.x) * factor,
    y: c.y - (c.y - state.viewBox.y) * factor,
    w: nextW,
    h: nextH,
  });
  renderObject();
  schedulePersistState();
}

for (const input of [els.objX, els.objY, els.objWidth, els.objHeight, els.strokeColor, els.strokeWidth, els.fillColor, els.pathInput]) {
  input.addEventListener('input', renderAndSaveHistory);
  input.addEventListener('change', renderAndSaveHistory);
}
if (els.snapToPixel) els.snapToPixel.addEventListener('change', schedulePersistState);
els.hallStyle.addEventListener('change', () => { renderHall(); schedulePersistState(); });
if (els.sqlMode) els.sqlMode.addEventListener('change', () => { updateSqlModeUi(); updateSql(); schedulePersistState(); });
if (els.insertHallId) els.insertHallId.addEventListener('input', () => { updateSql(); schedulePersistState(); });

document.getElementById('fitHall').addEventListener('click', fitToHall);
document.getElementById('renderHallSql').addEventListener('click', () => loadHallSqlFromTextarea({ fit: true }));
document.getElementById('clearHallSql').addEventListener('click', () => { if (els.hallSqlInput) els.hallSqlInput.value = ''; state.hall = null; els.hallStatus.textContent = 'нет зала'; render(); schedulePersistState(); });
document.getElementById('fitObjectToPath').addEventListener('click', fitObjectToPath);
if (els.applyScale) els.applyScale.addEventListener('click', applyScale);
if (els.applyTranslate) els.applyTranslate.addEventListener('click', applyTranslate);
if (els.applyRotate) els.applyRotate.addEventListener('click', applyRotate);
if (els.openObjectImportModal) els.openObjectImportModal.addEventListener('click', openObjectImportModal);
if (els.closeObjectImportModal) els.closeObjectImportModal.addEventListener('click', closeObjectImportModal);
if (els.cancelObjectImportModal) els.cancelObjectImportModal.addEventListener('click', closeObjectImportModal);
if (els.objectImportModal) els.objectImportModal.addEventListener('click', (event) => { if (event.target?.hasAttribute?.('data-close-object-import')) closeObjectImportModal(); });
document.getElementById('loadObjectFromText').addEventListener('click', loadObjectFromText);
document.getElementById('insertCommandAfter').addEventListener('click', insertCommandAfterSelected);
document.getElementById('replaceCommand').addEventListener('click', replaceSelectedCommandType);
document.getElementById('deleteCommand').addEventListener('click', deleteSelectedCommand);
if (els.copySql) els.copySql.addEventListener('click', () => copyText(els.sqlOutput.value));
document.getElementById('copyPhp').addEventListener('click', () => copyText(els.phpOutput.value));
document.getElementById('zoomIn').addEventListener('click', () => zoom(0.85));
document.getElementById('zoomOut').addEventListener('click', () => zoom(1.15));
document.getElementById('zoomFit').addEventListener('click', fitToHall);
if (els.previewToggle) els.previewToggle.addEventListener('click', () => { state.previewMode = !state.previewMode; renderObject(); schedulePersistState(); });

els.svg.addEventListener('mousedown', event => {
  if (event.button !== 0 || state.drag) return;
  state.pan = { start: screenToSvg(event), box: { ...state.viewBox } };
  els.svg.classList.add('dragging');
});

window.addEventListener('mousemove', event => {
  const pt = screenToSvg(event);
  els.coords.textContent = `${fmt(pt.x, 1)}, ${fmt(pt.y, 1)}`;
  if (state.drag) {
    readInputs();
    const visualLocal = { x: pt.x - state.object.x, y: pt.y - state.object.y };
    const rawLocal = fromGeneratedShapePoint(visualLocal);
    let localX = rawLocal.x;
    let localY = rawLocal.y;
    if (els.snapToPixel.checked) {
      localX = roundToStep(localX, 0.5);
      localY = roundToStep(localY, 0.5);
    }
    updatePathCommandPoint(state.drag.point, localX, localY);
    state.dragDirty = true;
    render();
  } else if (state.pan) {
    const panPoint = screenToSvg(event, state.pan.box);
    const dx = state.pan.start.x - panPoint.x;
    const dy = state.pan.start.y - panPoint.y;
    setViewBox({ ...state.pan.box, x: state.pan.box.x + dx, y: state.pan.box.y + dy });
    renderObject();
  }
});

window.addEventListener('mouseup', () => {
  const shouldSave = state.dragDirty;
  state.drag = null;
  state.dragDirty = false;
  state.pan = null;
  els.svg.classList.remove('dragging');
  if (shouldSave) {
    pushHistory();
    schedulePersistState();
  }
});

els.svg.addEventListener('wheel', event => {
  event.preventDefault();
  zoom(Math.pow(1.0015, event.deltaY), screenToSvg(event));
}, { passive: false });

function isUndoShortcut(event) {
  const key = String(event.key || '').toLowerCase();
  // event.code stays KeyZ/KeyY even when the keyboard layout is Russian,
  // where event.key may be "я"/"н". Use both so Ctrl+Z works in textareas
  // and with non-latin layouts.
  return (event.ctrlKey || event.metaKey) && !event.altKey && (key === 'z' || key === 'я' || event.code === 'KeyZ');
}

function isRedoShortcut(event) {
  const key = String(event.key || '').toLowerCase();
  return (event.ctrlKey || event.metaKey) && !event.altKey && (
    ((key === 'z' || key === 'я' || event.code === 'KeyZ') && event.shiftKey) ||
    key === 'y' ||
    key === 'н' ||
    event.code === 'KeyY'
  );
}

function handleGlobalKeyDown(event) {
  if (isRedoShortcut(event)) {
    event.preventDefault();
    event.stopPropagation();
    redo();
    return;
  }

  if (isUndoShortcut(event)) {
    event.preventDefault();
    event.stopPropagation();
    undo();
    return;
  }

  if (event.key === 'Escape') closeObjectImportModal();
}

// Capture phase is intentional: focused textarea/input can otherwise run its native
// undo before the application history gets the shortcut.
document.addEventListener('keydown', handleGlobalKeyDown, true);

function refreshViewportAfterResize() {
  setViewBox(state.viewBox);
  renderObject();
}

window.addEventListener('resize', refreshViewportAfterResize);
if (window.ResizeObserver && els.canvasWrap) {
  const canvasResizeObserver = new ResizeObserver(refreshViewportAfterResize);
  canvasResizeObserver.observe(els.canvasWrap);
}

populateCommandTypeSelects();
restoreStateFromStorage();
writeInputs();
updateSqlModeUi();
if (els.hallSqlInput && els.hallSqlInput.value.trim()) {
  loadHallSqlFromTextarea({ fit: false });
}
setViewBox(state.viewBox);
render();
pushHistory();
state.persistenceReady = true;
persistStateNow();
