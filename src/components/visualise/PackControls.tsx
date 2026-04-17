import { useState } from 'react';
import { Label } from '../../ui/label';

interface PackControlsProps {
  n: number;
  total: number;
  groupCol: string;
  candidates: string[];
  onNChange: (n: number) => void;
  onGroupColChange: (col: string) => void;
}

export default function PackControls({
  n,
  total,
  groupCol,
  candidates,
  onNChange,
  onGroupColChange,
}: PackControlsProps) {
  const [localN, setLocalN] = useState(n);

  if (localN !== n && !document.querySelector('input[type=range]:active')) {
    setLocalN(n);
  }

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-3">
        <Label htmlFor="bubble-n" className="whitespace-nowrap text-sm">
          Products shown
        </Label>
        <input
          id="bubble-n"
          type="range"
          min={50}
          max={Math.max(total, 50)}
          step={50}
          value={localN}
          onInput={(e) => setLocalN(Number((e.target as HTMLInputElement).value))}
          onChange={(e) => setLocalN(Number(e.target.value))}
          onPointerUp={(e) => onNChange(Number((e.target as HTMLInputElement).value))}
          onMouseUp={(e) => onNChange(Number((e.target as HTMLInputElement).value))}
          className="w-36"
          disabled={total === 0}
        />
        <span className="w-10 text-right text-sm tabular-nums">{localN}</span>
      </div>

      {candidates.length > 0 && (
        <div className="flex items-center gap-2">
          <Label htmlFor="bubble-group" className="whitespace-nowrap text-sm">
            Group by
          </Label>
          <select
            id="bubble-group"
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={groupCol}
            onChange={(e) => onGroupColChange(e.target.value)}
          >
            <option value="">None</option>
            {candidates.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
