/**
 * Оценка серверного времени на клиенте.
 *
 * Часы клиента и сервера не совпадают (разные устройства, performance.now() вообще от загрузки страницы).
 * Из пинга знаем: клиент отправил в t0, сервер ответил своим временем S, ответ пришёл в t1.
 * Предполагаем, что путь туда и обратно одинаковый: в момент S у клиента было t0 + rtt/2.
 * offset = S - (t0 + rtt/2), и дальше serverNow() = performance.now() + offset.
 */
export class ServerClock {
  private offset = 0;
  private bestRtt = Infinity;
  private synced = false;

  get isSynced(): boolean {
    return this.synced;
  }

  addSample(clientSendTime: number, serverTime: number, clientReceiveTime: number): void {
    const rtt = clientReceiveTime - clientSendTime;
    const sample = serverTime - (clientSendTime + rtt / 2);

    if (!this.synced) {
      this.offset = sample;
      this.bestRtt = rtt;
      this.synced = true;
      return;
    }
    // Пинг с большим RTT, скорее всего, застрял в очереди в одну сторону — его оценка хуже.
    // Таким образцам доверяем меньше. Медленно «забываем» лучший RTT, если сеть поменялась.
    this.bestRtt = Math.min(this.bestRtt * 1.05, rtt);
    const weight = rtt <= this.bestRtt * 1.5 ? 0.2 : 0.02;
    this.offset += (sample - this.offset) * weight;
  }

  now(): number {
    return performance.now() + this.offset;
  }
}
