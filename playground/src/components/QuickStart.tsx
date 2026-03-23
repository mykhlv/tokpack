interface QuickStartProps {
  repoUrl: string;
}

export function QuickStart({ repoUrl }: QuickStartProps) {
  return (
    <div className="quickstart">
      <div className="quickstart-links">
        <a href={repoUrl} target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="https://www.npmjs.com/package/tokpack" target="_blank" rel="noopener noreferrer">npm</a>
        <a href={`${repoUrl}#readme`} target="_blank" rel="noopener noreferrer">Docs</a>
      </div>
    </div>
  );
}
