import { SvgPath } from '../lib/svg';
import { browserComputePathBoundingBox } from './svg-bbox';

export type PatchContourMode = 'center' | 'outside' | 'inside';

export type PatchDisplayBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PatchLocalViewPort = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NormalizedPatchGeometry = {
  parsedPath: SvgPath;
  rawPath: string;
  innerBBox: DOMRect | null;
  displayPath: string;
  displayBBox: DOMRect | null;
  displayBox: PatchDisplayBox | null;
  strokeLinejoin: string | null;
  strokeLinecap: string | null;
};

export function normalizePatchContourMode(value: unknown): PatchContourMode {
  if (value === 'outside' || value === 'inside' || value === 'center') {
    return value;
  }

  if (value === 'closed') {
    return 'outside';
  }

  return 'center';
}

export function getPatchRenderStrokeLinejoin(mode: PatchContourMode): string | null {
  return mode === 'center' ? null : 'round';
}

export function getPatchRenderStrokeLinecap(mode: PatchContourMode, rawPath = ''): string | null {
  if (mode === 'center') {
    return null;
  }

  return pathEndsClosed(rawPath) ? null : 'round';
}

export function normalizePatchGeometry(
  rawPath: string,
  contourMode: PatchContourMode,
  strokeWidth: number,
  minifyOutput = false
): NormalizedPatchGeometry {
  let parsedPath = new SvgPath('');
  let normalizedRawPath = '';
  let innerBBox: DOMRect | null = null;

  try {
    if (!rawPath.trim()) {
      return createEmptyGeometry(normalizePatchContourMode(contourMode));
    }

    parsedPath = new SvgPath(rawPath);
    normalizedRawPath = parsedPath.asString(6, minifyOutput);
    parsedPath = new SvgPath(normalizedRawPath);

    if (parsedPath.path.length === 0) {
      return createEmptyGeometry(normalizePatchContourMode(contourMode));
    }

    innerBBox = browserComputePathBoundingBox(normalizedRawPath);
  } catch {
    return createEmptyGeometry(normalizePatchContourMode(contourMode));
  }

  const normalizedMode = normalizePatchContourMode(contourMode);
  const displayPath = buildPatchDisplayPath(normalizedRawPath, normalizedMode, strokeWidth, minifyOutput);
  const displayBBox = displayPath ? browserComputePathBoundingBox(displayPath) : null;
  const displayBox = computePatchDisplayBox(displayBBox, strokeWidth, normalizedMode);

  return {
    parsedPath,
    rawPath: normalizedRawPath,
    innerBBox,
    displayPath,
    displayBBox,
    displayBox,
    strokeLinejoin: getPatchRenderStrokeLinejoin(normalizedMode),
    strokeLinecap: getPatchRenderStrokeLinecap(normalizedMode, normalizedRawPath)
  };
}

export function buildPatchLocalViewPort(width: number, height: number, displayBox: PatchDisplayBox | null): PatchLocalViewPort {
  if (displayBox) {
    return {
      x: Number(displayBox.x.toFixed(4)),
      y: Number(displayBox.y.toFixed(4)),
      width: Number(displayBox.width.toFixed(4)),
      height: Number(displayBox.height.toFixed(4))
    };
  }

  return {
    x: 0,
    y: 0,
    width: normalizePositiveInteger(width, 1),
    height: normalizePositiveInteger(height, 1)
  };
}

export function computePatchDisplayBox(
  displayBBox: DOMRect | null,
  strokeWidth: number,
  contourMode: PatchContourMode
): PatchDisplayBox | null {
  if (!displayBBox) {
    return null;
  }

  const safeStrokeWidth = normalizePositiveFloat(strokeWidth, 1);
  const viewPortOffset = computePatchViewPortOffset(contourMode, safeStrokeWidth);

  return {
    x: viewPortOffset,
    y: viewPortOffset,
    width: Number((displayBBox.width + safeStrokeWidth).toFixed(4)),
    height: Number((displayBBox.height + safeStrokeWidth).toFixed(4))
  };
}

function buildPatchDisplayPath(rawPath: string, contourMode: PatchContourMode, strokeWidth: number, minifyOutput = false): string {
  if (!rawPath.trim()) {
    return '';
  }

  if (contourMode === 'center') {
    return rawPath;
  }

  const safeStrokeWidth = normalizePositiveFloat(strokeWidth, 1);
  const halfStroke = safeStrokeWidth / 2;
  const sizeDelta = contourMode === 'outside' ? halfStroke : -halfStroke;
  return buildScaledDisplayPath(rawPath, sizeDelta, minifyOutput);
}

function buildScaledDisplayPath(rawPath: string, sizeDelta: number, minifyOutput = false): string {
  try {
    const scaledPath = new SvgPath(rawPath);
    if (scaledPath.path.length === 0) {
      return rawPath;
    }

    const innerBBox = browserComputePathBoundingBox(rawPath);
    if (!innerBBox || (!innerBBox.width && !innerBBox.height)) {
      return rawPath;
    }

    const centerX = innerBBox.x + (innerBBox.width / 2);
    const centerY = innerBBox.y + (innerBBox.height / 2);
    const scaleX = innerBBox.width > 0 ? Math.max(0.0001, (innerBBox.width + (2 * sizeDelta)) / innerBBox.width) : 1;
    const scaleY = innerBBox.height > 0 ? Math.max(0.0001, (innerBBox.height + (2 * sizeDelta)) / innerBBox.height) : 1;

    scaledPath.translate(-centerX, -centerY);
    scaledPath.scale(scaleX, scaleY);
    scaledPath.translate(centerX, centerY);

    return scaledPath.asString(4, minifyOutput);
  } catch {
    return rawPath;
  }
}

function computePatchViewPortOffset(contourMode: PatchContourMode, strokeWidth: number): number {
  if (contourMode === 'outside') {
    return Number((-strokeWidth).toFixed(4));
  }

  if (contourMode === 'center') {
    return Number((-(strokeWidth / 2)).toFixed(4));
  }

  return 0;
}

function pathEndsClosed(rawPath: string): boolean {
  return /(?:^|\s)[zZ]\s*$/.test(rawPath.trim());
}

function createEmptyGeometry(contourMode: PatchContourMode): NormalizedPatchGeometry {
  return {
    parsedPath: new SvgPath(''),
    rawPath: '',
    innerBBox: null,
    displayPath: '',
    displayBBox: null,
    displayBox: null,
    strokeLinejoin: getPatchRenderStrokeLinejoin(contourMode),
    strokeLinecap: getPatchRenderStrokeLinecap(contourMode)
  };
}

function normalizePositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.ceil(value)) : fallback;
}

function normalizePositiveFloat(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(0.1, Number(value.toFixed(4))) : fallback;
}
