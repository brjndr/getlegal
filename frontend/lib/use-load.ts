import { useEffect, useState } from "react";

/**
 * Loads something when the component appears, and again on request after a failure.
 * `load` must be the same function from one render to the next. Nothing is loaded while it is null.
 */
export function useLoad<Data>(load: (() => Promise<Data>) | null) {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!load) return;
    // What arrives after the component has gone, or has asked again, is not wanted.
    let current = true;
    load().then(
      (loaded) => current && setData(loaded),
      (failure: unknown) => current && setError(failure ?? new Error("Loading failed")),
    );
    return () => {
      current = false;
    };
  }, [load, attempt]);

  function retry() {
    setError(undefined);
    setAttempt((count) => count + 1);
  }

  return { data, setData, error, failed: error !== undefined, retry };
}
