import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

interface NumberProps {
  mv: ReturnType<typeof useMotionValue<number>>;
  number: number;
  height: number;
}

function Number({ mv, number, height }: NumberProps) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) memo -= 10 * height;
    return memo;
  });

  return (
    <motion.span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", y }}>
      {number}
    </motion.span>
  );
}

function DecimalPoint({ height }: { height: number }) {
  return (
    <span className="relative inline-flex items-center justify-center" style={{ height }}>
      .
    </span>
  );
}

function Digit({ place, value, height }: { place: number; value: number; height: number }) {
  const valueRoundedToPlace = Math.floor(value / place);
  const animatedValue = useSpring(valueRoundedToPlace);

  useEffect(() => {
    animatedValue.set(valueRoundedToPlace);
  }, [animatedValue, valueRoundedToPlace]);

  return (
    <span
      className="relative inline-flex overflow-hidden"
      style={{ height, width: "1ch", fontVariantNumeric: "tabular-nums" }}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <Number key={i} mv={animatedValue} number={i} height={height} />
      ))}
    </span>
  );
}

interface CounterProps {
  value: number;
  fontSize?: number;
  gap?: number;
  textColor?: string;
  fontWeight?: React.CSSProperties["fontWeight"];
  places?: (number | ".")[];
}

export function Counter({
  value,
  fontSize = 24,
  gap = 4,
  textColor = "inherit",
  fontWeight = "inherit",
  places = [...value.toString()].map((ch, i, a) => {
    if (ch === ".") return ".";
    const dotIndex = a.indexOf(".");
    const isInteger = dotIndex === -1;
    const exponent = isInteger ? a.length - i - 1 : i < dotIndex ? dotIndex - i - 1 : -(i - dotIndex);
    return 10 ** exponent;
  }),
}: CounterProps) {
  const height = fontSize;

  return (
    <span className="inline-block">
      <span style={{ fontSize, display: "flex", gap, overflow: "hidden", lineHeight: 1, color: textColor, fontWeight, direction: "ltr" }}>
        {places.map((place) =>
          place === "." ? (
            <DecimalPoint key="." height={height} />
          ) : (
            <Digit key={place} place={place} value={value} height={height} />
          )
        )}
      </span>
    </span>
  );
}
