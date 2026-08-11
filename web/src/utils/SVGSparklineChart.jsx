import React from 'react';

export function SVGSparklineChart({ points = [], color = '#38bdf8', max = 100, height = 130 }) {
  if (!points || points.length < 2) {
    return <div className="h-32 bg-background/50 rounded-lg flex items-center justify-center text-xs text-muted-foreground font-mono">Telemetry graph initializing...</div>;
  }

  const width = 500;
  const paddingLeft = 10;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 20;

  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;

  const pathCoords = points.map((p, i) => {
    const x = paddingLeft + (i / (points.length - 1)) * usableWidth;
    const normVal = Math.min(Math.max(p, 0), max);
    const y = height - paddingBottom - (normVal / max) * usableHeight;
    return { x: x.toFixed(1), y: y.toFixed(1), val: p };
  });

  const d = `M ${pathCoords.map(c => `${c.x},${c.y}`).join(' L ')}`;
  const areaD = `${d} L ${width - paddingRight},${height - paddingBottom} L ${paddingLeft},${height - paddingBottom} Z`;
  const gradId = `grad-${color.replace('#', '')}`;

  const lastPoint = pathCoords[pathCoords.length - 1];

  return (
    <div className="w-full overflow-hidden pt-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Reference Grid Lines */}
        <line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        <line x1={paddingLeft} y1={paddingTop + usableHeight * 0.5} x2={width - paddingRight} y2={paddingTop + usableHeight * 0.5} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="hsl(var(--border))" strokeWidth="1" opacity="0.8" />

        {/* Gradient Area */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Main Trend Line */}
        <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Last Data Marker Dot */}
        {lastPoint && (
          <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill={color} className="animate-pulse" />
        )}
      </svg>
    </div>
  );
}
