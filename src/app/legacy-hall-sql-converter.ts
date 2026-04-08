export type LegacyHallConvertOptions = {
  hallIdValue: string;
};

type ParsedDivParam = {
  attrs: string;
  style: string;
  innerHtml: string;
};

type StyleMap = Record<string, string>;

type BorderSide = {
  width: number;
  style: string;
  color: string;
};

type Borders = {
  top: BorderSide;
  right: BorderSide;
  bottom: BorderSide;
  left: BorderSide;
};

type RadiusCorner = {
  x: number;
  y: number;
};

type RadiusMap = {
  tl: RadiusCorner;
  tr: RadiusCorner;
  br: RadiusCorner;
  bl: RadiusCorner;
};

export function convertLegacyHallInsertSqlToUpdateSql(
  sql: string,
  options: LegacyHallConvertOptions,
): string {
  const blocks = extractPlaceObjInsertBlocks(sql);
  const out: string[] = [];
  const hallIdSqlVar = '@hall_id';
  const hallIdSqlValue = normalizeHallIdSqlValue(options.hallIdValue);

  out.push(`SET ${hallIdSqlVar} = ${hallIdSqlValue};`);
  out.push('');

  for (const block of blocks) {
    const tuples = splitSqlTuples(block);

    for (const tuple of tuples) {
      const fields = splitTopLevelCsv(trimTuple(tuple));
      if (fields.length < 9) {
        continue;
      }

      const [, , x, y, width, height, type, param, inFront] = fields;
      const widthValue = parseInt(trimNumeric(width), 10) || 0;
      const heightValue = parseInt(trimNumeric(height), 10) || 0;
      const paramValue = sqlUnquote(param.trim());
      const newParam = convertParamToSvgParam(paramValue, widthValue, heightValue);

      out.push(
        'UPDATE `place_obj`\n'
          + `SET \`param\` = ${sqlQuote(newParam)}\n`
          + `WHERE \`hall_id\` = ${hallIdSqlVar}\n`
          + `  AND \`x\` = ${x.trim()}\n`
          + `  AND \`y\` = ${y.trim()}\n`
          + `  AND \`width\` = ${width.trim()}\n`
          + `  AND \`height\` = ${height.trim()}\n`
          + `  AND \`type\` = ${type.trim()}\n`
          + `  AND \`in_front\` = ${inFront.trim()}\n`
          + 'LIMIT 1;'
      );
      out.push('');
    }
  }

  return out.join('\n').trimEnd() + '\n';
}

function normalizeHallIdSqlValue(value: string): string {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : '0';
}

function trimTuple(value: string): string {
  return value.trim().replace(/^,\s*/, '').replace(/^\(/, '').replace(/\)\s*$/, '');
}

function trimNumeric(value: string): string {
  return value.trim();
}

function convertParamToSvgParam(param: string, width: number, height: number): string {
  if (/<svg\b/i.test(param)) {
    return param;
  }

  const parsed = parseSingleDivParam(param);
  if (!parsed) {
    return param;
  }

  const styleMap = parseStyleMap(parsed.style);
  const innerHtml = parsed.innerHtml;
  const hasText = stripHtml(innerHtml).trim() !== '';
  const hasFigure = hasFigureStyles(styleMap);
  const outerHasTransform = hasTransformStyle(styleMap);

  if (!hasFigure && hasText) {
    return param;
  }

  if (!hasFigure && !hasText) {
    return buildWrapperOnly(width, height, styleMap);
  }

  const svg = buildSvgFromStyles(styleMap, width, height);

  if (!hasText) {
    return buildWrapper(width, height, styleMap, svg, '');
  }

  if (outerHasTransform) {
    return buildWrapper(width, height, styleMap, svg, innerHtml);
  }

  const textStyle = buildOverlayTextStyle(styleMap);
  const textDiv = `<div style="${escapeHtmlAttr(textStyle)}">${innerHtml}</div>`;

  return buildWrapper(width, height, styleMap, svg, textDiv);
}

function buildWrapper(
  width: number,
  height: number,
  styleMap: StyleMap,
  svg: string,
  innerHtml: string,
): string {
  const wrapperStyle = buildWrapperStyle(styleMap, width, height);

  return `<div style="\n    ${wrapperStyle}\n  " generated_object>\n    ${svg}${innerHtml !== '' ? `\n    ${innerHtml}` : ''}\n  </div>`;
}

