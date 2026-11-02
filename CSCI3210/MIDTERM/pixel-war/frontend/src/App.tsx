import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { PALETTE } from './palette';
import type { Color } from './palette';

const SIZE = 100;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState<Color>('#FF4500');
  const [pixels, setPixels] = useState<Color[]>(
    () => Array<Color>(SIZE * SIZE).fill('#FFFFFF'),
  );

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    pixels.forEach((value, index) => {
      context.fillStyle = value;
      context.fillRect(index % SIZE, Math.floor(index / SIZE), 1, 1);
    });
  }, [pixels]);

  function place(event: MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * SIZE / rect.width);
    const y = Math.floor((event.clientY - rect.top) * SIZE / rect.height);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    setPixels(previous => {
      const next = [...previous];
      next[y * SIZE + x] = color;
      return next;
    });
  }

  return <main>
    <h1>Pixel War</h1>
    <p>pick color then click canvas</p>
    <div aria-label="Color palette">
      {PALETTE.map(value => <button key={value} type="button"
        onClick={() => setColor(value)} aria-pressed={value === color}
        aria-label={`Select ${value}`}
        style={{ background: value, width: 32, height: 32, margin: 2 }} />)}
    </div>
    <canvas ref={canvasRef} width={SIZE} height={SIZE} onClick={place}
      style={{ width: 600, height: 600, imageRendering: 'pixelated' }}
      aria-label="Click to color a pixel" />
  </main>;
}
