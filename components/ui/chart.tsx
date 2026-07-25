"use client";

import * as React from "react";
import { Legend, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

const ChartContext = React.createContext<{ config: ChartConfig }>({ config: {} });

export function ChartContainer({ config, className, children, ...props }: React.ComponentProps<"div"> & { config: ChartConfig; children: React.ComponentProps<typeof ResponsiveContainer>["children"] }) {
  const style = Object.fromEntries(Object.entries(config).filter(([, v]) => v.color).map(([key, value]) => [`--color-${key}`, value.color])) as React.CSSProperties;
  return (
    <ChartContext.Provider value={{ config }}>
      <div className={cn("flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted [&_.recharts-cartesian-grid_line]:stroke-line", className)} style={style} {...props}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = Tooltip;
export const ChartLegend = Legend;

export function ChartTooltipContent({ active, payload, label, labelFormatter, formatter, indicator = "dot", payloadSorter }: any) {
  const { config } = React.useContext(ChartContext);
  if (!active || !payload?.length) return null;
  const items = payload
    .filter((item: any) => item.value != null)
    .slice()
    .sort(payloadSorter);
  return (
    <div className="min-w-[210px] rounded-xl border border-line bg-card/95 p-3 text-xs text-text shadow-lg backdrop-blur">
      <div className="mb-2 font-semibold text-muted">{labelFormatter ? labelFormatter(label, payload) : label}</div>
      <div className="grid gap-1.5">
        {items.map((item: any, index: number) => (
          <div className="flex items-center gap-2" key={`${item.dataKey}-${index}`}>
            <span className={cn("shrink-0", indicator === "dot" ? "h-2.5 w-2.5 rounded-full" : "h-3 w-1 rounded")} style={{ background: item.color }} />
            {formatter ? formatter(item.value, item.name, item, index, payload) : (
              <><span className="flex-1 text-muted">{config[item.dataKey]?.label || item.name}</span><b className="tabular-nums">{item.value}</b></>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartLegendContent({ payload, verticalAlign = "bottom", onItemClick, visible }: any) {
  const { config } = React.useContext(ChartContext);
  if (!payload?.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs", verticalAlign === "top" ? "pb-3" : "pt-3")}>
      {payload.map((item: any) => (
        <button
          type="button"
          className={cn(
            "flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-medium text-muted transition-opacity",
            visible && !visible.has(item.dataKey) && "opacity-35",
          )}
          key={item.dataKey || item.value}
          onClick={() => onItemClick?.(item.dataKey)}
        >
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
          {config[item.dataKey]?.label || item.value}
        </button>
      ))}
    </div>
  );
}
