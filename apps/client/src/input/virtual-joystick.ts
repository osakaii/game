const RADIUS = 56; // px — насколько далеко можно отвести «стик»
const DEAD_ZONE = 0.12;

/**
 * Плавающий джойстик: появляется там, где палец коснулся экрана.
 * Отдаёт вектор x (вправо) / y (вперёд) в диапазоне -1..1.
 */
export class VirtualJoystick {
  pointerId: number | null = null;
  readonly value = { x: 0, y: 0 };

  private originX = 0;
  private originY = 0;

  constructor(
    private readonly base: HTMLElement,
    private readonly knob: HTMLElement,
  ) {}

  start(e: PointerEvent): void {
    this.pointerId = e.pointerId;
    this.originX = e.clientX;
    this.originY = e.clientY;
    this.base.style.left = `${e.clientX}px`;
    this.base.style.top = `${e.clientY}px`;
    this.base.hidden = false;
    this.setKnob(0, 0);
  }

  move(e: PointerEvent): void {
    let dx = e.clientX - this.originX;
    let dy = e.clientY - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    this.setKnob(dx, dy);

    const x = dx / RADIUS;
    const y = -dy / RADIUS; // экранная ось Y смотрит вниз, а «вперёд» — это вверх
    const mag = Math.hypot(x, y);
    if (mag < DEAD_ZONE) {
      this.value.x = this.value.y = 0;
    } else {
      // Перемасштабируем, чтобы сразу за мёртвой зоной скорость начиналась с 0, а не с 0.12.
      const scale = (mag - DEAD_ZONE) / (1 - DEAD_ZONE) / mag;
      this.value.x = x * scale;
      this.value.y = y * scale;
    }
  }

  end(): void {
    this.pointerId = null;
    this.value.x = this.value.y = 0;
    this.base.hidden = true;
  }

  private setKnob(dx: number, dy: number) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
