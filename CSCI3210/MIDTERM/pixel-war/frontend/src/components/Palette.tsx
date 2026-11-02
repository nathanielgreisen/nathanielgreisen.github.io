import { PALETTE } from '../palette';
import type { Color } from '../palette';

export default function Palette({ color, onChange }: {
  color: Color; onChange: (color: Color) => void;
}) {
  return <div aria-label="Color palette" className="palette">
    {PALETTE.map(value => <button type="button" key={value}
      aria-label={`Choose ${value}`} aria-pressed={value === color}
      onClick={() => onChange(value)} style={{ backgroundColor: value }} />)}
    <span>Selected: {color}</span>
  </div>;
}
