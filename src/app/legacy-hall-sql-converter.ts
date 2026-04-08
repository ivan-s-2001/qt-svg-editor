const HALL_ID_SQL_VAR = '@hall_id';

type CornerRadius = {
  x: number;
  y: number;
};

type RadiusMap = {
  tl: CornerRadius;
  tr: CornerRadius;
  br: CornerRadius;
  bl: CornerRadius;
};

type BorderSide = {
  width: number;
  style: string;
  color: string;
};

type BorderMap = {
  top: BorderSide;
  right: BorderSide;
  bottom: BorderSide;
  left: BorderSide;
};

type ParsedDivParam = {
  attrs: string;
  style: string;
  innerHtml: string;
};

export function convertPlaceObjInsertSqlToUpdates(sql: string, hallIdValue: string): string {
  const hallIdSqlValue = normalizeHallIdSqlValue(hallIdValue);
  const blocks = extractPlaceObjInsertBlocks(sql || '');

  const out: string[] = [];
  out.push(`SET ${HALL_ID_SQL_VAR} = ${hallIdSqlValue};`);
  out.push('');

  for (const block of blocks) {
    const tuples = splitSqlTuples(block);

    for (const tuple of tuples) {
      const fields = splitTopLevelCsv(tuple.trim().replace(/^\(/, '').replace(/\)$/, '').trim());

      if (fields.length < 9) {
        continue;
      }

      const [_id, _hallId, x, y, width, height, type, param, inFront] = fields;

      const widthValue = parseInt(width.trim(), 10) || 0;
      const heightValue = parseInt(height.trim(), 10) || 0;

      const paramValue = sqlUnquote(param.trim());
      const newParam = convertParamToSvgParam(paramValue, widthValue, heightValue);

      out.push(
        "UPDATE `place_obj`\n" +
        `SET \`param\` = ${sqlQuote(newParam)}\n` +
        `WHERE \`hall_id\` = ${HALL_ID_SQL_VAR}\n` +
        `  AND \`x\` = ${x.trim()}\n` +
        `  AND \`y\` = ${y.trim()}\n` +
        `  AND \`width\` = ${width.trim()}\n` +
        `  AND \`height\` = ${height.trim()}\n` +
        `  AND \`type\` = ${type.trim()}\n` +
        `  AND \`in_front\` = ${inFront.trim()}\n` +
        "LIMIT 1;"
      );
      out.push('');
    }
  }

  return out.join('\n').trim();
}

function normalizeHallIdSqlValue(value: string): string {
  const trimmed = (value || '').trim();
  return /^\d+$/.test(trimmed) ? trimmed : '#new_hall_id#';
}

/* =========================
 * Главная логика param
 * ========================= */

function convertParamToSvgParam(param: string, width: number, height: number): string {
  if (param.toLowerCase().includes('<svg')) {
    return param;
  }

  const parsed = parseSingleDivParam(param);

  if (!parsed) {
    return param;
  }

  const styleMap = parseStyleMap(parsed.style);
  const innerHtml = parsed.innerHtml;

  const hasText = innerHtml.replace(/<[^>]*>/g, '').trim() !== '';
  const hasFigure = hasFigureStyles(styleMap);

  if (!hasFigure && hasText) {
    return param;
  }

  if (!hasFigure && !hasText) {
    return buildWrapperOnly(width, height);
  }

  const svg = buildSvgFromStyles(styleMap, width, height);

  if (!hasText) {
    return buildWrapper(width, height, svg, '');
  }

  const textStyle = buildOverlayTextStyle(styleMap);
  const textDiv = `<div style="${escapeHtmlAttr(textStyle)}">${innerHtml}</div>`;

  return buildWrapper(width, height, svg, textDiv);
}

/* =========================
 * Сборка HTML
 * ========================= */

function buildWrapper(width: number, height: number, svg: string, innerHtml: string): string {
  return `<div style="
    position:absolute;
    width:${width}px;
    height:${height}px;
    box-sizing:border-box;
  " generated_object>
    ${svg}${innerHtml !== '' ? `\n    ${innerHtml}` : ''}
  </div>`;
}

function buildWrapperOnly(width: number, height: number): string {
  return `<div style="
    position:absolute;
    width:${width}px;
    height:${height}px;
    box-sizing:border-box;
  " generated_object></div>`;
}

