import { POSES, type Pose, type PoseId } from '@mecha/shared';
import type { Controls } from '../input/controls';

/** Подписи и значки поз. Значок — чтобы узнавать позу с первого взгляда, не читая. */
export const POSE_LABELS: Record<PoseId, { name: string; icon: string }> = {
  flat: { name: 'Пластом', icon: '🛌' },
  crawl: { name: 'На четвереньках', icon: '🐾' },
  ball: { name: 'Клубок', icon: '🥚' },
  handsUp: { name: 'Руки вверх', icon: '🙌' },
  sit: { name: 'Сидя', icon: '🧘' },
  statue: { name: 'Статуя', icon: '🗿' },
};

/**
 * Колесо поз: кнопка «Поза» открывает круг из шести поз вокруг центра «Встать».
 * Круг, а не список: до любой позы одинаково близко, и большой палец попадает не глядя.
 */
export class PoseWheel {
  private readonly buttons = new Map<Pose, HTMLButtonElement>();

  constructor(
    private readonly button: HTMLButtonElement,
    private readonly wheel: HTMLElement,
    private readonly controls: Controls,
  ) {
    const ring = wheel.querySelector<HTMLElement>('.pose-ring')!;
    const stand = document.createElement('button');
    stand.type = 'button';
    stand.className = 'pose-item pose-stand';
    stand.innerHTML = '<span class="pose-icon">🧍</span><span class="pose-name">Встать</span>';
    this.addItem(stand, 'none');
    ring.append(stand);

    POSES.forEach((pose, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'pose-item';
      // Угол — через CSS-переменную: раскладку по кругу делает стиль.
      item.style.setProperty('--angle', `${i * (360 / POSES.length)}deg`);
      const { name, icon } = POSE_LABELS[pose];
      item.innerHTML = `<span class="pose-icon">${icon}</span><span class="pose-name">${name}</span>`;
      item.title = `${name} (${i + 1})`;
      this.addItem(item, pose);
      ring.append(item);
    });

    button.addEventListener('click', () => this.toggle());
    // Тап мимо круга закрывает его.
    wheel.addEventListener('pointerdown', (e) => {
      if (e.target === wheel) this.close();
    });
    controls.onPoseChange = () => this.render();
    this.render();
  }

  get open(): boolean {
    return !this.wheel.hidden;
  }

  toggle(): void {
    if (this.open) this.close();
    else {
      this.wheel.hidden = false;
      this.button.classList.add('open');
      navigator.vibrate?.(5);
    }
  }

  close(): void {
    this.wheel.hidden = true;
    this.button.classList.remove('open');
  }

  private addItem(item: HTMLButtonElement, pose: Pose) {
    this.buttons.set(pose, item);
    item.addEventListener('click', () => {
      this.controls.setPose(pose);
      navigator.vibrate?.(10);
      this.close();
    });
  }

  private render() {
    const pose = this.controls.pose;
    for (const [p, item] of this.buttons) item.classList.toggle('active', p === pose);
    this.button.classList.toggle('active', pose !== 'none');
    this.button.querySelector('.pose-icon')!.textContent = pose === 'none' ? '🧍' : POSE_LABELS[pose].icon;
  }
}
