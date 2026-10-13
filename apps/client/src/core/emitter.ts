/**
 * Минимальный типизированный EventEmitter (паттерн «наблюдатель»).
 * Events — карта «имя события -> тип данных», TypeScript проверяет и имя, и payload.
 */
export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  /** Возвращает функцию отписки — удобно, чтобы не держать ссылку на обработчик. */
  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event) as Set<(payload: Events[K]) => void> | undefined;
    set?.forEach((listener) => listener(payload));
  }
}
