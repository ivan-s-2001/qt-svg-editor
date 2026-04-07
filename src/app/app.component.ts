import { Component, AfterViewInit, HostListener, ViewChild } from '@angular/core';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { SvgPath, SvgItem, Point, SvgPoint, SvgControlPoint, formatNumber } from '../lib/svg';
import type { SvgCommandType, SvgCommandTypeAny } from '../lib/svg-command-types';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { StorageService, StoredViewBox } from './storage.service';
import { CanvasComponent } from './canvas/canvas.component';
import { Image } from './image';
import { UploadImageComponent } from './upload-image/upload-image.component';
import { ConfigService } from './config.service';
import { browserComputePathBoundingBox } from './svg-bbox';
import { reversePath } from '../lib/reverse-path';
import { optimizePath } from '../lib/optimize-path';
import { changePathOrigin } from 'src/lib/change-path-origin';
import { KEYBOARD } from './constants/keyboard.const';

export const kDefaultPath = `M 4 8 L 10 1 L 13 0 L 12 3 L 5 9 C 6 10 6 11 7 10 C 7 11 8 12 7 12 A 1.42 1.42 0 0 1 6 13 `
+ `A 5 5 0 0 0 4 10 Q 3.5 9.9 3.5 10.5 T 2 11.8 T 1.2 11 T 2.5 9.5 T 3 9 A 5 5 90 0 0 0 7 A 1.42 1.42 0 0 1 1 6 `
+ `C 1 5 2 6 3 6 C 2 7 3 7 4 8 M 10 1 L 10 3 L 12 3 L 10.2 2.8 L 10 1`;

type ExtractedHall = {
  markup: string;
  width: number;
  height: number;
};

type ViewBoxDraft = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ViewBoxPatchContext = {
  rawPath: string;
  parsedPath: SvgPath;
  targetPoints: SvgPoint[];
  controlPoints: SvgControlPoint[];
  history: string[];
  historyCursor: number;
  localViewPort: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type ViewBoxEntity = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: string;
  patch: ViewBoxPatchContext;
};

const DEFAULT_HALL_CSS = `.hall {position:relative}
.hall * {-webkit-user-select: none;-moz-user-select: none;-ms-user-select: none;}
.hall .r {position:absolute;z-index:1;cursor:pointer;border:1px solid black;overflow:hidden;box-sizing:border-box;}
.hall .r .n, .hall .r .p {text-align:center;font-size:10px;line-height:10px;color:#000000}
.hall .r .n {border-bottom:1px dotted black;padding-bottom:1px;display:table-cell;vertical-align:bottom;width:100px;}
.hall .r .p {border-top:1px dotted black}
.hall .o {position:absolute}
.hall .delete_with_series {background-image:url(../images/stripe.png) !important;}
.hall .is_block {background-image:url(../images/grid.png) !important;}
.hall .disabled {background:#C0C0C0}
.color_free, .hall .c0 {background:#FFFFFF}
.color_choice, .hall .c99 {background:#98EE9C}
.color_buyoffline, .hall .c1 {background:#FFB2B2}
.color_buyoffline_seriesnumber, .hall .c1_s {background:#fa0000;}
.color_bookoffline, .hall .c2 {background:#82D1E9}
.color_block, .hall .c3 {background:#C0C0C0}
.color_timebook_short_offline, .hall .c8 {background:#FFFF99}
.color_buyonline, .hall .c1_1 {background:#e094c6;}
.color_buyonline_seriesnumber, .hall .c1_1_s {background:#ff005c;}
.color_bookonline, .hall .c2_1 {background:#00c2fc}
.color_timebook_long_online, .hall .c9_1 {background:#ff7a00;}
.color_timebook_short_online, .hall .c8_1 {background:#ffff08}`;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  animations: [
    trigger('leftColumnParent', [
      transition(':enter', [])
    ]),
    trigger('leftColumn', [
      state('*', style({ 'max-width': '310px' })),
      transition(':enter', [style({ 'max-width': '0' }), animate('100ms ease')]),
      transition(':leave', [animate('100ms ease', style({ 'max-width': '0' }))])
    ])
  ]
})
export class AppComponent implements AfterViewInit {
  parsedPath: SvgPath;
  targetPoints: SvgPoint[] = [];
  controlPoints: SvgControlPoint[] = [];

