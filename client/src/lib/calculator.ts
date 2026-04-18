// SA Tax rates (2024/2025 — reasonable approximation)
// Interest income: first R23,800 exempt (under 65), then taxed at marginal rate
// Dividends: 20% withholding tax
// Capital gains: 40% inclusion rate, then taxed at marginal rate

export interface SimulationInputs {
  startingAmount: number;
  annualReturn: number; // percentage, e.g. 10 = 10%
  investmentFees: number; // percentage, e.g. 1 = 1%
  annualContribution: number;
  contributionGrowthRate: number; // percentage per year
  inflationRate: number; // percentage
  // SA Tax
  taxMethod: 'simple' | 'sa-specific';
  simpleTaxRate: number; // percentage
  saIncomeBracket: number; // index into brackets
  targetAmount: number; // default 1,000,000
}

// SA marginal tax brackets 2024/2025
export const SA_TAX_BRACKETS = [
  { label: '0 - 237,100 (18%)', rate: 0.18, income: 118550 },
  { label: '237,101 - 370,500 (26%)', rate: 0.26, income: 303800 },
  { label: '370,501 - 512,800 (31%)', rate: 0.31, income: 441650 },
  { label: '512,801 - 673,000 (36%)', rate: 0.36, income: 592900 },
  { label: '673,001 - 857,900 (39%)', rate: 0.39, income: 765450 },
  { label: '857,901 - 1,817,000 (41%)', rate: 0.41, income: 1337450 },
  { label: '1,817,001+ (45%)', rate: 0.45, income: 2000000 },
];

// Blended SA tax on investment returns
function calculateSATax(grossReturn: number, marginalRate: number): number {
  const interestPortion = grossReturn * 0.4;
  const equityPortion = grossReturn * 0.6;

  // Interest tax
  const interestExemption = 23800;
  const taxableInterest = Math.max(0, interestPortion - interestExemption);
  const interestTax = taxableInterest * marginalRate;

  // Equity: split into dividends (40%) and capital growth (60%)
  const dividendPortion = equityPortion * 0.4;
  const capitalGainPortion = equityPortion * 0.6;

  // Dividend withholding tax: 20%
  const dividendTax = dividendPortion * 0.20;

  // Capital gains: 40% inclusion rate × marginal rate, annual exclusion R40,000
  const taxableCapGain = Math.max(0, capitalGainPortion * 0.4 - 40000);
  const capGainTax = taxableCapGain * marginalRate;

  return interestTax + dividendTax + capGainTax;
}

export interface YearData {
  year: number;
  balance: number;
  realBalance: number;
  contribution: number;
  returnAmount: number;
  feesAmount: number;
  taxAmount: number;
  cumulativeContributions: number;
  cumulativeReturns: number;
  cumulativeFees: number;
}

export interface SimulationResult {
  yearsToTarget: number | null;
  yearsToTargetReal: number | null;
  yearData: YearData[];
  milestones: { amount: number; year: number; label: string }[];
  milestonesReal: { amount: number; year: number; label: string }[];
  finalBalance: number;
  finalRealBalance: number;
  totalContributions: number;
  totalReturns: number;
  totalFees: number;
  totalTax: number;
  // Snapshot at target year
  atTarget: {
    contributions: number;
    grossGains: number;
    fees: number;
    balance: number;
  };
  // Forecast at horizon (max of target year, 20)
  atForecast: {
    year: number;
    balance: number;
    contributions: number;
    grossGains: number;
    fees: number;
  };
}