function buildSvgFromStyles(styleMap: Record<string, string>, width: number, height: number): string {
  const fill = (styleMap['background-color'] || 'none').trim();
  const borders = parseBorders(styleMap);
  const radius = parseBorderRadius(
    styleMap['border-radius']
      ?? styleMap['-webkit-border-radius']
      ?? styleMap['-moz-border-radius']
      ?? styleMap['-ms-border-radius']
      ?? '',
    width,
    height
  );

  const fillPathD = roundedRectPath(0, 0, width, height, radius);
  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;" xmlns="http://www.w3.org/2000/svg">`);

  if (fill !== '' && fill.toLowerCase() !== 'transparent' && fill.toLowerCase() !== 'none') {
    parts.push(`      <path d="${fillPathD}" fill="${escapeHtmlAttr(fill)}" stroke="none" />`);
  }

  if (allBordersEqual(borders) && borders.top.width > 0 && borders.top.style.toLowerCase() !== 'none') {
    const bw = borders.top.width;
    const bc = borders.top.color;
    const borderRadius = insetRadius(radius, bw / 2);
    const borderPathD = roundedRectPath(bw / 2, bw / 2, width - bw, height - bw, borderRadius);
    parts.push(`      <path d="${borderPathD}" fill="none" stroke="${escapeHtmlAttr(bc)}" stroke-width="${trimFloat(bw)}" />`);
  } else {
    parts.push(...buildPerSideBorderSvg(borders, width, height, radius));
  }

  parts.push('    </svg>');
  return parts.join('\n');
}

function buildOverlayTextStyle(styleMap: Record<string, string>): string {
  const keep = [
    'line-height',
    'text-align',
    'font-size',
    'font-weight',
    'font-family',
    'font-style',
    'color',
    'letter-spacing',
    'white-space',
    'text-transform',
    'text-decoration',
    'padding',
    'padding-left',
    'padding-right',
    'padding-top',
    'padding-bottom',
    'display',
    'align-items',
    'justify-content',
  ];

  const style = [
    'position:absolute',
    'left:0',
    'top:0',
    'width:100%',
    'height:100%',
    'box-sizing:border-box',
  ];

  for (const key of keep) {
    if (styleMap[key] && styleMap[key].trim() !== '') {
      style.push(`${key}:${styleMap[key].trim()}`);
    }
  }

  return `${style.join(';')};`;
}

/* =========================
 * SVG border helpers
 * ========================= */

function buildPerSideBorderSvg(borders: BorderMap, width: number, height: number, radius: RadiusMap): string[] {
  const svg: string[] = [];
  const { tl, tr, br, bl } = radius;

  if (borders.top.width > 0 && borders.top.style.toLowerCase() !== 'none') {
    const y = borders.top.width / 2;
    svg.push(`      <path d="M ${trimFloat(tl.x)} ${trimFloat(y)} L ${trimFloat(width - tr.x)} ${trimFloat(y)}" fill="none" stroke="${escapeHtmlAttr(borders.top.color)}" stroke-width="${trimFloat(borders.top.width)}" />`);
  }

  if (borders.right.width > 0 && borders.right.style.toLowerCase() !== 'none') {
    const x = width - (borders.right.width / 2);
    svg.push(`      <path d="M ${trimFloat(x)} ${trimFloat(tr.y)} L ${trimFloat(x)} ${trimFloat(height - br.y)}" fill="none" stroke="${escapeHtmlAttr(borders.right.color)}" stroke-width="${trimFloat(borders.right.width)}" />`);
  }

  if (borders.bottom.width > 0 && borders.bottom.style.toLowerCase() !== 'none') {
    const y = height - (borders.bottom.width / 2);
    svg.push(`      <path d="M ${trimFloat(bl.x)} ${trimFloat(y)} L ${trimFloat(width - br.x)} ${trimFloat(y)}" fill="none" stroke="${escapeHtmlAttr(borders.bottom.color)}" stroke-width="${trimFloat(borders.bottom.width)}" />`);
  }

  if (borders.left.width > 0 && borders.left.style.toLowerCase() !== 'none') {
    const x = borders.left.width / 2;
    svg.push(`      <path d="M ${trimFloat(x)} ${trimFloat(tl.y)} L ${trimFloat(x)} ${trimFloat(height - bl.y)}" fill="none" stroke="${escapeHtmlAttr(borders.left.color)}" stroke-width="${trimFloat(borders.left.width)}" />`);
  }

  return svg;
}

function allBordersEqual(borders: BorderMap): boolean {
  const t = borders.top;
  return compareBorderSides(t, borders.right)
    && compareBorderSides(t, borders.bottom)
    && compareBorderSides(t, borders.left);
}

