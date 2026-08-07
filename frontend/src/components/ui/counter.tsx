import { useEffect, useRef, useState } from "react";

interface CounterProps {
  value: number;
  fontSize?: number;
  textColor?: string;
  fontWeight?: React.CSSProperties["fontWeight"];
  decimals?: number;
}

export function Counter({ value, fontSize = 24, textColor = "inherit", fontWeight = "inherit", decimals = 0 }: CounterProps) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (Math.abs(diff) < 0.001) return;
    const duration = 600;
    const t0 = performance.now();

    function tick(now: number) {
      const elapsed = now - t0;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(start + diff * eased);
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    }

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);

  return (
    <span style={{ fontSize, color: textColor, fontWeight, fontVariantNumeric: "tabular-nums" }}>
      {decimals > 0 ? display.toFixed(decimals) : Math.round(display)}
    </span>
  );
}
