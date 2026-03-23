import { useState, useMemo, useCallback, useEffect } from 'react';
import { packRaw, type Format } from 'tokpack';
import { useTokenizer } from './useTokenizer';
import { Editor } from './components/Editor';
import { Output } from './components/Output';
import { Controls, FORMAT_LABELS } from './components/Controls';
import { Stats } from './components/Stats';
import { Examples } from './components/Examples';
import { QuickStart } from './components/QuickStart';
import { exampleDefs, SIZES, DEFAULT_SIZE, type Size } from './examples';
import { byteLength } from './utils';

const FORMATS = Object.keys(FORMAT_LABELS) as Format[];
declare const __TOKPACK_VERSION__: string;
declare const __TOKPACK_REPO_URL__: string;

const REPO_URL = __TOKPACK_REPO_URL__;

function getInitialState() {
  const params = new URLSearchParams(window.location.search);
  const format = FORMATS.includes(params.get('format') as Format)
    ? (params.get('format') as Format)
    : 'auto';
  const exampleParam = params.get('example');
  const exampleRaw = exampleParam !== null ? Number(exampleParam) : NaN;
  const exampleIndex = Number.isNaN(exampleRaw)
    ? 0
    : Math.min(Math.max(0, exampleRaw), exampleDefs.length - 1);
  const sizeParam = Number(params.get('rows'));
  const size = (SIZES as readonly number[]).includes(sizeParam) ? (sizeParam as Size) : DEFAULT_SIZE;
  return { format, exampleIndex, size };
}

export function App() {
  const [initial] = useState(getInitialState);
  const [activeExample, setActiveExample] = useState(initial.exampleIndex);
  const [format, setFormat] = useState<Format>(initial.format);
  const [size, setSize] = useState<Size>(initial.size);
  const [stripEmpty, setStripEmpty] = useState(true);
  const [flatten, setFlatten] = useState(true);
  const [parseText, setParseText] = useState(true);
  const [customInput, setCustomInput] = useState<string | null>(null);
  const { countTokens, exact } = useTokenizer();

  const exampleData = useMemo(
    () => exampleDefs[activeExample].build(size),
    [activeExample, size],
  );

  const input = customInput ?? exampleData;

  const handleExampleSelect = useCallback((index: number) => {
    setActiveExample(index);
    setCustomInput(null);
  }, []);

  const handleSizeChange = useCallback((newSize: Size) => {
    setSize(newSize);
    setCustomInput(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (format !== 'auto') params.set('format', format);
    if (activeExample > 0) params.set('example', String(activeExample));
    if (size !== DEFAULT_SIZE) params.set('rows', String(size));
    const search = params.toString();
    const url = search ? `?${search}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [format, activeExample, size]);

  const output = useMemo(() => {
    if (!input.trim()) return '';
    try {
      return packRaw(input, { format, stripEmpty, flatten, parseText });
    } catch {
      return input;
    }
  }, [input, format, stripEmpty, flatten, parseText]);

  const originalSize = useMemo(() => byteLength(input), [input]);
  const compressedSize = useMemo(() => byteLength(output), [output]);
  const originalTokens = useMemo(() => countTokens(input), [input, countTokens]);
  const compressedTokens = useMemo(() => countTokens(output), [output, countTokens]);

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">
          <a href={REPO_URL} className="title-link" target="_blank" rel="noopener noreferrer">tokpack</a>
          <sup className="title-version">v{__TOKPACK_VERSION__}</sup>
          {' '}<span className="title-dim">playground</span>
        </h1>
        <Controls
          format={format}
          stripEmpty={stripEmpty}
          flatten={flatten}
          parseText={parseText}
          onFormatChange={setFormat}
          onStripEmptyChange={setStripEmpty}
          onFlattenChange={setFlatten}
          onParseTextChange={setParseText}
        />
      </header>
      <Examples
        onSelect={handleExampleSelect}
        activeIndex={customInput === null ? activeExample : -1}
        size={size}
        onSizeChange={handleSizeChange}
      />
      <div className="panels">
        <Editor
          value={input}
          onChange={setCustomInput}
          onClear={() => setCustomInput('')}
        />
        <Output value={output} formatLabel={FORMAT_LABELS[format]} />
      </div>
      <Stats
        originalSize={originalSize}
        compressedSize={compressedSize}
        originalTokens={originalTokens}
        compressedTokens={compressedTokens}
        exactTokens={exact}
      />
      <QuickStart repoUrl={REPO_URL} />
    </div>
  );
}
