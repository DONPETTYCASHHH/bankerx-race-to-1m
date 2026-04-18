import { useState, useMemo, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, ReferenceLine,
} from 'recharts';
import {
  runSimulation, formatAmount, formatYears,
  type SimulationInputs, type SimulationResult,
} from '@/lib/calculator';
import { useTheme } from '@/lib/theme';
import {
  Target, TrendingUp, Clock, DollarSign, Percent,
  Sun, Moon, Info, Zap, PiggyBank,
  BarChart3, Calculator, Trophy, Layers,
  RotateCcw, Lightbulb, ArrowUp, Mail, Download,
} from 'lucide-react';

const ZERO_INPUTS: SimulationInputs = {
  startingAmount: 0,
  annualReturn: 0,
  investmentFees: 0,
  annualContribution: 0,
  contributionGrowthRate: 0,
  inflationRate: 0,
  taxMethod: 'simple',
  simpleTaxRate: 0,
  saIncomeBracket: 0,
  targetAmount: 1000000,
};

const DEFAULT_INPUTS: SimulationInputs = {
  startingAmount: 50000,
  annualReturn: 10,
  investmentFees: 1.5,
  annualContribution: 36000,
  contributionGrowthRate: 5,
  inflationRate: 5,
  taxMethod: 'simple',
  simpleTaxRate: 0,
  saIncomeBracket: 0,
  targetAmount: 1000000,
};

const SCENARIOS = {
  conservative: { annualReturn: 8, investmentFees: 2, label: 'Conservative', desc: 'Money market / bonds' },
  balanced: { annualReturn: 11, investmentFees: 1.5, label: 'Balanced', desc: 'Mixed portfolio' },
  aggressive: { annualReturn: 14, investmentFees: 1, label: 'Aggressive', desc: 'Equity heavy' },
};

