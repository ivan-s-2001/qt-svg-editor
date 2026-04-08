import { Component, AfterViewInit, HostListener, Inject, ViewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
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

type ViewBoxDragState = {
  viewBoxId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type ViewBoxHistoryEntry = {
  rawPath: string;
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type ViewBoxPatchContext = {
  rawPath: string;
  parsedPath: SvgPath;
  targetPoints: SvgPoint[];
  controlPoints: SvgControlPoint[];
  history: ViewBoxHistoryEntry[];
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
  name: string;
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
      state('*', style({ 'max-width': '368px' })),
      transition(':enter', [style({ 'max-width': '0' }), animate('100ms ease')]),
      transition(':leave', [animate('100ms ease', style({ 'max-width': '0' }))])
    ])
  ]
})
export class AppComponent implements AfterViewInit {
  parsedPath: SvgPath;
  targetPoints: SvgPoint[] = [];
  controlPoints: SvgControlPoint[] = [];

  _rawPath = '';
  pathName = '';
  invalidSyntax = false;

  history: ViewBoxHistoryEntry[] = [];
  historyCursor = -1;
  historyDisabled = false;

  scaleX = 1;
  scaleY = 1;
  translateX = 0;
  translateY = 0;
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
  activeViewBoxId: string | null = null;
  newViewBox: ViewBoxDraft = { x: 40, y: 40, width: 320, height: 240 };
  viewBoxDrag: ViewBoxDragState | null = null;

  isLeftPanelOpened = true;
  isContextualMenuOpened = false;
  isEditingImages = false;
  isViewBoxExportPopupOpen = false;
  isViewBoxExportCopied = false;
  isViewBoxSqlExportCopied = false;
  isAllViewBoxesExportPopupOpen = false;
  isAllViewBoxesExportCopied = false;
  viewBoxExportHallIdValue = '';
  allViewBoxesExportHallIdValue = '';

  max = Math.max;
  trackByIndex = (idx: number, _: unknown) => idx;
  trackByViewBoxId = (_: number, viewBox: ViewBoxEntity) => viewBox.id;
  formatNumber = (v: number) => formatNumber(v, 4);

  constructor(
    matRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer,
    @Inject(DOCUMENT) private document: Document,
    public cfg: ConfigService,
    private storage: StorageService
  ) {
    for (const icon of ['delete', 'logo', 'more', 'zoom_in', 'zoom_out', 'zoom_fit']) {
      matRegistry.addSvgIcon(icon, this.domSanitizer.bypassSecurityTrustResourceUrl(`./assets/${icon}.svg`));
    }

    this.parsedPath = new SvgPath('');
    this.cfg.preview = false;
    this.cfg.filled = false;
    this.cfg.showTicks = false;
    this.applyBranding();

    if (this.hallFragment) {
      this.loadHallFragment(this.hallFragment, false);
    }

    this.viewBoxes = this.storage.getViewBoxes().map((viewBox) => this.inflateViewBox(viewBox));
    this.activateViewBox(this.resolveInitialActiveViewBoxId());
  }

