import { useState, useEffect, useCallback, useRef } from 'react';
import { byteLength } from './utils';

const BYTES_PER_TOKEN = 4;

type CountFn = (text: string) => number;

function estimateTokens(text: string): number {
  return Math.round(byteLength(text) / BYTES_PER_TOKEN);
}

export function useTokenizer() {
  const [ready, setReady] = useState(false);
  const countRef = useRef<CountFn>(estimateTokens);

  useEffect(() => {
    Promise.all([
      import('js-tiktoken/lite'),
      import('js-tiktoken/ranks/o200k_base'),
    ]).then(([{ Tiktoken }, { default: ranks }]) => {
      const enc = new Tiktoken(ranks);
      countRef.current = (text: string) => enc.encode(text).length;
      setReady(true);
    }).catch((err) => {
      console.warn('Failed to load tiktoken, using heuristic token counting:', err);
    });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `ready` triggers re-creation when tiktoken loads
  const countTokens = useCallback((text: string) => countRef.current(text), [ready]);

  return { countTokens, exact: ready };
}
