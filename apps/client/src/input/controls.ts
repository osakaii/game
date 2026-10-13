import { Keyboard } from './keyboard';
import { VirtualJoystick } from './virtual-joystick';

const TOUCH_LOOK_SENSITIVITY = 0.006; // рад на пиксель
const MOUSE_LOOK_SENSITIVITY = 0.004;
const JOYSTICK_ZONE = 0.45; // левые 45% экрана — зона джойстика
/** Тап = палец сдвинулся меньше чем на TAP_SLOP пикселей и отпущен быстрее TAP_MAX_MS. Иначе это поворот камеры. */
const TAP_SLOP = 10;
const TAP_MAX_MS = 300;

interface ControlsElements {
  surface: HTMLElement;
  joystickBase: HTMLElement;
  joystickKnob: HTMLElement;
  jumpButton: HTMLElement;
  crouchButton: HTMLElement;
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
  /**
   * Присед — переключатель, а не «держать»: на телефоне держать кнопку и одновременно
   * водить джойстиком и камерой неудобно, пальцев не хватает.
   */
  crouch = false;
  private readonly crouchButton: HTMLElement;

  private readonly joystick: VirtualJoystick;
  private readonly keyboard = new Keyboard();
  private lookPointerId: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;
  private lookSensitivity = TOUCH_LOOK_SENSITIVITY;
  private lookDx = 0;
  private lookDy = 0;
  private jumpQueued = false;
  /** Короткий тап по экрану (не по джойстику). Ищущий так проверяет места. */
  onTap: ((x: number, y: number) => void) | null = null;
  private lookStartX = 0;
  private lookStartY = 0;
  private lookStartTime = 0;
  private lookIsTap = false;

  /** Одноразовый перехватчик касания (режим пипетки). */
  private tapHandler: ((x: number, y: number) => void) | null = null;

  constructor(el: ControlsElements) {
    this.joystick = new VirtualJoystick(el.joystickBase, el.joystickKnob);
    this.keyboard.onJump = () => (this.jumpQueued = true);
    this.keyboard.onCrouch = () => this.toggleCrouch();
    this.crouchButton = el.crouchButton;
    el.crouchButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleCrouch();
    });

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

  toggleCrouch(): void {
    this.crouch = !this.crouch;
    this.crouchButton.classList.toggle('active', this.crouch);
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
      this.lastLookX = this.lookStartX = e.clientX;
      this.lastLookY = this.lookStartY = e.clientY;
      this.lookStartTime = performance.now();
      this.lookIsTap = true;
      this.lookSensitivity = isTouch ? TOUCH_LOOK_SENSITIVITY : MOUSE_LOOK_SENSITIVITY;
    } else {
      return;
    }
    // Capture: события этого пальца продолжают приходить, даже если он ушёл за пределы элемента.
    // Если палец уже отпущен (очень быстрый тап), браузер бросит исключение — захват тогда и не нужен.
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* без захвата обойдёмся */
    }
  }

  private onMove(e: PointerEvent) {
    if (e.pointerId === this.joystick.pointerId) {
      this.joystick.move(e);
    } else if (e.pointerId === this.lookPointerId) {
      this.lookDx += (e.clientX - this.lastLookX) * this.lookSensitivity;
      this.lookDy += (e.clientY - this.lastLookY) * this.lookSensitivity;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
      if (Math.hypot(e.clientX - this.lookStartX, e.clientY - this.lookStartY) > TAP_SLOP) {
        this.lookIsTap = false;
      }
    }
  }

  private onUp(e: PointerEvent) {
    if (e.pointerId === this.joystick.pointerId) this.joystick.end();
    if (e.pointerId === this.lookPointerId) {
      this.lookPointerId = null;
      const quick = performance.now() - this.lookStartTime < TAP_MAX_MS;
      if (this.lookIsTap && quick && this.enabled) this.onTap?.(e.clientX, e.clientY);
    }
  }
}
