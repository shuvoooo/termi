'use client';

/**
 * Minimal SVG sparkline chart for monitoring metrics.
 * No external charting library required.
 */

interface SparklineProps {
    data: (number | null | undefined)[];
    color?: string;
    height?: number;
    showDots?: boolean;
    /** If provided, values ≥ this threshold render in red */
    alertThreshold?: number;
}

export default function MetricSparkline({
    data,
    color = '#3b82f6',
    height = 48,
    showDots = false,
    alertThreshold,
}: SparklineProps) {
    const WIDTH = 300;
    const H = height;
    const PADDING = 4;

    // Filter to valid numbers
    const values = data.map(d => (d != null && isFinite(d) ? d : null));
    const defined = values.filter((v): v is number => v !== null);

    if (defined.length < 2) {
        return (
            <div className="w-full flex items-center justify-center" style={{ height: H }}>
                <span className="text-[10px] text-slate-600">No data</span>
            </div>
        );
    }

    const min = Math.min(...defined);
    const max = Math.max(...defined);
    const range = max - min || 1;

    const toX = (i: number) => PADDING + (i / (values.length - 1)) * (WIDTH - PADDING * 2);
    const toY = (v: number) => H - PADDING - ((v - min) / range) * (H - PADDING * 2);

    // Build path segments (skip null values)
    const segments: string[][] = [];
    let current: string[] = [];

    values.forEach((v, i) => {
        if (v === null) {
            if (current.length > 0) { segments.push(current); current = []; }
        } else {
            const x = toX(i);
            const y = toY(v);
            current.push(current.length === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
        }
    });
    if (current.length > 0) segments.push(current);

    // Area fill path (for the last/only segment)
    const lastSeg = segments[segments.length - 1];
    const areaPath = lastSeg
        ? lastSeg.join(' ') +
          ` L ${toX(values.length - 1)} ${H - PADDING} L ${toX(values.findIndex(v => v !== null))} ${H - PADDING} Z`
        : '';

    const lineColor = alertThreshold != null && defined[defined.length - 1] >= alertThreshold
        ? '#ef4444'
        : color;

    return (
        <svg
            viewBox={`0 0 ${WIDTH} ${H}`}
            preserveAspectRatio="none"
            className="w-full"
            style={{ height: H }}
        >
            <defs>
                <linearGradient id={`fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
                </linearGradient>
            </defs>

            {/* Area fill */}
            {areaPath && (
                <path
                    d={areaPath}
                    fill={`url(#fill-${color.replace('#', '')})`}
                />
            )}

            {/* Lines */}
            {segments.map((seg, si) => (
                <path
                    key={si}
                    d={seg.join(' ')}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ))}

            {/* Dots for last point */}
            {showDots && values.map((v, i) => {
                if (v === null) return null;
                return (
                    <circle
                        key={i}
                        cx={toX(i)}
                        cy={toY(v)}
                        r="2"
                        fill={lineColor}
                        fillOpacity={i === values.length - 1 ? 1 : 0.4}
                    />
                );
            })}
        </svg>
    );
}