function compareBorderSides(a: BorderSide, b: BorderSide): boolean {
  return a.width === b.width && a.style === b.style && a.color === b.color;
}

function insetRadius(radius: RadiusMap, inset: number): RadiusMap {
  return {
    tl: { x: Math.max(0, radius.tl.x - inset), y: Math.max(0, radius.tl.y - inset) },
    tr: { x: Math.max(0, radius.tr.x - inset), y: Math.max(0, radius.tr.y - inset) },
    br: { x: Math.max(0, radius.br.x - inset), y: Math.max(0, radius.br.y - inset) },
    bl: { x: Math.max(0, radius.bl.x - inset), y: Math.max(0, radius.bl.y - inset) },
  };
}

function roundedRectPath(x: number, y: number, w: number, h: number, radius: RadiusMap): string {
  const r = normalizeCornerRadii(radius, w, h);
  const { tl, tr, br, bl } = r;
  const x2 = x + w;
  const y2 = y + h;

  const d: string[] = [];
  d.push(`M ${trimFloat(x + tl.x)} ${trimFloat(y)}`);
  d.push(`L ${trimFloat(x2 - tr.x)} ${trimFloat(y)}`);

  if (tr.x > 0 || tr.y > 0) {
    d.push(`A ${trimFloat(tr.x)} ${trimFloat(tr.y)} 0 0 1 ${trimFloat(x2)} ${trimFloat(y + tr.y)}`);
  }

  d.push(`L ${trimFloat(x2)} ${trimFloat(y2 - br.y)}`);

  if (br.x > 0 || br.y > 0) {
    d.push(`A ${trimFloat(br.x)} ${trimFloat(br.y)} 0 0 1 ${trimFloat(x2 - br.x)} ${trimFloat(y2)}`);
  }

  d.push(`L ${trimFloat(x + bl.x)} ${trimFloat(y2)}`);

  if (bl.x > 0 || bl.y > 0) {
    d.push(`A ${trimFloat(bl.x)} ${trimFloat(bl.y)} 0 0 1 ${trimFloat(x)} ${trimFloat(y2 - bl.y)}`);
  }

  d.push(`L ${trimFloat(x)} ${trimFloat(y + tl.y)}`);

  if (tl.x > 0 || tl.y > 0) {
    d.push(`A ${trimFloat(tl.x)} ${trimFloat(tl.y)} 0 0 1 ${trimFloat(x + tl.x)} ${trimFloat(y)}`);
  }

  d.push('Z');
  return d.join(' ');
}

function normalizeCornerRadii(radius: RadiusMap, w: number, h: number): RadiusMap {
  const result: RadiusMap = {
    tl: { x: Math.max(0, Math.min(radius.tl.x, w)), y: Math.max(0, Math.min(radius.tl.y, h)) },
    tr: { x: Math.max(0, Math.min(radius.tr.x, w)), y: Math.max(0, Math.min(radius.tr.y, h)) },
    br: { x: Math.max(0, Math.min(radius.br.x, w)), y: Math.max(0, Math.min(radius.br.y, h)) },
    bl: { x: Math.max(0, Math.min(radius.bl.x, w)), y: Math.max(0, Math.min(radius.bl.y, h)) },
  };

  const topSum = result.tl.x + result.tr.x;
  const bottomSum = result.bl.x + result.br.x;
  const leftSum = result.tl.y + result.bl.y;
  const rightSum = result.tr.y + result.br.y;

  if (topSum > w && topSum > 0) {
    const scale = w / topSum;
    result.tl.x *= scale;
    result.tr.x *= scale;
  }

  if (bottomSum > w && bottomSum > 0) {
    const scale = w / bottomSum;
    result.bl.x *= scale;
    result.br.x *= scale;
  }

  if (leftSum > h && leftSum > 0) {
    const scale = h / leftSum;
    result.tl.y *= scale;
    result.bl.y *= scale;
  }

  if (rightSum > h && rightSum > 0) {
    const scale = h / rightSum;
    result.tr.y *= scale;
    result.br.y *= scale;
  }

  return result;
}

/* =========================
 * Border / radius parsing
 * ========================= */

