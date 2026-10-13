import { Keyboard } from './keyboard';
import { VirtualJoystick } from './virtual-joystick';

const TOUCH_LOOK_SENSITIVITY = 0.006; // рад на пиксель
const MOUSE_LOOK_SENSITIVITY = 0.004;
const JOYSTICK_ZONE = 0.45; // левые 45% экрана — зона джойстика

interface ControlsElements {
  surface: HTMLElement;
  joystickBase: HTMLElement;
  joystickKnob: HTMLElement;
  jumpButton: HTMLElement;
}

/**
 * Собирает весь ввод в одном месте: тач, мышь, клавиатура.
 *
 * Pointer Events объединяют мышь и тач в один API, а pointerId позволяет
 * различать пальцы: левый палец водит джойстик, правый — крутит камеру, одновременно.
 */
export class Controls {
  /** false — ввод игнорируется (открыто меню). */
  enabled = true;

  private readonly joystick: VirtualJoystick;
  private readonly keyboard = new Keyboard();
  private lookPointerId: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;
  private lookSensitivity = TOUCH_LOOK_SENSITIVITY;
  private lookDx = 0;
  private lookDy = 0;
  private jumpQueued = false;
  /** Одноразовый перехватчик касания (режим пипетки). */
  private tapHandler: ((x: number, y: number) => void) | null = null;

  constructor(el: ControlsElements) {
    this.joystick = new VirtualJoystick(el.joystickBase, el.joystickKnob);
    this.keyboard.onJump = () => (this.jumpQueued = true);

    const surface = el.surface;
    surface.addEventListener('pointerdown', (e) => this.onDown(e));
    surface.addEventListener('pointermove', (e) => this.onMove(e));
    surface.addEventListener('pointerup', (e) => this.onUp(e));
    surface.addEventListener('pointercancel', (e) => this.onUp(e));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());

    el.jumpButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.jumpQueued = true;
    });
  }

  /** Движение: x — вправо, y — вперёд. Тач важнее клавиатуры. */
  moveAxis(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    if (this.joystick.pointerId !== null) return this.joystick.value;
    const axis = this.keyboard.axis();
    const len = Math.hypot(axis.x, axis.y);
    return len > 1 ? { x: axis.x / len, y: axis.y / len } : axis;
  }

  /** Накопленный с прошлого кадра поворот камеры (в радианах). Чтение сбрасывает счётчик. */
  consumeLook(): { dx: number; dy: number } {
    const look = { dx: this.lookDx, dy: this.lookDy };
    this.lookDx = this.lookDy = 0;
    return look;
  }

  /**
   * Нажатие прыжка «запоминается» до ближайшего шага физики.
   * Иначе короткий тап между двумя шагами физики потерялся бы.
   */
  consumeJump(): boolean {
    const jump = this.jumpQueued && this.enabled;
    this.jumpQueued = false;
    return jump;
  }

  /** Следующее касание экрана уйдёт в handler, а не в джойстик или камеру. */
  captureNextTap(handler: (x: number, y: number) => void): void {
    this.tapHandler = handler;
  }

  cancelTapCapture(): void {
    this.tapHandler = null;
  }

  private onDown(e: PointerEvent) {
    if (this.tapHandler) {
      const handler = this.tapHandler;
      this.tapHandler = null;
      handler(e.clientX, e.clientY);
      return;
    }
    const isTouch = e.pointerType !== 'mouse';
    if (isTouch && this.joystick.pointerId === null && e.clientX < window.innerWidth * JOYSTICK_ZONE) {
      this.joystick.start(e);
    } else if (this.lookPointerId === null) {
      this.lookPointerId = e.pointerId;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
      this.lookSensitivity = isTouch ? TOUCH_LOOK_SENSITIVITY : MOUSE_LOOK_SENSITIVITY;
    } else {
      return;
    }
    // Capture: события этого пальца продолжают приходить, даже если он ушёл за пределы элемента.
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  private onMove(e: PointerEvent) {
    if (e.pointerId === this.joystick.pointerId) {
      this.joystick.move(e);
    } else if (e.pointerId === this.lookPointerId) {
      this.lookDx += (e.clientX - this.lastLookX) * this.lookSensitivity;
      this.lookDy += (e.clientY - this.lastLookY) * this.lookSensitivity;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
    }
  }

  private onUp(e: PointerEvent) {
    if (e.pointerId === this.joystick.pointerId) this.joystick.end();
    if (e.pointerId === this.lookPointerId) this.lookPointerId = null;
  }
}