  _rawPath = this.storage.getPath()?.path || kDefaultPath;
  pathName = '';
  invalidSyntax = false;

  history: string[] = [];
  historyCursor = -1;
  historyDisabled = false;

  scaleX = 1;
  scaleY = 1;
  translateX = 0;
  translateY = 0;
  rotateX = 0;
  rotateY = 0;
  rotateAngle = 0;
  roundValuesDecimals = 1;

  @ViewChild(CanvasComponent) canvas?: CanvasComponent;
  canvasWidth = 100;
  canvasHeight = 100;
  strokeWidth = 1;

  draggedPoint: SvgPoint | null = null;
  focusedItem: SvgItem | null = null;
  hoveredItem: SvgItem | null = null;
  wasCanvasDragged = false;
  draggedIsNew = false;
  dragging = false;
  cursorPosition?: Point & { decimals?: number };
  hoverPosition?: Point;

  images: Image[] = [];
  focusedImage: Image | null = null;

  hallFragment = this.storage.getHallHtml();
  hallHtml: SafeHtml | null = null;
  hallWidth = 0;
  hallHeight = 0;
  hallError = '';

  viewBoxes: ViewBoxEntity[] = [];
  newViewBox: ViewBoxDraft = { x: 40, y: 40, width: 320, height: 240 };

  isLeftPanelOpened = true;
  isContextualMenuOpened = false;
  isEditingImages = false;

  max = Math.max;
  trackByIndex = (idx: number, _: unknown) => idx;
  trackByViewBoxId = (_: number, viewBox: ViewBoxEntity) => viewBox.id;
  formatNumber = (v: number) => formatNumber(v, 4);

  constructor(
    matRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer,
    public cfg: ConfigService,
    private storage: StorageService
  ) {
    for (const icon of ['delete', 'logo', 'more', 'github', 'zoom_in', 'zoom_out', 'zoom_fit', 'sponsor']) {
      matRegistry.addSvgIcon(icon, this.domSanitizer.bypassSecurityTrustResourceUrl(`./assets/${icon}.svg`));
    }

    this.parsedPath = new SvgPath('');

    if (this.hallFragment) {
      this.loadHallFragment(this.hallFragment, false);
    }

    this.viewBoxes = this.storage.getViewBoxes().map((viewBox) => this.inflateViewBox(viewBox));

    this.reloadPath(this.rawPath, true);
  }