function buildWrapperOnly(width: number, height: number, styleMap: StyleMap): string {
  const wrapperStyle = buildWrapperStyle(styleMap, width, height);

  return `<div style="\n    ${wrapperStyle}\n  " generated_object></div>`;
}

function buildWrapperStyle(styleMap: StyleMap, width: number, height: number): string {
  const style: string[] = [];

  style.push(`position:${pickStyleValue(styleMap, ['position']) || 'absolute'}`);
  style.push(`width:${width}px`);
  style.push(`height:${height}px`);
  style.push(`box-sizing:${pickStyleValue(styleMap, ['box-sizing']) || 'border-box'}`);

  appendStyleIfExists(style, 'overflow', styleMap, ['overflow']);
  appendStyleIfExists(style, 'overflow-x', styleMap, ['overflow-x']);
  appendStyleIfExists(style, 'overflow-y', styleMap, ['overflow-y']);
  appendStyleIfExists(style, 'display', styleMap, ['display']);
  appendStyleIfExists(style, 'z-index', styleMap, ['z-index']);

  appendStyleIfExists(style, '-webkit-transform', styleMap, ['-webkit-transform']);
  appendStyleIfExists(style, '-moz-transform', styleMap, ['-moz-transform']);
  appendStyleIfExists(style, '-ms-transform', styleMap, ['-ms-transform']);
  appendStyleIfExists(style, '-o-transform', styleMap, ['-o-transform']);
  appendStyleIfExists(style, 'transform', styleMap, ['transform']);

  appendStyleIfExists(style, '-webkit-transform-origin', styleMap, ['-webkit-transform-origin']);
  appendStyleIfExists(style, '-moz-transform-origin', styleMap, ['-moz-transform-origin']);
  appendStyleIfExists(style, '-ms-transform-origin', styleMap, ['-ms-transform-origin']);
  appendStyleIfExists(style, '-o-transform-origin', styleMap, ['-o-transform-origin']);
  appendStyleIfExists(style, 'transform-origin', styleMap, ['transform-origin']);

  return style.join(';\n    ') + ';';
}

function buildSvgFromStyles(styleMap: StyleMap, width: number, height: number): string {
  const fill = extractFigureFill(styleMap);
  const borders = parseBorders(styleMap);

  const radius = parseBorderRadius(
    pickStyleValue(styleMap, [
      'border-radius',
      '-webkit-border-radius',
      '-moz-border-radius',
      '-ms-border-radius',
    ]) || '',
    width,
    height
  );

  const hasUniformBorder =
    allBordersEqual(borders) &&
    borders.top.width > 0 &&
    borders.top.style.toLowerCase() !== 'none';

  const strokeWidth = hasUniformBorder ? borders.top.width : 0;
  const strokeColor = hasUniformBorder ? borders.top.color : 'none';

  // если border общий, path строим сразу под него
  const pathD = hasUniformBorder
    ? roundedRectPath(
        strokeWidth / 2,
        strokeWidth / 2,
        width - strokeWidth,
        height - strokeWidth,
        insetRadius(radius, strokeWidth / 2)
      )
    : roundedRectPath(0, 0, width, height, radius);

  return [
    `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;" xmlns="http://www.w3.org/2000/svg">`,
    `      <path d="${pathD}" fill="${escapeHtmlAttr(fill)}" stroke="${escapeHtmlAttr(strokeColor)}" stroke-width="${trimFloat(strokeWidth)}" />`,
    `    </svg>`,
  ].join('\n');
}


function buildOverlayTextStyle(styleMap: StyleMap): string {
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
    'transform',
    '-webkit-transform',
    '-moz-transform',
    '-ms-transform',
    '-o-transform',
    'transform-origin',
    '-webkit-transform-origin',
    '-moz-transform-origin',
    '-ms-transform-origin',
    '-o-transform-origin',
  ];

  const style: string[] = [
    'position:absolute',
    'left:0',
    'top:0',
    'width:100%',
    'height:100%',
    'box-sizing:border-box',
  ];

  for (const key of keep) {
    const value = styleMap[key];
    if (value && value.trim() !== '') {
      style.push(`${key}:${value.trim()}`);
    }
  }

  return style.join(';') + ';';
}

