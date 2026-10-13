import * as THREE from 'three';

/**
 * Ник над головой. Рисуем текст на <canvas> и используем как текстуру спрайта.
 * Sprite всегда повёрнут к камере. Дёшево: один квадрат и одна текстура на игрока.
 */
export function createNameLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontSize = 48;
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  const padding = 20;
  canvas.width = Math.ceil(ctx.measureText(text).width) + padding * 2;
  canvas.height = fontSize + padding;

  // После изменения размера canvas контекст сбрасывается — шрифт задаём заново.
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(15, 18, 26, 0.55)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  const height = 0.28;
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  return sprite;
}

export function disposeNameLabel(sprite: THREE.Sprite): void {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
