import type { Format } from 'tokpack';

export const FORMAT_LABELS: Record<Format, string> = {
  auto: 'Auto',
  psv: 'PSV',
  md: 'Markdown',
  toon: 'TOON',
};

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: 'auto', label: 'Auto (smallest output)' },
  { value: 'psv', label: 'PSV (Pipe-Separated Values)' },
  { value: 'md', label: 'Markdown table' },
  { value: 'toon', label: 'TOON (Token-Oriented Object Notation)' },
];

interface ControlsProps {
  format: Format;
  stripEmpty: boolean;
  flatten: boolean;
  parseText: boolean;
  parsePython: boolean;
  onFormatChange: (format: Format) => void;
  onStripEmptyChange: (value: boolean) => void;
  onFlattenChange: (value: boolean) => void;
  onParseTextChange: (value: boolean) => void;
  onParsePythonChange: (value: boolean) => void;
}

const TOGGLES: { key: 'stripEmpty' | 'flatten' | 'parseText' | 'parsePython'; label: string }[] = [
  { key: 'stripEmpty', label: 'Strip empty' },
  { key: 'flatten', label: 'Flatten' },
  { key: 'parseText', label: 'Parse text' },
  { key: 'parsePython', label: 'Parse Python' },
];

const TOGGLE_HANDLERS = {
  stripEmpty: 'onStripEmptyChange',
  flatten: 'onFlattenChange',
  parseText: 'onParseTextChange',
  parsePython: 'onParsePythonChange',
} as const;

export function Controls(props: ControlsProps) {
  const { format, onFormatChange } = props;

  return (
    <div className="controls">
      <label className="control">
        <span className="control-label">Format</span>
        <select
          value={format}
          onChange={(e) => onFormatChange(e.target.value as Format)}
        >
          {FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>
      {TOGGLES.map(({ key, label }) => (
        <label key={key} className="control">
          <input
            type="checkbox"
            checked={props[key]}
            onChange={(e) => props[TOGGLE_HANDLERS[key]](e.target.checked)}
          />
          <span className="control-label">{label}</span>
        </label>
      ))}
    </div>
  );
}