function SliderInput({
  label, value, onChange, min, max, step, format, icon: Icon, tooltip,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format: (v: number) => string;
  icon?: any; tooltip?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
          <Label className="text-sm font-medium">{label}</Label>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px] text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <span className="text-sm font-semibold tabular-nums text-primary" data-testid={`value-${label.toLowerCase().replace(/\s/g, '-')}`}>
          {format(value)}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        data-testid={`slider-${label.toLowerCase().replace(/\s/g, '-')}`}
      />
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function SummaryBoxes({ result, inputs }: { result: SimulationResult; inputs: SimulationInputs }) {
  // Use atTarget snapshot so boxes add up to the target
  const { atTarget, atForecast } = result;
  const forecastTotal = atForecast.contributions + atForecast.grossGains - atForecast.fees;

  const boxes = [
    { label: 'Target', value: formatAmount(inputs.targetAmount), icon: Target },
    { label: 'Time to Target', value: formatYears(result.yearsToTarget), icon: Clock },
    { label: 'Total Contributions', value: formatAmount(atTarget.contributions), icon: PiggyBank },
    { label: 'Total Gains', value: formatAmount(Math.max(0, atTarget.grossGains)), icon: TrendingUp },
    { label: 'Total Fees', value: formatAmount(atTarget.fees), icon: Percent },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {boxes.map((box) => (
          <Card key={box.label} className="relative border-primary/30 bg-primary/5 dark:bg-primary/10">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1 min-w-0">
                  <p className="text-[11px] font-medium text-primary/70 uppercase tracking-wide">{box.label}</p>
                  <p className="text-lg font-bold tabular-nums text-primary truncate" data-testid={`kpi-${box.label.toLowerCase().replace(/\s/g, '-')}`}>
                    {box.value}
                  </p>
                </div>
                <div className="p-1.5 rounded-lg bg-primary/15 shrink-0">
                  <box.icon className="w-3.5 h-3.5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Forecast box — dynamic year, normal styling */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {atForecast.year} Year Forecast (Contributions + Gains - Fees)
              </p>
              <p className="text-3xl font-bold tabular-nums" data-testid="kpi-forecast">
                {formatAmount(forecastTotal)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-muted">
              <DollarSign className="w-6 h-6 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MilestoneBar({ milestones, targetAmount }: { milestones: SimulationResult['milestones']; targetAmount: number }) {
  if (milestones.length === 0) return null;
  const thresholds = [100000, 250000, 500000, 750000, targetAmount];
  const maxYear = milestones.length > 0 ? milestones[milestones.length - 1].year : 1;

  return (
    <div className="space-y-2">
      {thresholds.map((threshold) => {
        const hit = milestones.find((m) => m.amount === threshold);
        const label = threshold >= 1000000 ? `${(threshold / 1000000).toFixed(0)}M` : `${(threshold / 1000).toFixed(0)}k`;
        return (
          <div key={threshold} className="flex items-center gap-3">
            <div className="w-12 text-xs font-medium tabular-nums text-right text-muted-foreground">{label}</div>
            <div className="flex-1 h-7 bg-muted rounded-md relative overflow-hidden">
              {hit ? (
                <div
                  className="h-full bg-primary/20 rounded-md flex items-center justify-end pr-2 transition-all duration-700 ease-out milestone-enter"
                  style={{ width: `${Math.min(100, Math.max(15, (hit.year / maxYear) * 100))}%` }}
                >
                  <span className="text-[11px] font-semibold tabular-nums text-primary">Yr {hit.year}</span>
                </div>
              ) : (
                <div className="h-full flex items-center pl-3">
                  <span className="text-[11px] text-muted-foreground">Not reached</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SegmentBreakdown({ yearData, targetAmount }: { yearData: SimulationResult['yearData']; targetAmount: number }) {
  const segments = useMemo(() => {
    const numSegments = 10;
    const segmentSize = targetAmount / numSegments;
    const result: { from: string; to: string; years: number | null }[] = [];
    for (let i = 0; i < numSegments; i++) {
      const fromVal = i * segmentSize;
      const toVal = (i + 1) * segmentSize;
      const fromLabel = fromVal === 0 ? '0' : formatAmount(fromVal);
      const toLabel = formatAmount(toVal);
      let fromYear: number | null = fromVal === 0 ? 0 : (yearData.find((d) => d.balance >= fromVal)?.year ?? null);
      const toYear = yearData.find((d) => d.balance >= toVal)?.year ?? null;
      const years = fromYear !== null && toYear !== null ? toYear - fromYear : null;
      result.push({ from: fromLabel, to: toLabel, years });
    }
    return result;
  }, [yearData, targetAmount]);

  const maxYears = Math.max(...segments.filter((s) => s.years !== null).map((s) => s.years!), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Each Segment</h3>
      </div>
      <p className="text-xs text-muted-foreground">The first segment is the hardest. The last segment is the fastest. That's compounding.</p>
      <div className="space-y-1.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-[110px] text-[11px] tabular-nums text-right text-muted-foreground shrink-0">
              {seg.from} → {seg.to}
            </div>
            <div className="flex-1 h-6 bg-muted rounded relative overflow-hidden">
              {seg.years !== null ? (
                <div
                  className="h-full rounded flex items-center justify-end pr-1.5 transition-all duration-500"
                  style={{
                    width: `${Math.max(18, (seg.years / maxYears) * 100)}%`,
                    backgroundColor: `hsl(${160 - i * 6}, ${70 - i * 2}%, ${32 + i * 3}%)`,
                  }}
                >
                  <span className="text-[10px] font-bold text-white tabular-nums">
                    {seg.years === 0 ? '<1yr' : `${seg.years}yr${seg.years !== 1 ? 's' : ''}`}
                  </span>
                </div>
              ) : (
                <div className="h-full flex items-center pl-2">
                  <span className="text-[10px] text-muted-foreground">—</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioComparison({ inputs }: { inputs: SimulationInputs }) {
  const scenarios = useMemo(() => {
    return Object.entries(SCENARIOS).map(([key, preset]) => {
      const scenarioInputs = { ...inputs, annualReturn: preset.annualReturn, investmentFees: preset.investmentFees };
      const result = runSimulation(scenarioInputs);
      return { key, ...preset, result };
    });
  }, [inputs]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Scenario Comparison</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {scenarios.map((s) => (
          <Card key={s.key} className="relative">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-[10px]">{s.label}</Badge>
                <span className="text-[10px] text-muted-foreground">{s.annualReturn}% - {s.investmentFees}% fees</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
              <div className="pt-1 border-t">
                <p className="text-lg font-bold tabular-nums text-primary">
                  {formatYears(s.result.yearsToTarget)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Real: {formatYears(s.result.yearsToTargetReal)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-semibold mb-1.5">Year {label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold tabular-nums">{formatAmount(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function KeyLessons({ targetAmount }: { targetAmount: number }) {
  const targetLabel = formatAmount(targetAmount);

  const lessons = [
    { emoji: '🚀', title: 'Start early!', desc: 'Compounding is a cheat code. The earlier you start, the less you need to contribute.' },
    { emoji: '👀', title: 'Watch fees & inflation', desc: 'They silently eat into your returns. A 1% difference in fees can cost you years.' },
    { emoji: '💪', title: 'Invest consistently', desc: 'No matter how small. Regular contributions build the habit and accelerate growth.' },
    { emoji: '⚖️', title: 'Higher returns = higher risk', desc: 'Especially in the short term. Diversify and match your risk to your timeline.' },
    { emoji: '🎯', title: 'Play the long game!', desc: 'Patience is the real wealth builder. Time in the market beats timing the market.' },
  ];

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Key Lessons to Get to {targetLabel} Faster</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {lessons.map((lesson, i) => (
            <div key={i} className="flex flex-col gap-2">
              <span className="text-2xl leading-none">{lesson.emoji}</span>
              <h4 className="text-sm font-bold leading-tight">{lesson.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{lesson.desc}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SimulatorPage() {
  const { isDark, toggle: toggleTheme } = useTheme();
  const [inputs, setInputs] = useState<SimulationInputs>(DEFAULT_INPUTS);
  const [isDownloading, setIsDownloading] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const updateInput = useCallback(<K extends keyof SimulationInputs>(key: K, value: SimulationInputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetAll = useCallback(() => {
    setInputs(ZERO_INPUTS);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!captureRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(captureRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: isDark ? '#131211' : '#f5f4f0',
      });
      const link = document.createElement('a');
      link.download = `bankerx-race-to-1m-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  }, [isDark, isDownloading]);

  const result = useMemo(() => runSimulation(inputs), [inputs]);

  const chartData = useMemo(() => {
    return result.yearData.map((d) => ({
      year: d.year,
      nominal: Math.round(d.balance),
      real: Math.round(d.realBalance),
      contributions: Math.round(d.cumulativeContributions),
    }));
  }, [result]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="BankerX Race to 1M logo">
              <rect x="2" y="2" width="28" height="28" rx="8" stroke="currentColor" strokeWidth="2" className="text-primary" />
              <path d="M8 22 L12 14 L16 18 L22 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
              <circle cx="24" cy="8" r="2.5" fill="currentColor" className="text-primary" />
            </svg>
            <div>
              <h1 className="text-sm font-bold tracking-tight">
                <span className="uppercase">BankerX</span>{' '}
                <span className="text-primary">Race to 1M</span>
              </h1>
              <p className="text-[11px] text-muted-foreground">Investment growth simulator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" onClick={handleDownload} disabled={isDownloading}
              data-testid="download-button" className="gap-1.5 text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              {isDownloading ? 'Saving...' : 'Download'}
            </Button>
            <Button
              variant="ghost" size="sm" onClick={resetAll}
              data-testid="reset-button" className="gap-1.5 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Capturable area */}
      <div ref={captureRef}>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Summary KPI Row */}
          <div className="mb-6 fade-up">
            <SummaryBoxes result={result} inputs={inputs} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Panel: Controls */}
            <div className="lg:col-span-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-primary" />
                    <CardTitle className="text-sm">Inputs</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <SliderInput
                    label="Target Goal" value={inputs.targetAmount}
                    onChange={(v) => updateInput('targetAmount', v)}
                    min={100000} max={10000000} step={100000}
                    format={(v) => formatAmount(v)} icon={Target}
                  />
                  <SliderInput
                    label="Starting Capital" value={inputs.startingAmount}
                    onChange={(v) => updateInput('startingAmount', v)}
                    min={0} max={1000000} step={5000}
                    format={(v) => formatAmount(v)} icon={DollarSign}
                  />
                  <SliderInput
                    label="Annual Return" value={inputs.annualReturn}
                    onChange={(v) => updateInput('annualReturn', v)}
                    min={0} max={25} step={0.5}
                    format={(v) => `${v}%`} icon={TrendingUp}
                    tooltip="Expected annual return before fees. Equities historically average 10-14% nominal."
                  />
                  <SliderInput
                    label="Investment Fees" value={inputs.investmentFees}
                    onChange={(v) => updateInput('investmentFees', v)}
                    min={0} max={5} step={0.1}
                    format={(v) => `${v}%`} icon={Percent}
                    tooltip="Total expense ratio (TER) + advisor fees. ETFs: ~0.1-0.5%. Managed funds: 1-2.5%."
                  />
                  <SliderInput
                    label="Annual Contribution" value={inputs.annualContribution}
                    onChange={(v) => updateInput('annualContribution', v)}
                    min={0} max={1000000} step={5000}
                    format={(v) => formatAmount(v)} icon={PiggyBank}
                    tooltip="Total amount contributed per year."
                  />
                  <SliderInput
                    label="Contribution Growth" value={inputs.contributionGrowthRate}
                    onChange={(v) => updateInput('contributionGrowthRate', v)}
                    min={0} max={15} step={0.5}
                    format={(v) => `${v}%`} icon={ArrowUp}
                    tooltip="Annual increase in contributions, e.g. matching salary growth."
                  />
                  <SliderInput
                    label="Inflation Rate" value={inputs.inflationRate}
                    onChange={(v) => updateInput('inflationRate', v)}
                    min={0} max={12} step={0.5}
                    format={(v) => `${v}%`} icon={Zap}
                    tooltip="Affects real (purchasing power) calculations."
                  />
                </CardContent>
              </Card>
            </div>

            {/* Right Panel: Visualizations */}
            <div className="lg:col-span-8 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm">Growth Projection</CardTitle>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'hsl(160, 84%, 30%)' }} />
                        <span className="text-muted-foreground">Nominal</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'hsl(200, 70%, 45%)' }} />
                        <span className="text-muted-foreground">Real</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'hsl(38, 92%, 50%)' }} />
                        <span className="text-muted-foreground">Contributions</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px]" data-testid="growth-chart">
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 24 }}>
                          <defs>
                            <linearGradient id="nominalGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(160, 84%, 30%)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(160, 84%, 30%)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="realGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(200, 70%, 45%)" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="hsl(200, 70%, 45%)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis
                            dataKey="year"
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={{ stroke: 'hsl(var(--border))' }}
                            tickLine={false}
                            label={{ value: 'Years', position: 'insideBottom', offset: -12, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false} tickLine={false}
                            tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}k`}
                          />
                          <ReferenceLine
                            y={inputs.targetAmount}
                            stroke="hsl(var(--primary))"
                            strokeDasharray="6 4" strokeWidth={1.5}
                            label={{ value: 'Target', position: 'insideTopRight', fontSize: 10, fill: 'hsl(var(--primary))' }}
                          />
                          <Area type="monotone" dataKey="contributions" name="Contributions" stroke="hsl(38, 92%, 50%)" strokeWidth={1.5} fill="none" dot={false} animationDuration={800} />
                          <Area type="monotone" dataKey="real" name="Real" stroke="hsl(200, 70%, 45%)" strokeWidth={2} fill="url(#realGrad)" dot={false} animationDuration={800} />
                          <Area type="monotone" dataKey="nominal" name="Nominal" stroke="hsl(160, 84%, 30%)" strokeWidth={2.5} fill="url(#nominalGrad)" dot={false} animationDuration={800} />
                          <RechartsTooltip content={<ChartTooltip />} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                        Adjust the sliders to see a projection
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="scenarios" className="w-full">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="scenarios" data-testid="tab-scenarios">
                    <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                    Scenarios
                  </TabsTrigger>
                  <TabsTrigger value="milestones" data-testid="tab-milestones">
                    <Trophy className="w-3.5 h-3.5 mr-1.5" />
                    Milestones
                  </TabsTrigger>
                  <TabsTrigger value="segments" data-testid="tab-segments">
                    <Layers className="w-3.5 h-3.5 mr-1.5" />
                    Segments
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="scenarios">
                  <Card>
                    <CardContent className="p-5">
                      <ScenarioComparison inputs={inputs} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="milestones">
                  <Card>
                    <CardContent className="p-5 space-y-5">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-primary" />
                          <h3 className="text-sm font-semibold">Nominal Milestones</h3>
                        </div>
                        <MilestoneBar milestones={result.milestones} targetAmount={inputs.targetAmount} />
                      </div>
                      <div className="pt-3 border-t">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-muted-foreground" />
                            <h3 className="text-sm font-semibold text-muted-foreground">Inflation-Adjusted Milestones</h3>
                          </div>
                          <MilestoneBar milestones={result.milestonesReal} targetAmount={inputs.targetAmount} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="segments">
                  <Card>
                    <CardContent className="p-5">
                      <SegmentBreakdown yearData={result.yearData} targetAmount={inputs.targetAmount} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Key Lessons */}
          <div className="mt-8">
            <KeyLessons targetAmount={inputs.targetAmount} />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t mt-8 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-muted-foreground">Powered by</span>
                <a href="https://www.bankerx.org/" target="_blank" rel="noopener noreferrer"
                  className="text-foreground font-bold tracking-tight hover:text-primary transition-colors">
                  BANKERX
                </a>
                <span className="text-muted-foreground">&</span>
                <a href="https://www.perplexity.ai/" target="_blank" rel="noopener noreferrer"
                  className="text-primary font-bold hover:opacity-80 transition-opacity">
                  Perplexity
                </a>
              </div>
              <a href="mailto:contact@bankerx.co.za"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <Mail className="w-3.5 h-3.5" />
                contact@bankerx.co.za
              </a>
              <p className="text-[11px] text-muted-foreground max-w-lg leading-relaxed">
                Overall tax impact varies and is situation specific. Remember to factor this into forecasting analysis.
              </p>
              <p className="text-[11px] text-muted-foreground max-w-lg">
                For educational purposes only. Past performance is not indicative of future results.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
