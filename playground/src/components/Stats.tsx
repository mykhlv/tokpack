function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface StatsProps {
  originalSize: number;
  compressedSize: number;
  originalTokens: number;
  compressedTokens: number;
  exactTokens: boolean;
}

export function Stats({ originalSize, compressedSize, originalTokens, compressedTokens, exactTokens }: StatsProps) {
  const bytesSaved = originalSize - compressedSize;
  const bytesPercent = originalSize > 0 ? Math.round((bytesSaved / originalSize) * 100) : 0;
  const tokensSaved = originalTokens - compressedTokens;
  const tokensPercent = originalTokens > 0 ? Math.round((tokensSaved / originalTokens) * 100) : 0;

  return (
    <div className="stats-wrapper">
      <div className="stats">
        {tokensSaved > 0 && (
          <span className="stats-primary">
            {exactTokens ? '' : '~'}{tokensPercent}% tokens saved
          </span>
        )}
        <span className="stats-secondary">
          {exactTokens ? '' : '~'}{originalTokens.toLocaleString('en-US')} → {exactTokens ? '' : '~'}{compressedTokens.toLocaleString('en-US')} tokens
        </span>
        <span className="stats-divider">|</span>
        <span className="stats-secondary">
          {formatBytes(originalSize)} → {formatBytes(compressedSize)} ({bytesPercent}%)
        </span>
      </div>
      <div className="stats-footnote">
        {exactTokens
          ? 'Tokens counted with o200k_base BPE tokenizer. Actual counts may vary between models.'
          : 'Loading tokenizer... showing estimated token counts.'}
      </div>
    </div>
  );
}
