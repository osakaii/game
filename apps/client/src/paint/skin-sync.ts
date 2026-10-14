import type { SkinImageEvent } from '@mecha/shared';
import type { Lobby } from '../lobby/lobby';
import type { Network } from '../net/network';
import type { PlayerModel } from '../player/player-model';
import { errorMessage } from '../ui/error-messages';
import { toast } from '../ui/toast';
import type { RemotePlayers } from '../world/remote-players';
import type { PaintStudio } from './paint-studio';
import type { SkinPainter } from './skin-painter';

/** Пауза после мазка перед отправкой: красят сериями мазков, отправлять каждый — пустая трата трафика. */
const UPLOAD_DELAY_MS = 1200;
/** Ближе к концу пряток отправляем сразу: иначе последние мазки не успеют дойти до сервера. */
const HURRY_BEFORE_END_MS = 3000;
const RETRY_DELAY_MS = 1100;

/**
 * Синхронизация кожи по сети.
 *
 * Своя кожа: после паузы в покраске читаем её с видеокарты, сжимаем и отправляем.
 * Отправляется только РЕЗУЛЬТАТ, а не каждый мазок — одинаковая картинка у всех, мало трафика.
 *
 * Чужие кожи: декодируем пришедшие картинки и отдаём RemotePlayers.
 * Своя кожа может прийти обратно — после перезагрузки страницы (сервер её помнит).
 */
export class SkinSync {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private uploading = false;
  private uploadAgain = false;
  /** Ревизия сброса, которую уже применили к своей коже, — чтобы не сбрасывать дважды. */
  private handledResetRevision = -1;
  /** Последняя ревизия своей кожи, известная серверу. */
  private ownRevision = -1;

  constructor(
    private readonly network: Network,
    private readonly lobby: Lobby,
    private readonly painter: SkinPainter,
    studio: PaintStudio,
    private readonly model: PlayerModel,
    private readonly remotePlayers: RemotePlayers,
  ) {
    studio.on('edited', () => this.markDirty());
    let wasActive = studio.active;
    studio.on('change', () => {
      // Закрыли Мастерскую («Готово») — отправляем сразу, не дожидаясь паузы.
      if (wasActive && !studio.active) void this.flush();
      wasActive = studio.active;
    });
    network.on('skin', (event) => void this.receive(event));
  }

  /** Вызывать при каждом room:state: сервер мог сбросить кожу (начало раунда, стал помощником). */
  onRoom(): void {
    const skin = this.lobby.me?.skin;
    if (!skin) return;
    if (!skin.hasImage && skin.revision !== this.handledResetRevision) {
      this.handledResetRevision = skin.revision;
      this.ownRevision = skin.revision;
      this.dirty = false;
      clearTimeout(this.timer);
      this.model.setBase(skin.base);
      this.painter.resetFrom(this.model.skin.texture);
    }
  }

  private markDirty() {
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.uploadDelay());
  }

  private uploadDelay(): number {
    const room = this.lobby.room;
    if (room?.phase !== 'hiding' || !room.phaseEndsAt) return UPLOAD_DELAY_MS;
    const left = room.phaseEndsAt - this.network.clock.now();
    return left < HURRY_BEFORE_END_MS ? 0 : UPLOAD_DELAY_MS;
  }

  private async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (!this.dirty || !this.lobby.room) return;
    if (this.uploading) {
      this.uploadAgain = true; // отправим ещё раз, когда закончится текущая отправка
      return;
    }
    this.uploading = true;
    this.dirty = false;
    try {
      const blob = await this.painter.exportImage();
      const result = await this.network.uploadSkin(await blob.arrayBuffer());
      if (result.ok) {
        this.ownRevision = result.data.revision;
      } else if (result.error === 'RATE_LIMITED' || result.error === 'TIMEOUT') {
        this.dirty = true;
        this.timer = setTimeout(() => void this.flush(), RETRY_DELAY_MS);
      } else {
        toast(errorMessage(result.error));
      }
    } catch {
      this.dirty = true; // не удалось сжать картинку — попробуем при следующем мазке
    } finally {
      this.uploading = false;
      if (this.uploadAgain) {
        this.uploadAgain = false;
        this.dirty = true;
        void this.flush();
      }
    }
  }

  private async receive(event: SkinImageEvent) {
    let image: ImageBitmap;
    try {
      // Байты могут прийти как ArrayBuffer или как Uint8Array — приводим к обычному Uint8Array.
      const bytes = event.image instanceof Uint8Array ? event.image.slice() : new Uint8Array(event.image);
      image = await createImageBitmap(new Blob([bytes]));
    } catch {
      return; // битая картинка — оставляем как было
    }
    if (event.playerId !== this.network.playerId) {
      this.remotePlayers.setSkinImage(event.playerId, event.revision, image);
      return;
    }
    // Своя кожа с сервера — значит, перезагрузили страницу. Не затираем свежие неотправленные мазки.
    if (!this.dirty && event.revision > this.ownRevision) {
      this.ownRevision = event.revision;
      this.model.applySkinImage(image);
      this.painter.resetFrom(this.model.skin.texture);
    }
  }
}
