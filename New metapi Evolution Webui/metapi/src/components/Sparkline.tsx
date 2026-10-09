"use client";

import { useId } from "react";

export default function Sparkline({
  points,
  color = "#c8ff2e",
  height = 40,
  width = 120,
  fill = true,
}: {
  points: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!points || points.length === 0) return null;

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1 || 1);
  const line = `M ${points
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" L ")}`;
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  const gradId = `sparkGrad-${uid}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gradId})`} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
