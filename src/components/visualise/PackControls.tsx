import { Checkbox } from '@journey-further/salient-ui/ui/checkbox';
import { Label } from '@journey-further/salient-ui/ui/label';

interface PackControlsProps {
  n: number;
  total: number;
  useCategory: boolean;
  hasCatSrcCol: boolean;
  onNChange: (n: number) => void;
  onUseCategoryChange: (v: boolean) => void;
}

export default function PackControls({
  n,
  total,
  useCategory,
  hasCatSrcCol,
  onNChange,
  onUseCategoryChange,
}: PackControlsProps) {
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
          value={n}
          onChange={(e) => onNChange(Number(e.target.value))}
          className="w-36"
          disabled={total === 0}
        />
        <span className="w-10 text-right text-sm tabular-nums">{n}</span>
      </div>

      {hasCatSrcCol && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="bubble-cat"
            checked={useCategory}
            onCheckedChange={(v) => onUseCategoryChange(!!v)}
          />
          <Label htmlFor="bubble-cat" className="cursor-pointer text-sm">
            Group by category
          </Label>
        </div>
      )}
    </div>
  );
}