function hasFigureStyles(styleMap: Record<string, string>): boolean {
  if (styleMap['background-color'] && styleMap['background-color'].trim().toLowerCase() !== 'transparent') {
    return true;
  }

  for (const key of Object.keys(styleMap)) {
    if (
      key === 'border' ||
      key.startsWith('border-') ||
      key.includes('border-radius') ||
      key.includes('-webkit-border-radius') ||
      key.includes('-moz-border-radius') ||
      key.includes('-ms-border-radius')
    ) {
      return true;
    }
  }

  return false;
}

function parseBorders(styleMap: Record<string, string>): BorderMap {
  const defaultBorder: BorderSide = {
    width: 0,
    style: 'none',
    color: '#000000',
  };

  const borders: BorderMap = {
    top: { ...defaultBorder },
    right: { ...defaultBorder },
    bottom: { ...defaultBorder },
    left: { ...defaultBorder },
  };

  if (styleMap['border']) {
    const parsed = parseBorderShorthand(styleMap['border']);
    borders.top = { ...parsed };
    borders.right = { ...parsed };
    borders.bottom = { ...parsed };
    borders.left = { ...parsed };
  }

  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const key = `border-${side}`;
    if (styleMap[key]) {
      borders[side] = parseBorderShorthand(styleMap[key]);
    }

    const widthKey = `border-${side}-width`;
    const styleKey = `border-${side}-style`;
    const colorKey = `border-${side}-color`;

    if (styleMap[widthKey]) {
      borders[side].width = cssLengthToPx(styleMap[widthKey], 0);
    }
    if (styleMap[styleKey]) {
      borders[side].style = styleMap[styleKey].trim();
    }
    if (styleMap[colorKey]) {
      borders[side].color = styleMap[colorKey].trim();
    }
  }

  return borders;
}

function parseBorderShorthand(value: string): BorderSide {
  const result: BorderSide = {
    width: 0,
    style: 'solid',
    color: '#000000',
  };

  for (const token of value.trim().split(/\s+/)) {
    const part = token.trim();
    if (!part) {
      continue;
    }

    if (/^[\d.]+px$/i.test(part)) {
      result.width = parseFloat(part);
      continue;
    }

    if (['none', 'solid', 'dashed', 'dotted', 'double'].includes(part.toLowerCase())) {
      result.style = part.toLowerCase();
      continue;
    }

    result.color = part;
  }

  return result;
}

function parseBorderRadius(value: string, width: number, height: number): RadiusMap {
  const zero: RadiusMap = {
    tl: { x: 0, y: 0 },
    tr: { x: 0, y: 0 },
    br: { x: 0, y: 0 },
    bl: { x: 0, y: 0 },
  };

  const normalized = value.trim();
  if (!normalized) {
    return zero;
  }

  const parts = normalized.split('/', 2);
  const hPart = parts[0].trim();
  const vPart = (parts[1] ?? parts[0]).trim();

  const h = expandRadiusValues(hPart, width);
  const v = expandRadiusValues(vPart, height);

  return {
    tl: { x: h[0], y: v[0] },
    tr: { x: h[1], y: v[1] },
    br: { x: h[2], y: v[2] },
    bl: { x: h[3], y: v[3] },
  };
}

function expandRadiusValues(value: string, base: number): number[] {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  const values = tokens.map((item) => cssLengthToPx(item, base));

  if (values.length === 1) {
    return [values[0], values[0], values[0], values[0]];
  }
  if (values.length === 2) {
    return [values[0], values[1], values[0], values[1]];
  }
  if (values.length === 3) {
    return [values[0], values[1], values[2], values[1]];
  }
  if (values.length >= 4) {
    return [values[0], values[1], values[2], values[3]];
  }

  return [0, 0, 0, 0];
}

function cssLengthToPx(value: string, base: number): number {
  const normalized = value.trim();

  const percentMatch = normalized.match(/^([\d.]+)%$/);
  if (percentMatch) {
    return (base * parseFloat(percentMatch[1])) / 100;
  }

  const pxMatch = normalized.match(/^([\d.]+)px$/i);
  if (pxMatch) {
    return parseFloat(pxMatch[1]);
  }

  if (/^[\d.]+$/.test(normalized)) {
    return parseFloat(normalized);
  }

  return 0;
}

/* =========================
 * Парсинг исходного HTML
 * ========================= */

function parseSingleDivParam(html: string): ParsedDivParam | null {
  const match = html.match(/^\s*<div\b([^>]*)>([\s\S]*)<\/div>\s*$/i);
  if (!match) {
    return null;
  }

  const attrs = match[1];
  const inner = match[2];
  let style = '';

  const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
  if (styleMatch) {
    style = styleMatch[1];
  }

  return {
    attrs,
    style,
    innerHtml: inner,
  };
}

