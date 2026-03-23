interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

export function Editor({ value, onChange, onClear }: EditorProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        JSON / Text
        {value && (
          <button className="clear-btn" onClick={onClear}>Clear</button>
        )}
      </div>
      <textarea
        className="panel-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste JSON array or structured text here..."
        spellCheck={false}
      />
    </div>
  );
}
