import { useCallback, useEffect, useRef, useState } from 'react';

interface OutputProps {
  value: string;
  formatLabel: string;
}

export function Output({ value, formatLabel }: OutputProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    }).catch(() => {/* silently ignore clipboard errors */});
  }, [value]);

  return (
    <div className="panel">
      <div className="panel-header">
        Compressed ({formatLabel})
        <button className="copy-btn" onClick={handleCopy} disabled={!value}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <textarea
        className="panel-textarea"
        value={value}
        readOnly
        placeholder="Compressed output will appear here..."
      />
    </div>
  );
}
