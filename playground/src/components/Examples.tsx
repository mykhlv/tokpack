import { exampleDefs, SIZES, type Size } from '../examples';

interface ExamplesProps {
  onSelect: (index: number) => void;
  activeIndex: number;
  size: Size;
  onSizeChange: (size: Size) => void;
}

export function Examples({ onSelect, activeIndex, size, onSizeChange }: ExamplesProps) {
  return (
    <div className="examples">
      {exampleDefs.map((ex, i) => (
        <button
          key={ex.label}
          className={`example-btn ${i === activeIndex ? 'example-btn--active' : ''}`}
          aria-pressed={i === activeIndex}
          onClick={() => onSelect(i)}
        >
          {ex.label}
        </button>
      ))}
      <label className="size-selector">
        <span className="control-label">Rows</span>
        <select
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value) as Size)}
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
