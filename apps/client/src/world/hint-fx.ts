import * as THREE from 'three';

/** Сколько секунд ноты висят над свистнувшим. */
const LIFETIME = 1.8;
/** Насколько ноты поднимаются за это время, м. */
const RISE = 1.6;
/** Размер нот в мире, м: на площади ×3 их видно издалека, но не через стены (depthTest). */
const SIZE = 1.8;
const HEAD_HEIGHT = 2.1;

interface Note {
  sprite: THREE.Sprite;
  from: THREE.Vector3;
  age: number;
}

/**
 * Ноты «♪♫» над прячущимся, который свистнул. Звук говорит «где-то справа», ноты — «вот за той клумбой».
 * Спрайт всегда повёрнут к камере; стены его закрывают — подсказка не просвечивает сквозь музей.
 */
export class HintFx {
  private readonly material: THREE.SpriteMaterial;
  private readonly notes: Note[] = [];

  constructor(private readonly scene: THREE.Scene) {
    this.material = new THREE.SpriteMaterial({ map: notesTexture(), transparent: true, depthWrite: false });
  }

  show(position: { x: number; y: number; z: number }): void {
    // У каждой ноты свой материал: прозрачность гаснет у каждой по-своему.
    const sprite = new THREE.Sprite(this.material.clone());
    sprite.scale.set(SIZE, SIZE, 1);
    const from = new THREE.Vector3(position.x, position.y + HEAD_HEIGHT, position.z);
    sprite.position.copy(from);
    this.scene.add(sprite);
    this.notes.push({ sprite, from, age: 0 });
  }

  update(dt: number): void {
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const note = this.notes[i];
      note.age += dt;
      const t = note.age / LIFETIME;
      if (t >= 1) {
        this.scene.remove(note.sprite);
        note.sprite.material.dispose();
        this.notes.splice(i, 1);
        continue;
      }
      // Всплывают и покачиваются, к концу тают.
      note.sprite.position.set(note.from.x + Math.sin(note.age * 7) * 0.15, note.from.y + RISE * t, note.from.z);
      note.sprite.material.opacity = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    }
  }
}

/** Ноты рисуем один раз на canvas: шрифтовые «♪♫» есть на любом телефоне, файлов не нужно. */
function notesTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Тёмная обводка — читается и на белом музее, и на небе.
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(20, 20, 30, 0.8)';
  ctx.strokeText('♪♫', 64, 64);
  ctx.fillStyle = '#ffd166';
  ctx.fillText('♪♫', 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