  @HostListener('document:keydown', ['$event']) onKeyDown($event: KeyboardEvent) {
    const tag = $event.target instanceof Element ? $event.target.tagName : null;

    if ($event.key === KEYBOARD.KEYS.ESCAPE) {
      if (this.isViewBoxExportPopupOpen) {
        this.closeViewBoxExportPopup();
        $event.preventDefault();
        return;
      }

      if (this.isAllViewBoxesExportPopupOpen) {
        this.closeAllViewBoxesExportPopup();
        $event.preventDefault();
        return;
      }
    }

    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      if ($event.shiftKey && ($event.metaKey || $event.ctrlKey) && $event.key.toLowerCase() === KEYBOARD.KEYS.UNDO) {
        this.redo();
        $event.preventDefault();
      } else if (($event.metaKey || $event.ctrlKey) && $event.key.toLowerCase() === KEYBOARD.KEYS.UNDO) {
        this.undo();
        $event.preventDefault();
      } else if (this.activeViewBox && !$event.metaKey && !$event.ctrlKey && KEYBOARD.PATTERNS.SVG_COMMAND.test($event.key)) {
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
          this.applyHistoryEntry(this.history[this.historyCursor]);
        } else if (this.canvas) {
          this.canvas.stopDrag();
        }
        $event.preventDefault();
      } else if (this.activeViewBox && !$event.metaKey && !$event.ctrlKey && ($event.key === KEYBOARD.KEYS.DELETE || $event.key === KEYBOARD.KEYS.BACKSPACE)) {
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

  @HostListener('document:pointermove', ['$event']) onPointerMove($event: PointerEvent) {
    const dragState = this.viewBoxDrag;
    if (!dragState || $event.pointerId !== dragState.pointerId) {
      return;
    }

    const viewBox = this.viewBoxes.find((item) => item.id === dragState.viewBoxId);
    if (!viewBox) {
      this.viewBoxDrag = null;
      return;
    }

    const workspaceScale = this.hallLayerScale || 1;
    const deltaX = ($event.clientX - dragState.startClientX) / workspaceScale;
    const deltaY = ($event.clientY - dragState.startClientY) / workspaceScale;
    const nextX = this.normalizeViewBoxCoordinate(dragState.startX + deltaX);
    const nextY = this.normalizeViewBoxCoordinate(dragState.startY + deltaY);

    if (nextX === viewBox.x && nextY === viewBox.y) {
      $event.preventDefault();
      return;
    }

    dragState.moved = true;
    viewBox.x = nextX;
    viewBox.y = nextY;
    this.viewBoxes = [...this.viewBoxes];
    $event.preventDefault();
  }

  @HostListener('document:pointerup', ['$event']) onPointerUp($event: PointerEvent) {
    this.finishViewBoxDrag($event.pointerId);
  }

  @HostListener('document:pointercancel', ['$event']) onPointerCancel($event: PointerEvent) {
    this.finishViewBoxDrag($event.pointerId);
  }

  get decimals() {
    return this.cfg.snapToGrid ? 0 : this.cfg.decimalPrecision;
  }

  get hasHall(): boolean {
    return this.hallWidth > 0 && this.hallHeight > 0 && !!this.hallHtml;
  }

  get activeViewBox(): ViewBoxEntity | null {
    return this.viewBoxes.find((viewBox) => viewBox.id === this.activeViewBoxId) || null;
  }

  get hallPanelInfo(): string {
    return this.hasHall ? `${this.hallWidth}×${this.hallHeight}` : 'не загружено';
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

  get activeViewBoxPanelInfo(): string {
    return this.activeViewBox ? this.activeViewBox.name : 'не выбран';
  }

  get canCreateViewBox(): boolean {
    return this.newViewBox.width > 0 && this.newViewBox.height > 0;
  }

  get activePatchOffsetX(): number {
    return this.activeViewBox?.x || 0;
  }

  get activePatchOffsetY(): number {
    return this.activeViewBox?.y || 0;
  }

  get activePatchWidth(): number {
    return this.activeViewBox?.width || 0;
  }

  get activePatchHeight(): number {
    return this.activeViewBox?.height || 0;
  }

  get activeViewBoxCenterX(): number {
    return this.activeViewBox ? this.activeViewBox.width / 2 : 0;
  }

  get activeViewBoxCenterY(): number {
    return this.activeViewBox ? this.activeViewBox.height / 2 : 0;
  }

  get activeViewBoxExportText(): string {
    const activeViewBox = this.activeViewBox;
    if (!activeViewBox) {
      return '';
    }

    const pathD = activeViewBox.patch.rawPath || this._rawPath || '';

    return [
      `x - ${activeViewBox.x} (@x сейчас для логики)`,
      `y - ${activeViewBox.y} (@y сейчас для логики)`,
      `width - ${activeViewBox.width} (@width сейчас для логики)`,
      `heght - ${activeViewBox.height} (@heght сейчас для логики)`,
      'param -',
      '"',
      '<div style="',
      '    position:absolute;',
      '    width:@x;',
      '    height:@y;',
      '    box-sizing:border-box;',
      '  " generated_object>',
      '    <svg viewBox="0 0 @width @heght" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;" xmlns="http://www.w3.org/2000/svg">',
      `      <path d="${pathD}" fill="none" stroke="#000" stroke-width="1" />`,
      '    </svg>',
      '  </div>',
      '"'
    ].join('\n');
  }


  get activeViewBoxSqlExportText(): string {
    const activeViewBox = this.activeViewBox;
    if (!activeViewBox) {
      return '';
    }

    return this.buildViewBoxesSqlInsert([activeViewBox], this.viewBoxExportHallIdValue);
  }

  get allViewBoxesSqlExportText(): string {
    return this.buildViewBoxesSqlInsert(this.viewBoxes, this.allViewBoxesExportHallIdValue);
  }

  isDraggingViewBoxLabel(viewBoxId: string): boolean {
    return this.viewBoxDrag?.viewBoxId === viewBoxId;
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
    const patch = this.getActivePatchContext();
    if (patch) {
      patch.rawPath = value;
    }
    this.pushHistory();
  }

  setIsDragging(dragging: boolean) {
    this.dragging = dragging;
    this.setHistoryDisabled(dragging);
    if (!dragging) {
      this.draggedIsNew = false;
      this.persistViewBoxes();
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
      this.syncActivePatchFromEditor();
    }
  }

  pushHistory() {
    if (this.historyDisabled) {
      return;
    }

    const nextEntry = this.createCurrentHistoryEntry();
    const currentEntry = this.history[this.historyCursor];

    if (currentEntry && this.areHistoryEntriesEqual(currentEntry, nextEntry)) {
      return;
    }

    this.historyCursor++;
    this.history.splice(this.historyCursor, this.history.length - this.historyCursor, nextEntry);
    this.storage.addPath(null, nextEntry.rawPath);

    const patch = this.getActivePatchContext();
    if (patch) {
      patch.history = this.history;
      patch.historyCursor = this.historyCursor;
      this.persistViewBoxes();
    }
  }

  canUndo(): boolean {
    return this.historyCursor > 0 && !this.isEditingImages && !!this.activeViewBox;
  }

  undo() {
    if (this.canUndo()) {
      this.historyDisabled = true;
      this.historyCursor--;
      this.applyHistoryEntry(this.history[this.historyCursor]);
      this.historyDisabled = false;
      this.syncActivePatchFromEditor();
    }
  }

  canRedo(): boolean {
    return this.historyCursor < this.history.length - 1 && !this.isEditingImages && !!this.activeViewBox;
  }

  redo() {
    if (this.canRedo()) {
      this.historyDisabled = true;
      this.historyCursor++;
      this.applyHistoryEntry(this.history[this.historyCursor]);
      this.historyDisabled = false;
      this.syncActivePatchFromEditor();
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
    if (!this.activeViewBox) {
      return;
    }

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

    if (!this.rawPath) {
      this.updateViewPort(0, 0, 100, 100, true);
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
    const viewBox = this.activeViewBox;
    if (!viewBox || !Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0 || (x === 1 && y === 1)) {
      return;
    }

    const currentX = viewBox.x;
    const currentY = viewBox.y;
    const nextWidth = viewBox.width * x;
    const nextHeight = viewBox.height * y;
    const worldLeft = currentX + Math.min(0, nextWidth);
    const worldTop = currentY + Math.min(0, nextHeight);
    const worldRight = currentX + Math.max(0, nextWidth);
    const worldBottom = currentY + Math.max(0, nextHeight);
    const localOriginOffsetX = -Math.min(0, nextWidth);
    const localOriginOffsetY = -Math.min(0, nextHeight);

    this.parsedPath.scale(x, y);

    if (localOriginOffsetX !== 0 || localOriginOffsetY !== 0) {
      this.parsedPath.translate(localOriginOffsetX, localOriginOffsetY);
    }

    const nextX = Math.floor(worldLeft);
    const nextY = Math.floor(worldTop);
    const nextRight = Math.ceil(worldRight);
    const nextBottom = Math.ceil(worldBottom);
    const localOffsetX = worldLeft - nextX;
    const localOffsetY = worldTop - nextY;

    if (localOffsetX !== 0 || localOffsetY !== 0) {
      this.parsedPath.translate(localOffsetX, localOffsetY);
    }

    viewBox.x = nextX;
    viewBox.y = nextY;
    viewBox.width = Math.max(1, nextRight - nextX);
    viewBox.height = Math.max(1, nextBottom - nextY);

    this.scaleX = 1;
    this.scaleY = 1;
    this.viewBoxes = [...this.viewBoxes];
    this.afterModelChange();
  }

  translate(x: number, y: number) {
    const viewBox = this.activeViewBox;
    if (!viewBox || !Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) {
      return;
    }

    viewBox.x = this.normalizeViewBoxCoordinate(viewBox.x + x);
    viewBox.y = this.normalizeViewBoxCoordinate(viewBox.y + y);

    this.translateX = 0;
    this.translateY = 0;
    this.viewBoxes = [...this.viewBoxes];
    this.afterModelChange();
  }

  rotate(angle: number) {
    const viewBox = this.activeViewBox;
    if (!viewBox || !Number.isFinite(angle) || angle === 0 || this.parsedPath.path.length === 0) {
      return;
    }

    const currentX = viewBox.x;
    const currentY = viewBox.y;

    this.parsedPath.rotate(viewBox.width / 2, viewBox.height / 2, angle);

    const bbox = this.getParsedPathBoundingBox();
    if (!bbox) {
      return;
    }

    const worldLeft = currentX + bbox.x;
    const worldTop = currentY + bbox.y;
    const worldRight = worldLeft + bbox.width;
    const worldBottom = worldTop + bbox.height;

    const nextX = Math.floor(worldLeft);
    const nextY = Math.floor(worldTop);
    const nextRight = Math.ceil(worldRight);
    const nextBottom = Math.ceil(worldBottom);

    const localOffsetX = worldLeft - nextX;
    const localOffsetY = worldTop - nextY;

    this.parsedPath.translate(-bbox.x + localOffsetX, -bbox.y + localOffsetY);

    viewBox.x = nextX;
    viewBox.y = nextY;
    viewBox.width = Math.max(1, nextRight - nextX);
    viewBox.height = Math.max(1, nextBottom - nextY);

    this.rotateAngle = 0;
    this.viewBoxes = [...this.viewBoxes];
    this.afterModelChange();
  }

  fitViewBoxToPatch() {
    const viewBox = this.activeViewBox;
    if (!viewBox || this.parsedPath.path.length === 0) {
      return;
    }

    const bbox = this.getParsedPathBoundingBox();
    if (!bbox) {
      return;
    }

    const shiftX = -bbox.x;
    const shiftY = -bbox.y;

    if (shiftX !== 0 || shiftY !== 0) {
      this.parsedPath.translate(shiftX, shiftY);
    }

    viewBox.width = this.normalizeViewBoxSize(Math.ceil(bbox.width));
    viewBox.height = this.normalizeViewBoxSize(Math.ceil(bbox.height));
    viewBox.patch.localViewPort = {
      x: 0,
      y: 0,
      width: viewBox.width,
      height: viewBox.height
    };

    this.viewBoxes = [...this.viewBoxes];
    this.afterModelChange();
    this.pushHistory();
  }

  setRelative(rel: boolean) {
    if (!this.activeViewBox) {
      return;
    }
    this.parsedPath.setRelative(rel);
    this.afterModelChange();
  }

  reverse() {
    if (!this.activeViewBox) {
      return;
    }
    reversePath(this.parsedPath);
    this.afterModelChange();
  }

  optimize() {
    if (!this.activeViewBox) {
      return;
    }
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
    if (!this.activeViewBox) {
      return;
    }
    if (!isNaN(val)) {
      item.values[idx] = val;
      this.parsedPath.refreshAbsolutePositions();
      this.afterModelChange();
    }
  }

  delete(item: SvgItem) {
    if (!this.activeViewBox) {
      return;
    }
    this.focusedItem = null;
    this.parsedPath.delete(item);
    this.afterModelChange();
  }

  useAsOrigin(item: SvgItem, subpathOnly?: boolean) {
    if (!this.activeViewBox) {
      return;
    }
    const idx = this.parsedPath.path.indexOf(item);
    changePathOrigin(this.parsedPath, idx, subpathOnly);
    this.afterModelChange();
    this.focusedItem = null;
  }

  reverseSubPath(item: SvgItem) {
    if (!this.activeViewBox) {
      return;
    }
    const idx = this.parsedPath.path.indexOf(item);
    reversePath(this.parsedPath, idx);
    this.afterModelChange();
    this.focusedItem = null;
  }

  afterModelChange() {
    this.reloadPoints();
    this.rawPath = this.parsedPath.asString(4, this.cfg.minifyOutput);
    this.syncActivePatchFromEditor();
  }

  roundValues(decimals: number) {
    if (!this.activeViewBox) {
      return;
    }
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
      this.syncActivePatchFromEditor(false);
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
    this.syncActivePatchFromEditor(false);
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
    const x = this.normalizeViewBoxCoordinate(this.newViewBox.x);
    const y = this.normalizeViewBoxCoordinate(this.newViewBox.y);
    const width = this.normalizeViewBoxSize(this.newViewBox.width);
    const height = this.normalizeViewBoxSize(this.newViewBox.height);

    const viewBox = this.inflateViewBox({
      id: this.generateViewBoxId(),
      name: this.createDefaultViewBoxName(),
      x,
      y,
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
      x: x + 24,
      y: y + 24,
      width,
      height
    };

    this.selectViewBox(viewBox.id);
  }

  selectViewBox(id: string): void {
    this.activateViewBox(id);
  }

  openViewBoxExportPopup(viewBoxId: string): void {
    if (!this.activeViewBox || this.activeViewBox.id !== viewBoxId) {
      return;
    }

    this.isViewBoxExportCopied = false;
    this.isViewBoxSqlExportCopied = false;
    this.isViewBoxExportPopupOpen = true;
  }

  closeViewBoxExportPopup(): void {
    this.isViewBoxExportPopupOpen = false;
    this.isViewBoxExportCopied = false;
    this.isViewBoxSqlExportCopied = false;
  }

  async copyActiveViewBoxExportText(): Promise<void> {
    const text = this.activeViewBoxExportText;
    if (!text) {
      return;
    }

    this.isViewBoxExportCopied = await this.copyTextToClipboard(text);
  }

  updateViewBoxExportHallId(value: string): void {
    this.viewBoxExportHallIdValue = value;
    this.isViewBoxSqlExportCopied = false;
  }

  updateAllViewBoxesExportHallId(value: string): void {
    this.allViewBoxesExportHallIdValue = value;
    this.isAllViewBoxesExportCopied = false;
  }

  async copyActiveViewBoxSqlExportText(): Promise<void> {
    const text = this.activeViewBoxSqlExportText;
    if (!text) {
      return;
    }

    this.isViewBoxSqlExportCopied = await this.copyTextToClipboard(text);
  }

  openAllViewBoxesExportPopup(): void {
    if (this.viewBoxes.length === 0) {
      return;
    }

    this.isAllViewBoxesExportCopied = false;
    this.isAllViewBoxesExportPopupOpen = true;
  }

  closeAllViewBoxesExportPopup(): void {
    this.isAllViewBoxesExportPopupOpen = false;
    this.isAllViewBoxesExportCopied = false;
  }

  async copyAllViewBoxesSqlExportText(): Promise<void> {
    const text = this.allViewBoxesSqlExportText;
    if (!text) {
      return;
    }

    this.isAllViewBoxesExportCopied = await this.copyTextToClipboard(text);
  }

  updateViewBoxName(viewBoxId: string, value: string): void {
    const viewBox = this.viewBoxes.find((item) => item.id === viewBoxId);
    if (!viewBox) {
      return;
    }

    const fallbackName = this.getFallbackViewBoxName(viewBoxId);
    const normalizedName = this.normalizeViewBoxName(value, fallbackName);
    if (viewBox.name === normalizedName) {
      return;
    }

    viewBox.name = normalizedName;
    this.viewBoxes = [...this.viewBoxes];
    this.persistViewBoxes();
  }

  startViewBoxDrag(viewBoxId: string, $event: PointerEvent): void {
    const viewBox = this.viewBoxes.find((item) => item.id === viewBoxId);
    if (!viewBox) {
      return;
    }

    this.canvas?.stopDrag();
    this.viewBoxDrag = {
      viewBoxId,
      pointerId: $event.pointerId,
      startClientX: $event.clientX,
      startClientY: $event.clientY,
      startX: viewBox.x,
      startY: viewBox.y,
      moved: false
    };

    $event.preventDefault();
    $event.stopPropagation();
  }

  updateViewBoxValue(
    viewBoxId: string,
    field: 'x' | 'y' | 'width' | 'height',
    value: number
  ): void {
    const viewBox = this.viewBoxes.find((item) => item.id === viewBoxId);
    if (!viewBox || Number.isNaN(value)) {
      return;
    }

    const normalizedValue = field === 'width' || field === 'height'
      ? this.normalizeViewBoxSize(value)
      : this.normalizeViewBoxCoordinate(value);

    if (viewBox[field] === normalizedValue) {
      return;
    }

    viewBox[field] = normalizedValue;

    if (field === 'width' || field === 'height') {
      viewBox.patch.localViewPort.width = viewBox.width;
      viewBox.patch.localViewPort.height = viewBox.height;
    }

    this.viewBoxes = [...this.viewBoxes];

    if (this.activeViewBoxId === viewBoxId) {
      this.syncEditorFromViewBox(viewBox);
      this.syncActivePatchFromEditor(false);
      this.pushHistory();
      return;
    }

    this.persistViewBoxes();
  }

  deleteViewBox(id: string): void {
    const isDeletingActive = this.activeViewBoxId === id;
    this.viewBoxes = this.viewBoxes.filter((viewBox) => viewBox.id !== id);
    this.persistViewBoxes();

    if (isDeletingActive) {
      this.activateViewBox(null);
      return;
    }

    if (!this.viewBoxes.some((viewBox) => viewBox.id === this.activeViewBoxId)) {
      this.activateViewBox(null);
    }
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

  private finishViewBoxDrag(pointerId: number): void {
    const dragState = this.viewBoxDrag;
    if (!dragState || dragState.pointerId !== pointerId) {
      return;
    }

    const draggedViewBoxId = dragState.viewBoxId;
    const moved = dragState.moved;
    this.viewBoxDrag = null;

    if (!moved) {
      return;
    }

    this.viewBoxes = [...this.viewBoxes];
    if (this.activeViewBoxId === draggedViewBoxId) {
      this.pushHistory();
      return;
    }

    this.persistViewBoxes();
  }

  private createDefaultViewBoxName(): string {
    const existingNames = new Set(
      this.viewBoxes
        .map((viewBox) => viewBox.name.trim().toLowerCase())
        .filter((name) => !!name)
    );

    let index = 1;
    while (existingNames.has(`viewbox ${index}`.toLowerCase())) {
      index++;
    }

    return `ViewBox ${index}`;
  }

  private getFallbackViewBoxName(viewBoxId: string): string {
    const index = this.viewBoxes.findIndex((viewBox) => viewBox.id === viewBoxId);
    return `ViewBox ${index >= 0 ? index + 1 : 1}`;
  }

  private normalizeViewBoxName(value: string | null | undefined, fallbackName: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed || fallbackName;
  }

  private applyBranding(): void {
    this.document.title = 'Редактор patch/viewBox';
    this.updateBrandLink('icon', './assets/favicon-32x32.png');
    this.updateBrandLink('shortcut icon', './assets/favicon-32x32.png');
    this.updateBrandLink('apple-touch-icon', './assets/apple-touch-icon.png');
  }

  private updateBrandLink(rel: string, href: string): void {
    let link = this.document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
    if (!link) {
      link = this.document.createElement('link');
      link.rel = rel;
      this.document.head.appendChild(link);
    }

    link.href = href;
  }

  private resolveInitialActiveViewBoxId(): string | null {
    const storedActiveViewBoxId = this.storage.getActiveViewBoxId();
    if (storedActiveViewBoxId && this.viewBoxes.some((viewBox) => viewBox.id === storedActiveViewBoxId)) {
      return storedActiveViewBoxId;
    }
    return null;
  }

  private activateViewBox(id: string | null): void {
    const nextActiveId = id && this.viewBoxes.some((viewBox) => viewBox.id === id) ? id : null;
    this.activeViewBoxId = nextActiveId;
    this.closeViewBoxExportPopup();
    this.closeAllViewBoxesExportPopup();

    if (nextActiveId) {
      this.storage.setActiveViewBoxId(nextActiveId);
      const activeViewBox = this.viewBoxes.find((viewBox) => viewBox.id === nextActiveId);
      if (activeViewBox) {
        this.syncEditorFromViewBox(activeViewBox);
      }
      return;
    }

    this.storage.removeActiveViewBoxId();
    this.resetEditorState();
  }

  private syncEditorFromViewBox(viewBox: ViewBoxEntity): void {
    this.focusedItem = null;
    this.hoveredItem = null;
    this.draggedPoint = null;
    this.invalidSyntax = false;

    this.parsedPath = viewBox.patch.parsedPath;
    this.targetPoints = viewBox.patch.targetPoints;
    this.controlPoints = viewBox.patch.controlPoints;
    this._rawPath = viewBox.patch.rawPath;
    this.history = viewBox.patch.history;
    this.historyCursor = viewBox.patch.historyCursor;
  }

  private resetEditorState(): void {
    this.focusedItem = null;
    this.hoveredItem = null;
    this.draggedPoint = null;
    this.invalidSyntax = false;

    this.parsedPath = new SvgPath('');
    this.targetPoints = [];
    this.controlPoints = [];
    this._rawPath = '';
    this.history = [];
    this.historyCursor = -1;
  }

  private getActivePatchContext(): ViewBoxPatchContext | null {
    return this.activeViewBox?.patch || null;
  }

  private getParsedPathBoundingBox(): DOMRect | null {
    if (this.parsedPath.path.length === 0) {
      return null;
    }

    try {
      return browserComputePathBoundingBox(this.parsedPath.asString(6, this.cfg.minifyOutput));
    } catch {
      return null;
    }
  }

  private normalizeViewBoxCoordinate(value: number): number {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }

  private normalizeViewBoxSize(value: number): number {
    return Number.isFinite(value) && value > 0 ? Math.max(1, Math.ceil(value)) : 1;
  }

  private createCurrentHistoryEntry(): ViewBoxHistoryEntry {
    return this.createHistoryEntry(this.rawPath, this.activeViewBox);
  }

  private createHistoryEntry(
    rawPath: string,
    viewBox: Pick<ViewBoxEntity, 'x' | 'y' | 'width' | 'height'> | null | undefined
  ): ViewBoxHistoryEntry {
    return {
      rawPath,
      viewBox: {
        x: this.normalizeViewBoxCoordinate(viewBox?.x ?? 0),
        y: this.normalizeViewBoxCoordinate(viewBox?.y ?? 0),
        width: this.normalizeViewBoxSize(viewBox?.width ?? 1),
        height: this.normalizeViewBoxSize(viewBox?.height ?? 1)
      }
    };
  }

  private applyHistoryEntry(entry: ViewBoxHistoryEntry | undefined): void {
    if (!entry) {
      return;
    }

    const activeViewBox = this.activeViewBox;
    if (activeViewBox) {
      activeViewBox.x = this.normalizeViewBoxCoordinate(entry.viewBox.x);
      activeViewBox.y = this.normalizeViewBoxCoordinate(entry.viewBox.y);
      activeViewBox.width = this.normalizeViewBoxSize(entry.viewBox.width);
      activeViewBox.height = this.normalizeViewBoxSize(entry.viewBox.height);
      activeViewBox.patch.localViewPort = {
        x: 0,
        y: 0,
        width: activeViewBox.width,
        height: activeViewBox.height
      };
      this.viewBoxes = [...this.viewBoxes];
    }

    this.reloadPath(entry.rawPath);
  }

  private areHistoryEntriesEqual(a: ViewBoxHistoryEntry | undefined, b: ViewBoxHistoryEntry): boolean {
    if (!a) {
      return false;
    }

    return a.rawPath === b.rawPath
      && a.viewBox.x === b.viewBox.x
      && a.viewBox.y === b.viewBox.y
      && a.viewBox.width === b.viewBox.width
      && a.viewBox.height === b.viewBox.height;
  }

  private syncActivePatchFromEditor(persist = true): void {
    const activeViewBox = this.activeViewBox;
    if (!activeViewBox) {
      return;
    }

    activeViewBox.patch.parsedPath = this.parsedPath;
    activeViewBox.patch.targetPoints = this.targetPoints;
    activeViewBox.patch.controlPoints = this.controlPoints;
    activeViewBox.patch.rawPath = this._rawPath;
    activeViewBox.patch.history = this.history;
    activeViewBox.patch.historyCursor = this.historyCursor;
    activeViewBox.patch.localViewPort = {
      x: 0,
      y: 0,
      width: activeViewBox.width,
      height: activeViewBox.height
    };

    if (persist) {
      this.persistViewBoxes();
    }
  }


  private normalizeHallIdLiteral(value: string): string {
    const trimmed = value.trim();

    if (!trimmed) {
      return '#new_hall_id#';
    }

    return /^\d+$/.test(trimmed) ? trimmed : '#new_hall_id#';
  }

  private buildViewBoxesSqlInsert(viewBoxes: ViewBoxEntity[], hallIdValue: string): string {
    if (viewBoxes.length === 0) {
      return '';
    }

    const hallId = this.normalizeHallIdLiteral(hallIdValue);
    const rows = viewBoxes.map((viewBox) => this.buildViewBoxSqlRow(viewBox, hallId));

    return [
      'INSERT INTO `place` (`id`, `hall_id`, `stool_id`, `x`, `y`, `block`, `series`, `place`, `disabled`) VALUES',
      rows.map((row, index) => `${row}${index < rows.length - 1 ? ',' : ';'}`).join('\n')
    ].join('\n');
  }

  private buildViewBoxSqlRow(viewBox: ViewBoxEntity, hallId: string): string {
    const param = this.escapeSqlString(this.buildViewBoxParamMarkup(viewBox));

    return `(NULL, ${hallId}, ${viewBox.x}+0, ${viewBox.y}+0, ${viewBox.width}, ${viewBox.height}, 0, '${param}', 1)`;
  }

  private buildViewBoxParamMarkup(viewBox: ViewBoxEntity): string {
    const pathD = viewBox.patch.rawPath || '';

    return [
      '<div style="',
      '    position:absolute;',
      `    width:${viewBox.width}px;`,
      `    height:${viewBox.height}px;`,
      '    box-sizing:border-box;',
      '  " generated_object>',
      `    <svg viewBox="0 0 ${viewBox.width} ${viewBox.height}" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;" xmlns="http://www.w3.org/2000/svg">`,
      `      <path d="${pathD}" fill="none" stroke="#000" stroke-width="1" />`,
      '    </svg>',
      '  </div>'
    ].join('\n');
  }

  private escapeSqlString(value: string): string {
    return value
      .replace(/\r/g, '')
      .replace(/'/g, "''");
  }

  private async copyTextToClipboard(text: string): Promise<boolean> {
    let copied = false;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const textarea = this.document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      textarea.style.left = '-9999px';
      this.document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      try {
        copied = this.document.execCommand('copy');
      } catch {
        copied = false;
      }

      textarea.remove();
    }

    return copied;
  }

  private constrainViewBoxPatch(viewBox: ViewBoxEntity): void {
    this.constrainPathToBounds(viewBox.patch.parsedPath, viewBox.width, viewBox.height);
    viewBox.patch.targetPoints = viewBox.patch.parsedPath.targetLocations();
    viewBox.patch.controlPoints = viewBox.patch.parsedPath.controlLocations();
    viewBox.patch.rawPath = viewBox.patch.parsedPath.asString(4, this.cfg.minifyOutput);
  }

  private constrainPathToBounds(parsedPath: SvgPath, width: number, height: number): void {
    const clamp = (value: number, maxValue: number) => Math.min(maxValue, Math.max(0, value));
    const clampPoints = (points: Array<SvgPoint | SvgControlPoint>) => {
      for (const point of points) {
        if (!point.movable) {
          continue;
        }

        const clampedX = clamp(point.x, width);
        const clampedY = clamp(point.y, height);

        if (clampedX !== point.x || clampedY !== point.y) {
          parsedPath.setLocation(point, new Point(clampedX, clampedY));
        }
      }
    };

    clampPoints(parsedPath.targetLocations());
    clampPoints(parsedPath.controlLocations());
  }

  private persistViewBoxes(): void {
    this.storage.setViewBoxes(this.viewBoxes.map((viewBox) => this.serializeViewBox(viewBox)));
  }

  private serializeViewBox(viewBox: ViewBoxEntity): StoredViewBox {
    return {
      id: viewBox.id,
      name: this.normalizeViewBoxName(viewBox.name, this.getFallbackViewBoxName(viewBox.id)),
      x: this.normalizeViewBoxCoordinate(viewBox.x),
      y: this.normalizeViewBoxCoordinate(viewBox.y),
      width: this.normalizeViewBoxSize(viewBox.width),
      height: this.normalizeViewBoxSize(viewBox.height),
      createdAt: viewBox.createdAt,
      patch: {
        rawPath: viewBox.patch.rawPath,
        history: viewBox.patch.history.map((entry) => ({
          rawPath: entry.rawPath,
          viewBox: {
            x: this.normalizeViewBoxCoordinate(entry.viewBox.x),
            y: this.normalizeViewBoxCoordinate(entry.viewBox.y),
            width: this.normalizeViewBoxSize(entry.viewBox.width),
            height: this.normalizeViewBoxSize(entry.viewBox.height)
          }
        })),
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
    const width = this.normalizeViewBoxSize(viewBox.width);
    const height = this.normalizeViewBoxSize(viewBox.height);

    const id = viewBox.id || this.generateViewBoxId();

    return {
      id,
      name: this.normalizeViewBoxName(viewBox.name, `ViewBox ${this.viewBoxes.length + 1}`),
      x: this.normalizeViewBoxCoordinate(viewBox.x),
      y: this.normalizeViewBoxCoordinate(viewBox.y),
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
    history: ViewBoxHistoryEntry[] = [],
    historyCursor = -1
  ): ViewBoxPatchContext {
    let parsedPath = new SvgPath('');
    let safeRawPath = '';

    try {
      if (rawPath) {
        parsedPath = new SvgPath(rawPath);
        safeRawPath = parsedPath.asString(4, this.cfg.minifyOutput);
      }
    } catch {
      parsedPath = new SvgPath('');
      safeRawPath = '';
    }

    const normalizedHistory = history.length > 0
      ? history.map((entry) => ({
          rawPath: entry.rawPath,
          viewBox: {
            x: this.normalizeViewBoxCoordinate(entry.viewBox.x),
            y: this.normalizeViewBoxCoordinate(entry.viewBox.y),
            width: this.normalizeViewBoxSize(entry.viewBox.width),
            height: this.normalizeViewBoxSize(entry.viewBox.height)
          }
        }))
      : (safeRawPath ? [this.createHistoryEntry(safeRawPath, { x: 0, y: 0, width, height })] : []);
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
          background: #ffffff;
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