  @HostListener('document:keydown', ['$event']) onKeyDown($event: KeyboardEvent) {
    const tag = $event.target instanceof Element ? $event.target.tagName : null;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      if ($event.shiftKey && ($event.metaKey || $event.ctrlKey) && $event.key.toLowerCase() === KEYBOARD.KEYS.UNDO) {
        this.redo();
        $event.preventDefault();
      } else if (($event.metaKey || $event.ctrlKey) && $event.key.toLowerCase() === KEYBOARD.KEYS.UNDO) {
        this.undo();
        $event.preventDefault();
      } else if (!$event.metaKey && !$event.ctrlKey && KEYBOARD.PATTERNS.SVG_COMMAND.test($event.key)) {
        const isLower = $event.key === $event.key.toLowerCase();
        const key = $event.key.toUpperCase() as SvgCommandType;
        if (isLower) {
          const lastItem = this.parsedPath.path.length ? this.parsedPath.path[this.parsedPath.path.length - 1] : null;
          const prevItem = this.focusedItem || lastItem;
          if (this.canInsertAfter(prevItem, key)) {
            this.insert(key, prevItem, false);
            $event.preventDefault();
          }
        } else if (!isLower && this.focusedItem && this.canConvert(this.focusedItem, key)) {
          this.insert(key, this.focusedItem, true);
          $event.preventDefault();
        }
      } else if (!$event.metaKey && !$event.ctrlKey && $event.key === KEYBOARD.KEYS.ESCAPE) {
        if (this.dragging) {
          this.reloadPath(this.history[this.historyCursor]);
        } else if (this.canvas) {
          this.canvas.stopDrag();
        }
        $event.preventDefault();
      } else if (!$event.metaKey && !$event.ctrlKey && ($event.key === KEYBOARD.KEYS.DELETE || $event.key === KEYBOARD.KEYS.BACKSPACE)) {
        if (this.focusedItem && this.canDelete(this.focusedItem)) {
          this.delete(this.focusedItem);
          $event.preventDefault();
        }
        if (this.focusedImage) {
          this.deleteImage(this.focusedImage);
          $event.preventDefault();
        }
      }
    }
  }

  get decimals() {
    return this.cfg.snapToGrid ? 0 : this.cfg.decimalPrecision;
  }

  get hasHall(): boolean {
    return this.hallWidth > 0 && this.hallHeight > 0 && !!this.hallHtml;
  }

  get hallPanelInfo(): string {
    return this.hasHall ? `${this.hallWidth}×${this.hallHeight}` : 'not loaded';
  }

  get hallLayerScale(): number {
    return this.strokeWidth > 0 ? 1 / this.strokeWidth : 1;
  }

  get hallLayerOffsetX(): number {
    return this.strokeWidth > 0 ? -this.cfg.viewPortX / this.strokeWidth : 0;
  }

  get hallLayerOffsetY(): number {
    return this.strokeWidth > 0 ? -this.cfg.viewPortY / this.strokeWidth : 0;
  }

  get viewBoxPanelInfo(): string {
    return this.viewBoxes.length.toString();
  }

  get canCreateViewBox(): boolean {
    return this.newViewBox.width > 0 && this.newViewBox.height > 0;
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.zoomAuto();
    }, 0);
  }

  get rawPath(): string {
    return this._rawPath;
  }

  set rawPath(value: string) {
    this._rawPath = value;
    this.pushHistory();
  }

  setIsDragging(dragging: boolean) {
    this.dragging = dragging;
    this.setHistoryDisabled(dragging);
    if (!dragging) {
      this.draggedIsNew = false;
    }
  }

  setCursorPosition(position?: Point & { decimals?: number }) {
    this.cursorPosition = position;
  }

  setHoverPosition(position?: Point) {
    this.hoverPosition = position;
  }

  setHistoryDisabled(value: boolean) {
    this.historyDisabled = value;
    if (!value) {
      this.pushHistory();
    }
  }

  pushHistory() {
    if (!this.historyDisabled && this.rawPath !== this.history[this.historyCursor]) {
      this.historyCursor++;
      this.history.splice(this.historyCursor, this.history.length - this.historyCursor, this.rawPath);
      this.storage.addPath(null, this.rawPath);
    }
  }

  canUndo(): boolean {
    return this.historyCursor > 0 && !this.isEditingImages;
  }

  undo() {
    if (this.canUndo()) {
      this.historyDisabled = true;
      this.historyCursor--;
      this.reloadPath(this.history[this.historyCursor]);
      this.historyDisabled = false;
    }
  }

  canRedo(): boolean {
    return this.historyCursor < this.history.length - 1 && !this.isEditingImages;
  }

  redo() {
    if (this.canRedo()) {
      this.historyDisabled = true;
      this.historyCursor++;
      this.reloadPath(this.history[this.historyCursor]);
      this.historyDisabled = false;
    }
  }

  updateViewPort(x: number, y: number, w: number | null, h: number | null, force = false) {
    if (!force && this.cfg.viewPortLocked) {
      return;
    }
    if (w === null && h !== null) {
      w = this.canvasWidth * h / this.canvasHeight;
    }
    if (h === null && w !== null) {
      h = this.canvasHeight * w / this.canvasWidth;
    }
    if (!w || !h) {
      return;
    }

    this.cfg.viewPortX = parseFloat((1 * x).toPrecision(6));
    this.cfg.viewPortY = parseFloat((1 * y).toPrecision(6));
    this.cfg.viewPortWidth = parseFloat((1 * w).toPrecision(4));
    this.cfg.viewPortHeight = parseFloat((1 * h).toPrecision(4));
    this.strokeWidth = this.cfg.viewPortWidth / this.canvasWidth;
  }

  insert(type: SvgCommandTypeAny, after: SvgItem | null, convert: boolean) {
    if (convert) {
      if (after) {
        this.focusedItem = this.parsedPath.changeType(after, (after.relative ? type.toLowerCase() as SvgCommandTypeAny : type));
        this.afterModelChange();
      }
    } else {
      this.draggedIsNew = true;
      const pts = this.targetPoints;
      let point1: Point;

      let newItem: SvgItem | null = null;
      if (after) {
        point1 = after.targetLocation();
      } else if (pts.length === 0) {
        newItem = SvgItem.Make(['M', '0', '0']);
        this.parsedPath.insert(newItem);
        point1 = new Point(0, 0);
      } else {
        point1 = pts[pts.length - 1];
      }

      if (type.toLowerCase() !== 'm' || !newItem) {
        const relative = type.toLowerCase() === type;
        const X = (relative ? 0 : point1.x).toString();
        const Y = (relative ? 0 : point1.y).toString();
        switch (type.toLocaleLowerCase()) {
          case 'm': case 'l': case 't':
            newItem = SvgItem.Make([type, X, Y]); break;
          case 'h':
            newItem = SvgItem.Make([type, X]); break;
          case 'v':
            newItem = SvgItem.Make([type, Y]); break;
          case 's': case 'q':
            newItem = SvgItem.Make([type, X, Y, X, Y]); break;
          case 'c':
            newItem = SvgItem.Make([type, X, Y, X, Y, X, Y]); break;
          case 'a':
            newItem = SvgItem.Make([type, '1', '1', '0', '0', '0', X, Y]); break;
          case 'z':
            newItem = SvgItem.Make([type]);
        }
        if (newItem) {
          this.parsedPath.insert(newItem, after ?? undefined);
        }
      }
      this.setHistoryDisabled(true);
      this.afterModelChange();

      if (newItem) {
        this.focusedItem = newItem;
        this.draggedPoint = newItem.targetLocation();
      }
    }
  }

  zoomAuto() {
    if (this.cfg.viewPortLocked) {
      return;
    }

    if (this.hasHall) {
      let w = this.hallWidth;
      let h = this.hallHeight;

      if (this.canvasWidth > 0 && this.canvasHeight > 0) {
        const canvasRatio = this.canvasHeight / this.canvasWidth;
        const hallRatio = h / w;

        if (canvasRatio < hallRatio) {
          w = h / canvasRatio;
        } else {
          h = canvasRatio * w;
        }
      }

      this.updateViewPort(0, 0, w, h, true);
      return;
    }

    const bbox = browserComputePathBoundingBox(this.rawPath);
    const k = this.canvasHeight / this.canvasWidth;
    let w = bbox.width + 2;
    let h = bbox.height + 2;
    if (k < h / w) {
      w = h / k;
    } else {
      h = k * w;
    }

    this.updateViewPort(bbox.x - 1, bbox.y - 1, w, h);
  }

  scale(x: number, y: number) {
    this.parsedPath.scale(1 * x, 1 * y);
    this.scaleX = 1;
    this.scaleY = 1;
    this.afterModelChange();
  }

  translate(x: number, y: number) {
    this.parsedPath.translate(1 * x, 1 * y);
    this.translateX = 0;
    this.translateY = 0;
    this.afterModelChange();
  }

  rotate(x: number, y: number, angle: number) {
    this.parsedPath.rotate(1 * x, 1 * y, 1 * angle);
    this.afterModelChange();
  }

  setRelative(rel: boolean) {
    this.parsedPath.setRelative(rel);
    this.afterModelChange();
  }

  reverse() {
    reversePath(this.parsedPath);
    this.afterModelChange();
  }

  optimize() {
    optimizePath(this.parsedPath, {
      removeUselessCommands: true,
      useHorizontalAndVerticalLines: true,
      useRelativeAbsolute: true,
      useReverse: true,
      useShorthands: true
    });
    this.cfg.minifyOutput = true;
    this.afterModelChange();
  }

  setValue(item: SvgItem, idx: number, val: number) {
    if (!isNaN(val)) {
      item.values[idx] = val;
      this.parsedPath.refreshAbsolutePositions();
      this.afterModelChange();
    }
  }

  delete(item: SvgItem) {
    this.focusedItem = null;
    this.parsedPath.delete(item);
    this.afterModelChange();
  }

  useAsOrigin(item: SvgItem, subpathOnly?: boolean) {
    const idx = this.parsedPath.path.indexOf(item);
    changePathOrigin(this.parsedPath, idx, subpathOnly);
    this.afterModelChange();
    this.focusedItem = null;
  }

  reverseSubPath(item: SvgItem) {
    const idx = this.parsedPath.path.indexOf(item);
    reversePath(this.parsedPath, idx);
    this.afterModelChange();
    this.focusedItem = null;
  }

  afterModelChange() {
    this.reloadPoints();
    this.rawPath = this.parsedPath.asString(4, this.cfg.minifyOutput);
  }

  roundValues(decimals: number) {
    this.reloadPath(this.parsedPath.asString(decimals, this.cfg.minifyOutput));
  }

  canDelete(item: SvgItem): boolean {
    const idx = this.parsedPath.path.indexOf(item);
    return idx > 0;
  }

  canInsertAfter(item: SvgItem | null, type: SvgCommandType): boolean {
    let previousType: SvgCommandType | null = null;
    if (item !== null) {
      previousType = item.getType().toUpperCase() as SvgCommandType;
    } else if (this.parsedPath.path.length > 0) {
      previousType = this.parsedPath.path[this.parsedPath.path.length - 1].getType().toUpperCase() as SvgCommandType;
    }
    if (!previousType) {
      return type !== 'Z';
    }
    if (previousType === 'M') {
      return type !== 'M' && type !== 'Z' && type !== 'T' && type !== 'S';
    }
    if (previousType === 'Z') {
      return type !== 'Z' && type !== 'T' && type !== 'S';
    }
    if (previousType === 'C' || previousType === 'S') {
      return type !== 'T';
    }
    if (previousType === 'Q' || previousType === 'T') {
      return type !== 'S';
    }
    return type !== 'T' && type !== 'S';
  }

  canConvert(item: SvgItem, to: SvgCommandType): boolean {
    const idx = this.parsedPath.path.indexOf(item);
    if (idx === 0) {
      return false;
    }
    if (idx > 0) {
      return this.canInsertAfter(this.parsedPath.path[idx - 1], to);
    }
    return false;
  }

  canUseAsOrigin(item: SvgItem): boolean {
    return item.getType().toUpperCase() !== 'Z' && this.parsedPath.path.indexOf(item) > 1;
  }

  hasSubPaths(): boolean {
    let moveCount = 0;
    for (const command of this.parsedPath.path) {
      if (command.getType(true) === 'M') {
        moveCount++;
        if (moveCount === 2) {
          return true;
        }
      }
    }
    return false;
  }

  getTooltip(item: SvgItem, idx: number): string {
    const labels: Record<SvgCommandTypeAny, string[]> = {
      'M': ['x', 'y'],
      'm': ['dx', 'dy'],
      'L': ['x', 'y'],
      'l': ['dx', 'dy'],
      'V': ['y'],
      'v': ['dy'],
      'H': ['x'],
      'h': ['dx'],
      'C': ['x1', 'y1', 'x2', 'y2', 'x', 'y'],
      'c': ['dx1', 'dy1', 'dx2', 'dy2', 'dx', 'dy'],
      'S': ['x2', 'y2', 'x', 'y'],
      's': ['dx2', 'dy2', 'dx', 'dy'],
      'Q': ['x1', 'y1', 'x', 'y'],
      'q': ['dx1', 'dy1', 'dx', 'dy'],
      'T': ['x', 'y'],
      't': ['dx', 'dy'],
      'A': ['rx', 'ry', 'x-axis-rotation', 'large-arc-flag', 'sweep-flag', 'x', 'y'],
      'a': ['rx', 'ry', 'x-axis-rotation', 'large-arc-flag', 'sweep-flag', 'dx', 'dy'],
      'Z': [],
      'z': []
    };
    const commandType = item.getType() as SvgCommandTypeAny;
    return labels[commandType][idx];
  }

  openPath(newPath: string, name: string): void {
    this.pathName = name;
    this.history = [];
    this.historyCursor = -1;
    this.reloadPath(newPath, true);
  }

  reloadPath(newPath: string, autozoom = false): void {
    this.hoveredItem = null;
    this.focusedItem = null;
    this.rawPath = newPath;
    this.invalidSyntax = false;
    try {
      this.parsedPath = new SvgPath(this.rawPath);
      this.reloadPoints();
      if (autozoom) {
        this.zoomAuto();
      }
    } catch {
      this.invalidSyntax = true;
      if (!this.parsedPath) {
        this.parsedPath = new SvgPath('');
      }
    }
  }

  reloadPoints(): void {
    this.targetPoints = this.parsedPath.targetLocations();
    this.controlPoints = this.parsedPath.controlLocations();
  }

  toggleLeftPanel(): void {
    this.isLeftPanelOpened = !this.isLeftPanelOpened;
  }

  deleteImage(image: Image): void {
    this.images.splice(this.images.indexOf(image), 1);
    this.focusedImage = null;
  }

  addImage(newImage: Image): void {
    this.focusedImage = newImage;
    this.images.push(newImage);
  }

  cancelAddImage(): void {
    if (this.images.length === 0) {
      this.isEditingImages = false;
      this.focusedImage = null;
    }
  }

  toggleImageEditing(upload: UploadImageComponent): void {
    this.isEditingImages = !this.isEditingImages;
    this.focusedImage = null;
    this.focusedItem = null;
    if (this.isEditingImages && this.images.length === 0) {
      upload.openDialog();
    }
  }

  createViewBox(): void {
    const width = Math.max(1, this.newViewBox.width);
    const height = Math.max(1, this.newViewBox.height);

    const viewBox = this.inflateViewBox({
      id: this.generateViewBoxId(),
      x: this.newViewBox.x,
      y: this.newViewBox.y,
      width,
      height,
      createdAt: new Date().toISOString(),
      patch: {
        rawPath: '',
        history: [],
        historyCursor: -1,
        localViewPort: {
          x: 0,
          y: 0,
          width,
          height
        }
      }
    });

    this.viewBoxes = [...this.viewBoxes, viewBox];
    this.persistViewBoxes();

    this.newViewBox = {
      x: this.newViewBox.x + 24,
      y: this.newViewBox.y + 24,
      width: this.newViewBox.width,
      height: this.newViewBox.height
    };
  }

  deleteViewBox(id: string): void {
    this.viewBoxes = this.viewBoxes.filter((viewBox) => viewBox.id !== id);
    this.persistViewBoxes();
  }

  focusItem(it: SvgItem | null): void {
    if (it !== this.focusedItem) {
      this.focusedItem = it;
      if (this.focusedItem) {
        const idx = this.parsedPath.path.indexOf(this.focusedItem);
        document.getElementById(`svg_command_row_${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  loadHallFragment(fragment: string, persist = true): void {
    this.hallFragment = fragment;
    this.hallError = '';

    const hall = this.extractHall(fragment);
    if (!hall) {
      this.hallHtml = null;
      this.hallWidth = 0;
      this.hallHeight = 0;
      this.hallError = 'div.hall не найден';
      if (persist) {
        this.storage.removeHallHtml();
      }
      return;
    }

    this.hallHtml = this.domSanitizer.bypassSecurityTrustHtml(this.decorateHallMarkup(hall.markup, hall.width, hall.height));
    this.hallWidth = hall.width;
    this.hallHeight = hall.height;

    this.updateViewPort(0, 0, hall.width, hall.height, true);

    if (persist) {
      this.storage.setHallHtml(fragment);
    }

    setTimeout(() => {
      this.canvas?.refreshCanvasSize();
      this.zoomAuto();
    }, 0);
  }

  clearHall(): void {
    this.hallFragment = '';
    this.hallHtml = null;
    this.hallWidth = 0;
    this.hallHeight = 0;
    this.hallError = '';
    this.storage.removeHallHtml();

    setTimeout(() => {
      this.canvas?.refreshCanvasSize();
    }, 0);
  }

  private persistViewBoxes(): void {
    this.storage.setViewBoxes(this.viewBoxes.map((viewBox) => this.serializeViewBox(viewBox)));
  }

  private serializeViewBox(viewBox: ViewBoxEntity): StoredViewBox {
    return {
      id: viewBox.id,
      x: viewBox.x,
      y: viewBox.y,
      width: viewBox.width,
      height: viewBox.height,
      createdAt: viewBox.createdAt,
      patch: {
        rawPath: viewBox.patch.rawPath,
        history: [...viewBox.patch.history],
        historyCursor: viewBox.patch.historyCursor,
        localViewPort: {
          x: 0,
          y: 0,
          width: viewBox.width,
          height: viewBox.height
        }
      }
    };
  }

  private inflateViewBox(viewBox: StoredViewBox): ViewBoxEntity {
    const width = Math.max(1, viewBox.width);
    const height = Math.max(1, viewBox.height);

    return {
      id: viewBox.id || this.generateViewBoxId(),
      x: viewBox.x,
      y: viewBox.y,
      width,
      height,
      createdAt: viewBox.createdAt || new Date().toISOString(),
      patch: this.createViewBoxPatchContext(
        width,
        height,
        viewBox.patch?.rawPath || '',
        viewBox.patch?.history || [],
        viewBox.patch?.historyCursor ?? -1
      )
    };
  }

  private createViewBoxPatchContext(
    width: number,
    height: number,
    rawPath = '',
    history: string[] = [],
    historyCursor = -1
  ): ViewBoxPatchContext {
    let parsedPath = new SvgPath('');
    let safeRawPath = '';

    try {
      if (rawPath) {
        parsedPath = new SvgPath(rawPath);
        safeRawPath = rawPath;
      }
    } catch {
      parsedPath = new SvgPath('');
      safeRawPath = '';
    }

    const normalizedHistory = history.length > 0 ? [...history] : (safeRawPath ? [safeRawPath] : []);
    const normalizedCursor = normalizedHistory.length > 0
      ? Math.min(Math.max(historyCursor, 0), normalizedHistory.length - 1)
      : -1;

    return {
      rawPath: safeRawPath,
      parsedPath,
      targetPoints: parsedPath.targetLocations(),
      controlPoints: parsedPath.controlLocations(),
      history: normalizedHistory,
      historyCursor: normalizedCursor,
      localViewPort: {
        x: 0,
        y: 0,
        width,
        height
      }
    };
  }

  private generateViewBoxId(): string {
    return `viewBox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  private decorateHallMarkup(markup: string, width: number, height: number): string {
    const hallFallbackStyles = `
      <style>${DEFAULT_HALL_CSS}</style>
      <style>
        .hall {
          position: relative !important;
          display: block;
          overflow: visible;
          transform-origin: top left;
          width: ${width}px;
          height: ${height}px;
        }

        .hall,
        .hall * {
          box-sizing: border-box;
          color: #000000 !important;
        }

        .hall [generated_object] {
          display: block;
        }

        .hall svg {
          overflow: visible;
        }
      </style>
    `;

    return `${hallFallbackStyles}${markup}`;
  }

  private extractHall(fragment: string): ExtractedHall | null {
    if (!fragment.trim()) {
      return null;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(fragment, 'text/html');

    const rootHall = Array.from(doc.body.children).find((node): node is HTMLElement => {
      return node instanceof HTMLElement && node.classList.contains('hall');
    });

    const hall = rootHall || doc.body.querySelector('div.hall');

    if (!(hall instanceof HTMLElement)) {
      return null;
    }

    const width = this.readHallDimension(hall, 'width');
    const height = this.readHallDimension(hall, 'height');

    if (width <= 0 || height <= 0) {
      return null;
    }

    const externalAssets = Array.from(doc.querySelectorAll('style, link[rel="stylesheet"]'))
      .filter((node) => !hall.contains(node))
      .map((node) => node.outerHTML)
      .join('\n');

    return {
      markup: `${externalAssets}${hall.outerHTML}`,
      width,
      height
    };
  }

  private readHallDimension(hall: HTMLElement, dimension: 'width' | 'height'): number {
    const directStyleValue = hall.style[dimension];
    const directParsed = this.parsePixelValue(directStyleValue);
    if (directParsed > 0) {
      return directParsed;
    }

    const styleAttr = hall.getAttribute('style') || '';
    const regex = new RegExp(`${dimension}\\s*:\\s*([\\d.]+)px`, 'i');
    const matched = styleAttr.match(regex);
    if (matched) {
      return parseFloat(matched[1]);
    }

    const attrValue = hall.getAttribute(dimension);
    if (attrValue) {
      const attrParsed = this.parsePixelValue(attrValue);
      if (attrParsed > 0) {
        return attrParsed;
      }
    }

    return 0;
  }

  private parsePixelValue(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized.endsWith('px')) {
      return parseFloat(normalized.slice(0, -2));
    }

    const numeric = parseFloat(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
  }
}