function parseStyleMap(style: string): Record<string, string> {
  const map: Record<string, string> = {};
  const items = style.split(';');

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || !normalized.includes(':')) {
      continue;
    }

    const parts = normalized.split(':', 2);
    map[parts[0].trim().toLowerCase()] = parts[1].trim();
  }

  return map;
}

/* =========================
 * SQL parsing
 * ========================= */

function extractPlaceObjInsertBlocks(sql: string): string[] {
  const blocks: string[] = [];
  const len = sql.length;
  let offset = 0;

  while (offset < len) {
    const match = /insert\s+into\s+`?place_obj`?/ig;
    match.lastIndex = offset;
    const found = match.exec(sql);

    if (!found || found.index < 0) {
      break;
    }

    const insertPos = found.index;
    const valuesMatch = /values/ig;
    valuesMatch.lastIndex = insertPos;
    const valuesFound = valuesMatch.exec(sql);
    if (!valuesFound || valuesFound.index < 0) {
      break;
    }

    const start = valuesFound.index + valuesFound[0].length;
    const end = findSqlStatementEnd(sql, start);
    if (end === null) {
      break;
    }

    blocks.push(sql.slice(start, end).trim());
    offset = end + 1;
  }

  return blocks;
}

function findSqlStatementEnd(sql: string, start: number): number | null {
  const len = sql.length;
  let inQuote = false;

  for (let i = start; i < len; i++) {
    const ch = sql[i];
    const next = sql[i + 1] ?? '';

    if (ch === "'" && !inQuote) {
      inQuote = true;
      continue;
    }

    if (ch === "'" && inQuote) {
      if (next === "'") {
        i++;
        continue;
      }
      if ((sql[i - 1] ?? '') === '\\') {
        continue;
      }
      inQuote = false;
      continue;
    }

    if (ch === ';' && !inQuote) {
      return i;
    }
  }

  return null;
}

function splitSqlTuples(valuesSql: string): string[] {
  const result: string[] = [];
  const len = valuesSql.length;
  let depth = 0;
  let inQuote = false;
  let buf = '';

  for (let i = 0; i < len; i++) {
    const ch = valuesSql[i];
    const next = valuesSql[i + 1] ?? '';

    // пропускаем запятые и пробелы между tuples
    if (!inQuote && depth === 0 && buf === '' && (ch === ',' || /\s/.test(ch))) {
      continue;
    }

    buf += ch;

    if (ch === "'" && !inQuote) {
      inQuote = true;
      continue;
    }

    if (ch === "'" && inQuote) {
      if (next === "'") {
        buf += next;
        i++;
        continue;
      }

      if ((valuesSql[i - 1] ?? '') === '\\') {
        continue;
      }

      inQuote = false;
      continue;
    }

    if (inQuote) {
      continue;
    }

    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        result.push(buf.trim());
        buf = '';
      }
    }
  }

  return result.filter((item) => item.trim() !== '');
}

function splitTopLevelCsv(text: string): string[] {
  const parts: string[] = [];
  const len = text.length;
  let inQuote = false;
  let depth = 0;
  let buf = '';

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const next = text[i + 1] ?? '';

    if (ch === "'" && !inQuote) {
      inQuote = true;
      buf += ch;
      continue;
    }

    if (ch === "'" && inQuote) {
      buf += ch;

      if (next === "'") {
        buf += next;
        i++;
        continue;
      }
      if ((text[i - 1] ?? '') === '\\') {
        continue;
      }
      inQuote = false;
      continue;
    }

    if (!inQuote) {
      if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
      } else if (ch === ',' && depth === 0) {
        parts.push(buf.trim());
        buf = '';
        continue;
      }
    }

    buf += ch;
  }

  if (buf.trim() !== '') {
    parts.push(buf.trim());
  }

  return parts;
}

function sqlUnquote(value: string): string {
  let result = value.trim();

  if (result.length >= 2 && result.startsWith("'") && result.endsWith("'")) {
    result = result.slice(1, -1);
  }

  result = result.replace(/''/g, "'");
  result = result.replace(/\\'/g, "'");
  result = result.replace(/\\\\/g, '\\');

  return result;
}

function sqlQuote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/* =========================
 * Утилиты
 * ========================= */

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function trimFloat(value: number): string {
  const fixed = value.toFixed(4).replace(/\.?0+$/, '');
  return fixed === '' ? '0' : fixed;
}