export function runSimulation(inputs: SimulationInputs): SimulationResult {
  const {
    startingAmount,
    annualReturn,
    investmentFees,
    annualContribution,
    contributionGrowthRate,
    inflationRate,
    taxMethod,
    simpleTaxRate,
    saIncomeBracket,
    targetAmount,
  } = inputs;

  // Annual compounding only
  const netReturnRate = (annualReturn - investmentFees) / 100;
  const grossReturnRate = annualReturn / 100;
  const feeRate = investmentFees / 100;
  const inflation = inflationRate / 100;

  const maxYears = 100;
  const yearData: YearData[] = [];

  let balance = startingAmount;
  let cumulativeContributions = startingAmount;
  let cumulativeReturns = 0;
  let totalFees = 0;
  let totalTax = 0;
  let currentContribution = annualContribution;
  let yearsToTarget: number | null = null;
  let yearsToTargetReal: number | null = null;

  // Milestone tracking
  const milestoneThresholds = [100000, 250000, 500000, 750000, targetAmount];
  const milestones: { amount: number; year: number; label: string }[] = [];
  const hitMilestones = new Set<number>();
  const milestonesReal: { amount: number; year: number; label: string }[] = [];
  const hitMilestonesReal = new Set<number>();

  if (balance >= targetAmount) {
    yearsToTarget = 0;
  }
  if (balance >= targetAmount) {
    yearsToTargetReal = 0;
  }

  for (let year = 1; year <= maxYears; year++) {
    const yearStart = balance;

    // Calculate gross return on starting balance
    const grossReturn = yearStart * grossReturnRate;

    // Calculate fees on starting balance
    const feesAmount = yearStart * feeRate;

    // Net return after fees
    const netReturn = grossReturn - feesAmount;

    // Add contributions (contributed at start of year, so they also earn)
    // For simplicity, contributions added at start of year
    balance = yearStart + netReturn + currentContribution;

    // Tax calculation
    let taxAmount = 0;
    if (taxMethod === 'simple') {
      taxAmount = Math.max(0, netReturn) * (simpleTaxRate / 100);
    } else {
      const marginalRate = SA_TAX_BRACKETS[saIncomeBracket]?.rate || 0.26;
      taxAmount = calculateSATax(Math.max(0, grossReturn), marginalRate);
    }

    // Deduct tax
    balance -= taxAmount;

    totalFees += feesAmount;
    totalTax += taxAmount;
    cumulativeContributions += currentContribution;
    cumulativeReturns += netReturn - taxAmount;

    const realBalance = balance / Math.pow(1 + inflation, year);

    yearData.push({
      year,
      balance,
      realBalance,
      contribution: currentContribution,
      returnAmount: netReturn,
      feesAmount,
      taxAmount,
      cumulativeContributions,
      cumulativeReturns,
      cumulativeFees: totalFees,
    });

    // Check milestones
    for (const threshold of milestoneThresholds) {
      if (!hitMilestones.has(threshold) && balance >= threshold) {
        hitMilestones.add(threshold);
        milestones.push({
          amount: threshold,
          year,
          label: threshold >= 1000000 ? `${(threshold / 1000000).toFixed(1)}M` : `${(threshold / 1000).toFixed(0)}k`,
        });
      }
    }

    for (const threshold of milestoneThresholds) {
      if (!hitMilestonesReal.has(threshold) && realBalance >= threshold) {
        hitMilestonesReal.add(threshold);
        milestonesReal.push({
          amount: threshold,
          year,
          label: threshold >= 1000000 ? `${(threshold / 1000000).toFixed(1)}M` : `${(threshold / 1000).toFixed(0)}k`,
        });
      }
    }

    if (yearsToTarget === null && balance >= targetAmount) {
      yearsToTarget = year;
    }
    if (yearsToTargetReal === null && realBalance >= targetAmount) {
      yearsToTargetReal = year;
    }

    // Grow contributions
    currentContribution *= (1 + contributionGrowthRate / 100);

    // Stop if we've gone well past the target AND past 20 years
    if (yearsToTarget !== null && year > (yearsToTarget + 10) && year >= 20) {
      break;
    }
    // Always run at least 20 years
    if (yearsToTarget === null && year >= 100) {
      break;
    }
  }

  // Snapshot at target year
  const targetYearData = yearsToTarget !== null ? yearData[yearsToTarget - 1] : null;
  const atTarget = targetYearData ? {
    contributions: targetYearData.cumulativeContributions,
    grossGains: targetYearData.cumulativeReturns + targetYearData.cumulativeFees,
    fees: targetYearData.cumulativeFees,
    balance: targetYearData.balance,
  } : {
    contributions: 0,
    grossGains: 0,
    fees: 0,
    balance: 0,
  };

  // 20-year forecast (fixed horizon)
  const forecastIdx = Math.min(20, yearData.length) - 1;
  const forecastData = forecastIdx >= 0 ? yearData[forecastIdx] : null;
  const atForecast = forecastData ? {
    year: 20,
    balance: forecastData.balance,
    contributions: forecastData.cumulativeContributions,
    grossGains: forecastData.cumulativeReturns + forecastData.cumulativeFees,
    fees: forecastData.cumulativeFees,
  } : {
    year: 20,
    balance: 0,
    contributions: 0,
    grossGains: 0,
    fees: 0,
  };

  return {
    yearsToTarget,
    yearsToTargetReal,
    yearData,
    milestones,
    milestonesReal,
    finalBalance: yearData.length > 0 ? yearData[yearData.length - 1].balance : startingAmount,
    finalRealBalance: yearData.length > 0 ? yearData[yearData.length - 1].realBalance : startingAmount,
    totalContributions: cumulativeContributions,
    totalReturns: cumulativeReturns,
    totalFees,
    totalTax,
    atTarget,
    atForecast,
  };
}

export function formatAmount(amount: number): string {
  if (Math.abs(amount) >= 1000000) {
    return `${(amount / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(amount) >= 1000) {
    return amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return amount.toFixed(0);
}

export function formatYears(years: number | null): string {
  if (years === null) return '100+ years';
  if (years === 0) return 'Already there';
  if (years === 1) return '1 year';
  return `${years} years`;
}
