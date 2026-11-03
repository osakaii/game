import { JoinRoomSchema, NicknameSchema, ROOM_CODE_LENGTH } from '@mecha/shared';
import type { ConnectionStatus } from '../net/network';
import { GIVE_UP_HINT_MS, WAKE_HINT_MS, connectionNotice } from './connection-notice';
import { $, storage } from './dom';

const NICKNAME_KEY = 'mecha:nickname';

interface MenuHandlers {
  onCreate(nickname: string): void;
  onJoin(nickname: string, code: string): void;
  onSettings(): void;
}

/**
 * Главный экран: ник, «Играть» (новая комната), «По коду» (шторка с кодом друга).
 *
 * Пришёл по ссылке-приглашению (?room=CODE) — главная кнопка сразу ведёт в комнату друга,
 * а своя комната уходит во второстепенную: за этим человек и открыл ссылку.
 */
export class MenuScreen {
  private readonly root = $('#menu');
  private readonly form = $<HTMLFormElement>('#menu-form');
  private readonly nickname = $<HTMLInputElement>('#nickname');
  private readonly code = $<HTMLInputElement>('#room-code');
  private readonly playButton = $<HTMLButtonElement>('#menu-play');
  private readonly playLabel = $('#menu-play-label');
  private readonly playHint = $('#menu-play-hint');
  private readonly altButton = $<HTMLButtonElement>('#menu-alt');
  private readonly joinSheet = $('#join-sheet');
  private readonly joinButton = $<HTMLButtonElement>('#join-room');
  private readonly errorEl = $('#menu-error');
  private readonly joinError = $('#join-error');
  private readonly statusEl = $('#menu-status');
  private readonly statusText = $('#menu-status-text');
  /** Код из приглашения: пока он есть, «Играть» = войти к другу. */
  private invite: string | null = null;
  private status: ConnectionStatus = { state: 'connecting', text: '', retrying: true };
  /** С какого момента ждём сервер: сокет начал подключаться вместе со страницей. */
  private waitingSince = Date.now();
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private playHintText = 'новая комната';
  private busy = false;

  constructor(
    private readonly handlers: MenuHandlers,
    initialCode: string | null,
  ) {
    this.nickname.value = storage.get(NICKNAME_KEY) ?? '';
    this.code.maxLength = ROOM_CODE_LENGTH;
    if (initialCode) this.setCode(initialCode);
    this.showBody(true);
    this.renderNotice();
    // Пропал или вернулся интернет на телефоне — подпись сразу говорит, в чём дело.
    addEventListener('online', () => this.renderNotice());
    addEventListener('offline', () => this.renderNotice());

    this.code.addEventListener('input', () => {
      this.code.value = this.code.value.toUpperCase();
    });

    this.playButton.addEventListener('click', () => {
      if (this.invite) this.join(this.invite);
      else this.create();
    });
    this.altButton.addEventListener('click', () => {
      if (this.invite) this.create();
      else this.setJoinOpen(true);
    });
    $('#join-cancel').addEventListener('click', () => this.setJoinOpen(false));
    // Тап мимо карточки закрывает шторку — как у остальных шторок игры.
    this.joinSheet.addEventListener('pointerdown', (e) => {
      if (e.target === this.joinSheet) this.setJoinOpen(false);
    });
    $('#menu-settings').addEventListener('click', () => handlers.onSettings());

    // submit формы = «Войти» в шторке: так работает и кнопка, и «Go»/«Готово» на клавиатуре телефона.
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!this.joinSheet.hidden) this.join(this.code.value);
      else this.nickname.blur(); // «Готово» в поле ника — просто убрать клавиатуру
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.showBody(true);
  }

  hide(): void {
    this.root.hidden = true;
    this.setJoinOpen(false);
    this.showError('');
    this.showBody(false);
  }

  /** Пока нет связи, кнопки серые — и подпись над ними объясняет, чего ждём. */
  setConnection(status: ConnectionStatus): void {
    if (status.state !== 'online' && this.status.state === 'online') this.waitingSince = Date.now();
    this.status = status;
    this.updateButtons();
    this.renderNotice();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.updateButtons();
  }

  /** Код комнаты друга: из приглашения или вернуться в неё не вышло — войти позже одним нажатием. */
  setCode(code: string): void {
    this.code.value = code;
    this.invite = code;
    this.playLabel.textContent = 'Войти';
    this.playHintText = `в комнату ${code}`;
    this.altButton.textContent = 'Своя комната';
    this.renderNotice();
  }

  /** Ошибка — там, куда игрок сейчас смотрит: в шторке кода или пузырём над кнопками. */
  showError(text: string): void {
    const inSheet = !this.joinSheet.hidden;
    this.joinError.textContent = inSheet ? text : '';
    this.errorEl.textContent = inSheet ? '' : text;
  }

  /** Класс на body: пока открыт главный экран, кнопки ходьбы и HUD игры спрятаны. */
  private showBody(open: boolean) {
    document.body.classList.toggle('menu-open', open);
  }

  private setJoinOpen(open: boolean) {
    this.showError('');
    this.joinSheet.hidden = !open;
    if (open) this.code.focus();
  }

  private create() {
    const nickname = this.readNickname();
    if (nickname) this.handlers.onCreate(nickname);
  }

  private join(code: string) {
    const parsed = JoinRoomSchema.safeParse({ nickname: this.nickname.value, code });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // Ошибка в нике — шторка с кодом закрывается, чтобы было видно поле ника.
      if (issue?.path[0] === 'nickname') {
        this.setJoinOpen(false);
        this.nickname.focus();
      }
      this.showError(issue?.message ?? 'Ошибка');
      return;
    }
    storage.set(NICKNAME_KEY, parsed.data.nickname);
    this.handlers.onJoin(parsed.data.nickname, parsed.data.code);
  }

  private readNickname(): string | null {
    const parsed = NicknameSchema.safeParse(this.nickname.value);
    if (!parsed.success) {
      this.showError(parsed.error.issues[0]?.message ?? 'Ошибка');
      this.nickname.focus();
      return null;
    }
    storage.set(NICKNAME_KEY, parsed.data);
    return parsed.data;
  }

  private renderNotice() {
    clearTimeout(this.noticeTimer);
    const waited = Date.now() - this.waitingSince;
    const text = connectionNotice(this.status, waited, navigator.onLine);
    this.statusEl.hidden = text === null;
    this.statusText.textContent = text ?? '';
    this.playHint.textContent = text === null ? this.playHintText : 'ждём сервер';
    if (text === null || !this.status.retrying) return;
    // Подпись меняется и без событий сети: «подключаемся» → «просыпается» → «не отвечает».
    const next = [WAKE_HINT_MS, GIVE_UP_HINT_MS].find((at) => at > waited);
    if (next !== undefined) this.noticeTimer = setTimeout(() => this.renderNotice(), next - waited);
  }

  private updateButtons() {
    const disabled = this.status.state !== 'online' || this.busy;
    this.playButton.disabled = disabled;
    this.altButton.disabled = disabled;
    this.joinButton.disabled = disabled;
  }
}
