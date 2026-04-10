import { AfterViewInit, Component, ElementRef, EventEmitter, HostBinding, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { Subject } from 'rxjs';
import { buffer, map, throttleTime } from 'rxjs/operators';
import { Image } from '../image';
import { Point, SvgPath, SvgControlPoint, SvgItem, SvgPoint } from '../../lib/svg';

/* eslint-disable @angular-eslint/component-selector */
@Component({
  selector: '[app-canvas]',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css']
})
export class CanvasComponent implements OnInit, OnChanges, AfterViewInit {
  get canvasWidth(): number { return this._canvasWidth; }
  set canvasWidth(canvasWidth: number) { this._canvasWidth = canvasWidth; this.canvasWidthChange.emit(this._canvasWidth); }
  get canvasHeight(): number { return this._canvasHeight; }
  set canvasHeight(canvasHeight: number) { this._canvasHeight = canvasHeight; this.canvasHeightChange.emit(this._canvasHeight); }
  get draggedPoint(): SvgPoint | null { return this._draggedPoint; }
  @Input() set draggedPoint(draggedPoint: SvgPoint| null ) { this._draggedPoint = draggedPoint; this.draggedPointChange.emit(this.draggedPoint); }
  get focusedItem(): SvgItem | null { return this._focusedItem; }
  @Input() set focusedItem(focusedItem: SvgItem | null) { this._focusedItem = focusedItem; this.focusedItemChange.emit(this.focusedItem); }
  get hoveredItem(): SvgItem | null { return this._hoveredItem; }
  @Input() set hoveredItem(hoveredItem: SvgItem | null ) { this._hoveredItem = hoveredItem; this.hoveredItemChange.emit(this.hoveredItem); }
  get wasCanvasDragged(): boolean { return this._wasCanvasDragged; }
  @Input() set wasCanvasDragged(wasCanvasDragged: boolean) {
    this._wasCanvasDragged = wasCanvasDragged;
    this.wasCanvasDraggedChange.emit(this._wasCanvasDragged);
  }
  get focusedImage(): Image | null { return this._focusedImage; }
  @Input() set focusedImage(focusedImage: Image | null) { this._focusedImage = focusedImage; this.focusedImageChange.emit(this.focusedImage); }

  constructor(public canvas: ElementRef) { }
  @Input() parsedPath?: SvgPath;
  @Input() displayPath = '';
  @Input() targetPoints: SvgPoint[] = [];
  @Input() controlPoints: SvgControlPoint[] = [];
  @Input() hasHallBackground = false;
  @Input() pathLocalMode = false;
  @Input() patchOffsetX = 0;
  @Input() patchOffsetY = 0;
  @Input() patchWidth = 0;
  @Input() patchHeight = 0;
  @Input() patchViewPortX = 0;
  @Input() patchViewPortY = 0;
  @Input() pathStrokeWidth = 1;
  @Input() pathStrokeLinejoin: string | null = null;
  @Input() pathStrokeLinecap: string | null = null;

  @HostBinding('class.has-hall-background')
  get hasHallBackgroundClass(): boolean {
    return this.hasHallBackground;
  }

  @Input() decimals?: number;
  @Input() viewPortX = 0;
  @Input() viewPortY = 0;
  @Input() viewPortWidth = 0;
  @Input() viewPortHeight = 0;
  @Input() strokeWidth = 1;
  @Input() preview = false;
  @Input() filled = false;
  @Input() showTicks = false;
  @Input() tickInterval = 1;
  @Input() draggedIsNew = false;
  @Input() images: Image[] = [];
  @Input() editImages = true;

  @Output() afterModelChange = new EventEmitter<void>();
  @Output() dragging = new EventEmitter<boolean>();
  @Output() viewPort = new EventEmitter<{x: number, y: number, w: number, h: number | null, force?: boolean}>();
  @Output() hoverPosition = new EventEmitter<{x: number, y: number} | undefined>();
  @Output() cursorPosition = new EventEmitter<Point & {decimals?: number} | undefined>();

  @Output() emptyCanvas = new EventEmitter<void>();

  _canvasWidth = 0;
  @Output() canvasWidthChange = new EventEmitter<number>();

  _canvasHeight = 0;
  @Output() canvasHeightChange = new EventEmitter<number>();

  _draggedPoint: SvgPoint | null = null;
  @Output() draggedPointChange = new EventEmitter<SvgPoint | null>();

  _focusedItem: SvgItem | null = null;
  @Output() focusedItemChange = new EventEmitter<SvgItem | null>();

  _hoveredItem: SvgItem | null = null;
  @Output() hoveredItemChange = new EventEmitter<SvgItem | null>();

  _wasCanvasDragged = false;
  @Output() wasCanvasDraggedChange = new EventEmitter<boolean>();

  _focusedImage: Image | null = null;
  @Output() focusedImageChange = new EventEmitter<Image | null>();

  draggedEvt: MouseEvent | TouchEvent | null = null;
  wheel$ = new Subject<WheelEvent>();
  dragWithoutClick = true;
  draggedImage: Image | null = null;
  draggedImageType = 0;
  xGrid: number[] = [];
  yGrid: number[] = [];

  min = Math.min;
  abs = Math.abs;
  trackByIndex = (idx: number, _: unknown) => idx;

  get hasPathBounds(): boolean {
    return this.pathLocalMode && this.patchWidth > 0 && this.patchHeight > 0;
  }

  get pathBoundsMinX(): number {
    return this.hasPathBounds ? this.patchViewPortX : 0;
  }

  get pathBoundsMinY(): number {
    return this.hasPathBounds ? this.patchViewPortY : 0;
  }

  get pathBoundsMaxX(): number {
    return this.hasPathBounds ? this.patchViewPortX + this.patchWidth : 0;
  }

  get pathBoundsMaxY(): number {
    return this.hasPathBounds ? this.patchViewPortY + this.patchHeight : 0;
  }

  get pathTransform(): string | null {
    return this.hasPathBounds
      ? `translate(${this.patchOffsetX - this.patchViewPortX} ${this.patchOffsetY - this.patchViewPortY})`
      : null;
  }

  get pathClipId(): string {
    return 'active-viewbox-path-clip';
  }

  get pathClipUrl(): string | null {
    return this.hasPathBounds ? `url(#${this.pathClipId})` : null;
  }

  get renderedPathD(): string {
    return this.displayPath || this.parsedPath?.asString() || '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['viewPortX'] || changes['viewPortY'] || changes['viewPortWidth'] || changes['viewPortHeight']) {
      this.refreshGrid();
    }
    if (changes['draggedPoint'] && changes['draggedPoint'].currentValue) {
      this.startDrag(changes['draggedPoint'].currentValue);
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.refreshCanvasSize(true);
    });
    window.addEventListener('resize', () => {
      this.refreshCanvasSize(true);
    });
    window.addEventListener('wheel', () => { /* safari workaround */ });
  }

  ngOnInit(): void {
    const cap = (val:number, max:number) => val > max ? max : val < -max ? -max : val;
    const throttler = throttleTime(20, undefined, {leading: false, trailing: true});
    this.wheel$
      .pipe(buffer(this.wheel$.pipe(throttler)))
      .pipe(map(ev => ({ event: ev[0], deltaY: ev.reduce((acc, cur) => acc + cap(cur.deltaY, 50), 0) })))
      .subscribe(this.mousewheel.bind(this));
  }

  @HostListener('mousedown', ['$event']) onMouseDown($event: MouseEvent) {
    this.startDragCanvas($event);
    $event.stopPropagation();
  }
  @HostListener('mousemove', ['$event']) onMouseMove($event: MouseEvent) {
    this.drag($event);
  }
  @HostListener('mouseup', ['$event'])  onMouseUp() {
    this.stopDrag();
  }
  @HostListener('touchstart', ['$event']) onTouchStart($event: TouchEvent) {
    this.startDragCanvas($event);
    $event.preventDefault();
    $event.stopPropagation();
  }
  @HostListener('touchmove', ['$event']) onTouchMove($event: TouchEvent) {
    this.drag($event);
  }
  @HostListener('touchend', ['$event']) onTouchEnd() {
    this.stopDrag();
  }
  @HostListener('wheel', ['$event']) onWheel($event: WheelEvent) {
    this.wheel$.next($event);
  }
  @HostListener('click', ['$event']) onClick() {
    this.hoveredItem = null;
  }

  refreshCanvasSize(emitEmptyCanvas = false) {
    const rect = this.canvas.nativeElement.parentNode.getBoundingClientRect();
    if (rect.width === 0 && emitEmptyCanvas) {
      this.emptyCanvas.emit();
    }

    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;
    this.refreshGrid();
  }

  refreshGrid() {
    if (5 * this.viewPortWidth <= this.canvasWidth) {
      this.xGrid = Array(Math.ceil(this.viewPortWidth) + 1).fill(null).map((_, i) => Math.floor(this.viewPortX) + i);
      this.yGrid = Array(Math.ceil(this.viewPortHeight) + 1).fill(null).map((_, i) => Math.floor(this.viewPortY) + i);
    } else {
      this.xGrid = [];
      this.yGrid = [];
    }
  }

  private getRenderedViewMetrics(rect: DOMRect): { scale: number; offsetX: number; offsetY: number } {
    if (rect.width <= 0 || rect.height <= 0 || this.viewPortWidth <= 0 || this.viewPortHeight <= 0) {
      return { scale: 1, offsetX: 0, offsetY: 0 };
    }

    const scale = Math.min(rect.width / this.viewPortWidth, rect.height / this.viewPortHeight);
    const offsetX = (rect.width - (this.viewPortWidth * scale)) / 2;
    const offsetY = (rect.height - (this.viewPortHeight * scale)) / 2;
    return { scale, offsetX, offsetY };
  }

  eventToLocation(event: MouseEvent | TouchEvent, idx = 0): {x: number, y: number} {
    const rect = this.canvas.nativeElement.getBoundingClientRect();
    const touch = event instanceof MouseEvent ? event : event.touches[idx];
    const metrics = this.getRenderedViewMetrics(rect);
    const localX = touch.clientX - rect.left - metrics.offsetX;
    const localY = touch.clientY - rect.top - metrics.offsetY;
    const x = this.viewPortX + (localX / metrics.scale);
    const y = this.viewPortY + (localY / metrics.scale);
    return {x, y};
  }

  toPathLocation(point: {x: number, y: number}): {x: number, y: number} {
    return {
      x: point.x - this.patchOffsetX + this.patchViewPortX,
      y: point.y - this.patchOffsetY + this.patchViewPortY
    };
  }

  clampToPathBounds(point: {x: number, y: number}): {x: number, y: number} {
    if (!this.hasPathBounds) {
      return point;
    }

    return {
      x: Math.min(this.pathBoundsMaxX, Math.max(this.pathBoundsMinX, point.x)),
      y: Math.min(this.pathBoundsMaxY, Math.max(this.pathBoundsMinY, point.y))
    };
  }

  isInsidePathBounds(point: {x: number, y: number}): boolean {
    if (!this.hasPathBounds) {
      return true;
    }

    return point.x >= this.pathBoundsMinX
      && point.y >= this.pathBoundsMinY
      && point.x <= this.pathBoundsMaxX
      && point.y <= this.pathBoundsMaxY;
  }

  pinchToZoom(previousEvent: MouseEvent | TouchEvent, event: MouseEvent | TouchEvent) {
    if (window.TouchEvent
      && previousEvent instanceof TouchEvent
      && event instanceof TouchEvent
      && previousEvent.touches.length >= 2
      && event.touches.length >= 2) {
      const pt = this.eventToLocation(event, 0);
      const pt2 = this.eventToLocation(event, 1);
      const oriPt = this.eventToLocation(previousEvent, 0);
      const oriPt2 = this.eventToLocation(previousEvent, 1);
      const ptm = {x: 0.5 * (pt.x + pt2.x), y: 0.5 * (pt.y + pt2.y)};
      const oriPtm = {x: 0.5 * (oriPt.x + oriPt2.x), y: 0.5 * (oriPt.y + oriPt2.y)};
      const delta = {x: oriPtm.x - ptm.x, y: oriPtm.y - ptm.y};
      const k = Math.sqrt((oriPt.x - oriPt2.x) ** 2 + (oriPt.y - oriPt2.y) ** 2) / Math.sqrt((pt.x - pt2.x) ** 2 + (pt.y - pt2.y) ** 2);
      return {zoom: k, delta, center: ptm};
    }
    return null;
  }

  mousewheel(event: {event: WheelEvent, deltaY: number}) {
    const scale = Math.pow(1.005, event.deltaY);
    const pt = this.eventToLocation(event.event);
    this.zoomViewPort(scale, pt);
  }

  zoomViewPort(scale: number, pt?: {x: number, y: number}) {
    if (!pt) {
      pt = {x: this.viewPortX + 0.5 * this.viewPortWidth, y: this.viewPortY + 0.5 * this.viewPortHeight};
    }
    const w = scale * this.viewPortWidth;
    const h = scale * this.viewPortHeight;
    const x = this.viewPortX + ((pt.x - this.viewPortX) - scale * (pt.x - this.viewPortX));
    const y = this.viewPortY + ((pt.y - this.viewPortY) - scale * (pt.y - this.viewPortY));
    this.viewPort.emit({x, y, w, h});
  }

  startDrag(item: SvgPoint) {
    if (item !== this.draggedPoint) {
      this.dragWithoutClick = false;
    }
    this.dragging.emit(true);
    this.setCursorPosition({...item, decimals: this.decimals});
    if (item.itemReference.getType().toLowerCase() === 'z') {
      return;
    }
    this.focusedItem = item.itemReference;
    this.draggedPoint = item;
  }

  startDragCanvas(event: MouseEvent | TouchEvent) {
    this.draggedEvt = event;
    this.wasCanvasDragged = false;
    this.dragWithoutClick = false;
  }

  startDragImage(event: MouseEvent | TouchEvent, im: Image, type: number): void {
    this.dragging.emit(true);
    this.draggedEvt = event;
    this.draggedImage = im;
    this.draggedImageType = type;
    this.focusedImage = im;
  }

  stopDrag() {
    if (this.draggedPoint && this.draggedEvt) {
      this.drag(this.draggedEvt);
    }
    this.dragging.emit(false);

    if (!this.draggedPoint && !this.wasCanvasDragged) {
      this.focusedItem = null;
      this.setCursorPosition(undefined);
    }
    if (!this.draggedImage && !this.wasCanvasDragged) {
      this.focusedImage = null;
    }

    this.draggedPoint = null;
    this.draggedEvt = null;
    this.dragWithoutClick = true;
    this.draggedImage = null;
  }

  drag(event: MouseEvent | TouchEvent) {
    const canvasPt = this.eventToLocation(event);
    const hoverPt = this.pathLocalMode ? this.toPathLocation(canvasPt) : canvasPt;
    this.hoverPosition.emit(this.isInsidePathBounds(hoverPt) ? hoverPt : undefined);

    if (this.draggedPoint || this.draggedEvt || this.draggedImage) {
      if (!this.dragWithoutClick && event instanceof MouseEvent && event.buttons === 0) {
        this.stopDrag();
        return;
      }

      event.stopPropagation();
      if (this.draggedImage && this.draggedEvt) {
        const oriPt = this.eventToLocation(this.draggedEvt);
        if (this.draggedImageType & 0b0001) this.draggedImage.x1 += (canvasPt.x - oriPt.x);
        if (this.draggedImageType & 0b0010) this.draggedImage.y1 += (canvasPt.y - oriPt.y);
        if (this.draggedImageType & 0b0100) this.draggedImage.x2 += (canvasPt.x - oriPt.x);
        if (this.draggedImageType & 0b1000) this.draggedImage.y2 += (canvasPt.y - oriPt.y);
        this.draggedEvt = event;
      } else if (this.draggedPoint && this.parsedPath) {
        let pt = this.pathLocalMode ? this.clampToPathBounds(this.toPathLocation(canvasPt)) : canvasPt;
        const decimals = event.ctrlKey ? (this.decimals ? 0 : 3) : this.decimals;
        pt = {
          x: parseFloat(pt.x.toFixed(decimals)),
          y: parseFloat(pt.y.toFixed(decimals))
        };
        this.parsedPath.setLocation(this.draggedPoint, pt as Point);
        if (this.draggedIsNew) {
          const previousIdx = this.parsedPath.path.indexOf(this.draggedPoint.itemReference) - 1;
          if (previousIdx >= 0) {
            this.draggedPoint.itemReference.resetControlPoints(this.parsedPath.path[previousIdx]);
          }
        }
        this.afterModelChange.emit();
        this.draggedEvt = null;
        this.setCursorPosition({...pt, decimals});
      } else if (this.draggedEvt) {
        this.wasCanvasDragged = true;
        this.hoverPosition.emit(undefined);
        const pinch = this.pinchToZoom(this.draggedEvt, event);
        if (pinch !== null) {
          const w = pinch.zoom * this.viewPortWidth;
          const h = pinch.zoom * this.viewPortHeight;
          const x = this.viewPortX + pinch.delta.x + (pinch.center.x - this.viewPortX) * (1 - pinch.zoom);
          const y = this.viewPortY + pinch.delta.y + (pinch.center.y - this.viewPortY) * (1 - pinch.zoom);
          this.viewPort.emit({x, y, w, h});
        } else {
          const oriPt = this.eventToLocation(this.draggedEvt);
          this.viewPort.emit({ x: this.viewPortX + (oriPt.x - canvasPt.x), y: this.viewPortY + (oriPt.y - canvasPt.y), w: this.viewPortWidth, h: this.viewPortHeight });
        }
        this.draggedEvt = event;
      }
    }
  }

  setCursorPosition(location?: {x: number, y: number, decimals?: number}) {
    this.cursorPosition.emit(location);
  }
}