function buildPerSideBorderSvg(borders: Borders, width: number, height: number, radius: RadiusMap): string[] {
  const svg: string[] = [];

  const tl = radius.tl;
  const tr = radius.tr;
  const br = radius.br;
  const bl = radius.bl;

  if (borders.top.width > 0 && borders.top.style.toLowerCase() !== 'none') {
    const y = borders.top.width / 2;
    svg.push(
      `      <path d="M ${trimFloat(tl.x)} ${trimFloat(y)} L ${trimFloat(width - tr.x)} ${trimFloat(y)}" fill="none" stroke="${escapeHtmlAttr(borders.top.color)}" stroke-width="${trimFloat(borders.top.width)}"></path>`
    );
  }

  if (borders.right.width > 0 && borders.right.style.toLowerCase() !== 'none') {
    const x = width - (borders.right.width / 2);
    svg.push(
      `      <path d="M ${trimFloat(x)} ${trimFloat(tr.y)} L ${trimFloat(x)} ${trimFloat(height - br.y)}" fill="none" stroke="${escapeHtmlAttr(borders.right.color)}" stroke-width="${trimFloat(borders.right.width)}"></path>`
    );
  }

  if (borders.bottom.width > 0 && borders.bottom.style.toLowerCase() !== 'none') {
    const y = height - (borders.bottom.width / 2);
    svg.push(
      `      <path d="M ${trimFloat(bl.x)} ${trimFloat(y)} L ${trimFloat(width - br.x)} ${trimFloat(y)}" fill="none" stroke="${escapeHtmlAttr(borders.bottom.color)}" stroke-width="${trimFloat(borders.bottom.width)}"></path>`
    );
  }

  if (borders.left.width > 0 && borders.left.style.toLowerCase() !== 'none') {
    const x = borders.left.width / 2;
    svg.push(
      `      <path d="M ${trimFloat(x)} ${trimFloat(tl.y)} L ${trimFloat(x)} ${trimFloat(height - bl.y)}" fill="none" stroke="${escapeHtmlAttr(borders.left.color)}" stroke-width="${trimFloat(borders.left.width)}"></path>`
    );
  }

  return svg;
}

function allBordersEqual(borders: {
  top: { width: number; style: string; color: string };
  right: { width: number; style: string; color: string };
  bottom: { width: number; style: string; color: string };
  left: { width: number; style: string; color: string };
}): boolean {
  const t = borders.top;

  return (
    t.width === borders.right.width &&
    t.width === borders.bottom.width &&
    t.width === borders.left.width &&
    t.style === borders.right.style &&
    t.style === borders.bottom.style &&
    t.style === borders.left.style &&
    t.color === borders.right.color &&
    t.color === borders.bottom.color &&
    t.color === borders.left.color
  );
}

