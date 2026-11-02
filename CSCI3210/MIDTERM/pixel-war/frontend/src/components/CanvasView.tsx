import type { RefObject } from 'react';

export default function CanvasView({ canvasRef, width, height, disabled, onPlace }: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  width: number; height: number; disabled: boolean;
  onPlace: (x: number, y: number) => void;
}) {
  return <canvas ref={canvasRef} width={width} height={height}
    className="pixel-canvas" aria-label="Shared canvas. Coordinate form is available below."
    onClick={event => {
      if (disabled) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.floor((event.clientX - rect.left) * width / rect.width);
      const y = Math.floor((event.clientY - rect.top) * height / rect.height);
      if (x >= 0 && y >= 0 && x < width && y < height) onPlace(x, y);
    }} />;
}
