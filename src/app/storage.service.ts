import { Injectable } from '@angular/core';
import { STORAGE } from './constants/storage.const';

export class StoredPath {
  name: string | null = '';
  path = '';
  creationDate: Date = new Date();
  changeDate: Date = new Date();
}

export type StoredViewBoxHistoryEntry = {
  rawPath: string;
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type StoredViewBoxPatch = {
  rawPath: string;
  history: StoredViewBoxHistoryEntry[];
  historyCursor: number;
  localViewPort: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type StoredViewBox = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: string;
  patch: StoredViewBoxPatch;
};

type StoredViewBoxInput = Partial<Omit<StoredViewBox, 'patch'>> & {
  patch?: Partial<Omit<StoredViewBoxPatch, 'history'>> & {
    history?: Array<StoredViewBoxHistoryEntry | string>;
  };
};

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  storedPaths: StoredPath[] = [];
  constructor() {
    this.load();
  }

  hasPath(name: string) {
    return this.getPath(name) !== undefined;
  }

  getPath(name: string | null = null): StoredPath | undefined {
    return this.storedPaths.find(it => it.name === name);
  }

  getHallHtml(): string {
    return localStorage.getItem(STORAGE.HALL_HTML) || '';
  }

  setHallHtml(html: string): void {
    localStorage.setItem(STORAGE.HALL_HTML, html);
  }

  removeHallHtml(): void {
    localStorage.removeItem(STORAGE.HALL_HTML);
  }

  getViewBoxes(): StoredViewBox[] {
    const stored = localStorage.getItem(STORAGE.VIEW_BOXES);
    if (!stored) {
      return [];
    }

    try {
      const parsed = JSON.parse(stored) as StoredViewBoxInput[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((viewBox, index) => normalizeStoredViewBox(viewBox, index))
        .filter((viewBox): viewBox is StoredViewBox => viewBox !== null);
    } catch {
      return [];
    }
  }

  setViewBoxes(viewBoxes: StoredViewBox[]): void {
    localStorage.setItem(STORAGE.VIEW_BOXES, JSON.stringify(viewBoxes));
  }

  removeViewBoxes(): void {
    localStorage.removeItem(STORAGE.VIEW_BOXES);
  }

  getActiveViewBoxId(): string | null {
    const value = localStorage.getItem(STORAGE.ACTIVE_VIEW_BOX_ID);
    return value && value.trim() ? value : null;
  }

  setActiveViewBoxId(id: string): void {
    localStorage.setItem(STORAGE.ACTIVE_VIEW_BOX_ID, id);
  }

  removeActiveViewBoxId(): void {
    localStorage.removeItem(STORAGE.ACTIVE_VIEW_BOX_ID);
  }

  removePath(name: string) {
    this.storedPaths = this.storedPaths.filter(it => it.name !== name);
    this.save();
  }

  addPath(name: string | null, path: string) {
    let p = this.getPath(name);
    if (!p) {
      p = new StoredPath();
      this.storedPaths.push(p);
      p.name = name;
    }
    p.changeDate = new Date();
    p.path = path;
    this.save();
  }

  isEmpty(): boolean {
    return this.storedPaths.filter(it => !!it.name).length === 0;
  }

  load() {
    this.storedPaths = [];
    const stored = localStorage.getItem(STORAGE.STORED_PATHS);
    if (stored) {
      const parsed = JSON.parse(stored) as {creationDate: string, changeDate: string, name: string, path: string}[];
      this.storedPaths = parsed.map(it => ({
        creationDate: new Date(it.creationDate),
        changeDate: new Date(it.changeDate),
        name: it.name,
        path: it.path
      }));
    }
  }

  save() {
    localStorage.setItem(STORAGE.STORED_PATHS, JSON.stringify(this.storedPaths));
  }
}

function normalizeStoredViewBox(viewBox: StoredViewBoxInput | null | undefined, index: number): StoredViewBox | null {
  if (!viewBox) {
    return null;
  }

  const x = normalizeNumber(viewBox.x);
  const y = normalizeNumber(viewBox.y);
  const width = normalizePositiveNumber(viewBox.width, 1);
  const height = normalizePositiveNumber(viewBox.height, 1);
  const patch = viewBox.patch || {};

  return {
    id: typeof viewBox.id === 'string' && viewBox.id.trim() ? viewBox.id : `viewBox-${index + 1}`,
    name: typeof viewBox.name === 'string' && viewBox.name.trim() ? viewBox.name.trim() : `ViewBox ${index + 1}`,
    x,
    y,
    width,
    height,
    createdAt: typeof viewBox.createdAt === 'string' && viewBox.createdAt ? viewBox.createdAt : new Date().toISOString(),
    patch: {
      rawPath: typeof patch.rawPath === 'string' ? patch.rawPath : '',
      history: normalizeHistoryEntries(patch.history, x, y, width, height),
      historyCursor: normalizeInteger(patch.historyCursor, -1),
      localViewPort: {
        x: normalizeNumber(patch.localViewPort?.x),
        y: normalizeNumber(patch.localViewPort?.y),
        width: normalizePositiveNumber(patch.localViewPort?.width, width),
        height: normalizePositiveNumber(patch.localViewPort?.height, height)
      }
    }
  };
}

function normalizeHistoryEntries(
  history: Array<StoredViewBoxHistoryEntry | string> | undefined,
  x: number,
  y: number,
  width: number,
  height: number
): StoredViewBoxHistoryEntry[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => normalizeHistoryEntry(entry, x, y, width, height))
    .filter((entry): entry is StoredViewBoxHistoryEntry => entry !== null);
}

function normalizeHistoryEntry(
  entry: StoredViewBoxHistoryEntry | string,
  x: number,
  y: number,
  width: number,
  height: number
): StoredViewBoxHistoryEntry | null {
  if (typeof entry === 'string') {
    return {
      rawPath: entry,
      viewBox: {
        x,
        y,
        width,
        height
      }
    };
  }

  if (!entry || typeof entry !== 'object' || typeof entry.rawPath !== 'string') {
    return null;
  }

  return {
    rawPath: entry.rawPath,
    viewBox: {
      x: normalizeNumber(entry.viewBox?.x, x),
      y: normalizeNumber(entry.viewBox?.y, y),
      width: normalizePositiveNumber(entry.viewBox?.width, width),
      height: normalizePositiveNumber(entry.viewBox?.height, height)
    }
  };
}

function normalizeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.max(1, Math.ceil(value)) : fallback;
}

function normalizeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}
