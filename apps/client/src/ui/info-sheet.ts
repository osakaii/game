import { $, storage } from './dom';

/**
 * Окно-справка поверх экрана («Как играть», «Играть без рамок»): открыть, закрыть кнопкой
 * [data-close] или тапом мимо карточки. Игру не останавливает — просто подсказка.
 */
export class InfoSheet {
  private readonly root: HTMLElement;

  constructor(selector: string) {
    this.root = $(selector);
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-close]')) {
      button.addEventListener('click', () => this.close());
    }
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }
}

const HOWTO_SEEN_KEY = 'mecha:howto-seen';

/**
 * «Как играть»: новичку «?» на главном экране подмигивает (класс .unseen), пока он хоть раз не откроет
 * справку. Само окно не выскакивает — кто пришёл по ссылке друга, хочет играть, а не читать.
 */
export class HowToPlay {
  private readonly sheet = new InfoSheet('#howto');

  constructor(private readonly button: HTMLElement) {
    button.classList.toggle('unseen', storage.get(HOWTO_SEEN_KEY) !== '1');
    button.addEventListener('click', () => this.open());
  }

  open(): void {
    this.sheet.open();
    this.button.classList.remove('unseen');
    storage.set(HOWTO_SEEN_KEY, '1');
  }
}