function areBordersSame(a: BorderSide, b: BorderSide): boolean {
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
  const tl = r.tl;
  const tr = r.tr;
  const br = r.br;
  const bl = r.bl;
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

function hasFigureStyles(styleMap: StyleMap): boolean {
  const bgColor = (styleMap['background-color'] || '').trim().toLowerCase();
  const bg = (styleMap.background || '').trim().toLowerCase();

  if (bgColor && bgColor !== 'transparent' && bgColor !== 'none') {
    return true;
  }

  if (bg && bg !== 'transparent' && bg !== 'none') {
    return true;
  }

  for (const key of Object.keys(styleMap)) {
    if (
      key === 'border'
      || key.startsWith('border-')
      || key.includes('border-radius')
      || key.includes('-webkit-border-radius')
      || key.includes('-moz-border-radius')
      || key.includes('-ms-border-radius')
    ) {
      return true;
    }
  }

  return false;
}

function parseBorders(styleMap: StyleMap): Borders {
  const defaultBorder: BorderSide = {
    width: 0,
    style: 'none',
    color: '#000000',
  };

  const borders: Borders = {
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
    const shorthandKey = `border-${side}`;
    if (styleMap[shorthandKey]) {
      borders[side] = parseBorderShorthand(styleMap[shorthandKey]);
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
    if (!token) {
      continue;
    }

    if (/^[\d.]+px$/i.test(token)) {
      result.width = parseFloat(token);
      continue;
    }

    if (['none', 'solid', 'dashed', 'dotted', 'double'].includes(token.toLowerCase())) {
      result.style = token.toLowerCase();
      continue;
    }

    result.color = token;
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
  const values = tokens.map((token) => cssLengthToPx(token, base));

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

  const percent = normalized.match(/^([\d.]+)%$/);
  if (percent) {
    return (base * parseFloat(percent[1])) / 100;
  }

  const px = normalized.match(/^([\d.]+)px$/i);
  if (px) {
    return parseFloat(px[1]);
  }

  if (/^[\d.]+$/.test(normalized)) {
    return parseFloat(normalized);
  }

  return 0;
}

function parseSingleDivParam(html: string): ParsedDivParam | null {
  const trimmed = html.trim();
  const match = trimmed.match(/^<div\b([^>]*)>([\s\S]*)<\/div>$/i);
  if (!match) {
    return null;
  }

  const attrs = match[1] || '';
  const innerHtml = match[2] || '';
  const styleMatch = attrs.match(/style\s*=\s*"([\s\S]*?)"/i);

  return {
    attrs,
    style: styleMatch ? styleMatch[1] : '',
    innerHtml,
  };
}

function parseStyleMap(style: string): StyleMap {
  const map: StyleMap = {};

  for (const item of style.split(';')) {
    const normalized = item.trim();
    if (!normalized || !normalized.includes(':')) {
      continue;
    }

    const colonIndex = normalized.indexOf(':');
    const key = normalized.slice(0, colonIndex).trim().toLowerCase();
    const value = normalized.slice(colonIndex + 1).trim();

    if (key) {
      map[key] = value;
    }
  }

  return map;
}

function extractPlaceObjInsertBlocks(sql: string): string[] {
  const blocks: string[] = [];
  const needle = 'INSERT INTO `place_obj`';
  let offset = 0;

  while (true) {
    const pos = sql.toLowerCase().indexOf(needle.toLowerCase(), offset);
    if (pos === -1) {
      break;
    }

    const valuesPos = sql.toLowerCase().indexOf('values', pos);
    if (valuesPos === -1) {
      break;
    }

    const start = valuesPos + 'VALUES'.length;
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
  let inQuote = false;

  for (let i = start; i < sql.length; i++) {
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
  let inQuote = false;
  let depth = 0;
  let buf = '';

  for (let i = 0; i < text.length; i++) {
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

function hasTransformStyle(styleMap: StyleMap): boolean {
  return ['transform', '-webkit-transform', '-moz-transform', '-ms-transform', '-o-transform'].some((key) => {
    const value = (styleMap[key] || '').trim().toLowerCase();
    return value !== '' && value !== 'none';
  });
}

function extractFigureFill(styleMap: StyleMap): string {
  const backgroundColor = (styleMap['background-color'] || '').trim();
  if (backgroundColor && !isTransparentLike(backgroundColor)) {
    return backgroundColor;
  }

  const background = normalizeBackgroundFill(styleMap['background'] || '');
  if (background && !isTransparentLike(background)) {
    return background;
  }

  return 'none';
}

function normalizeBackgroundFill(backgroundValue: string): string {
  const raw = backgroundValue.trim();
  if (!raw) {
    return 'none';
  }

  const lower = raw.toLowerCase();
  if (lower === 'none' || lower === 'transparent') {
    return 'none';
  }

  if (lower.includes('gradient(') || lower.includes('url(')) {
    return 'none';
  }

  const tokens = raw
    .replace(/\s*\/\s*[^ ]+/g, '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const ignored = new Set([
    'repeat',
    'repeat-x',
    'repeat-y',
    'no-repeat',
    'scroll',
    'fixed',
    'local',
    'center',
    'top',
    'bottom',
    'left',
    'right',
    'border-box',
    'padding-box',
    'content-box',
    'initial',
    'inherit',
  ]);

  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    if (ignored.has(lowerToken)) {
      continue;
    }
    if (/^[-\d.]+(px|%)?$/.test(lowerToken)) {
      continue;
    }
    return token;
  }

  return 'none';
}

function isTransparentLike(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'none' || normalized === 'transparent';
}

function pickStyleValue(styleMap: StyleMap, keys: string[]): string {
  for (const key of keys) {
    const value = styleMap[key];
    if (value && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

function appendStyleIfExists(target: string[], outputKey: string, styleMap: StyleMap, sourceKeys: string[]): void {
  const value = pickStyleValue(styleMap, sourceKeys);
  if (value) {
    target.push(`${outputKey}:${value}`);
  }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function trimFloat(value: number): string {
  const text = value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return text === '' ? '0' : text;
}
