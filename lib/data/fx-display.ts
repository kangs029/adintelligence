import { SEND_AMOUNT_USD, type FxProviderQuote } from "./fx";

export const PROMO_TIMING_SKEW_EPSILON_PCT = 0.1;

export function quoteQuality(provider: FxProviderQuote) {
  if (provider.effectiveMarginPctVsMid === null) {
    return {
      eligibleForBest: false,
      flagged: false,
      reason: null,
    };
  }

  if (provider.effectiveMarginPctVsMid < PROMO_TIMING_SKEW_EPSILON_PCT) {
    return {
      eligibleForBest: false,
      flagged: true,
      reason: "Likely promo or timing skew, verify.",
    };
  }

  return {
    eligibleForBest: true,
    flagged: false,
    reason: null,
  };
}

function hasReceiveAmount(
  provider: FxProviderQuote,
): provider is FxProviderQuote & { receiveAmountFor1000USD: number } {
  return provider.receiveAmountFor1000USD !== null;
}

function sortByReceiveAmount(
  left: FxProviderQuote & { receiveAmountFor1000USD: number },
  right: FxProviderQuote & { receiveAmountFor1000USD: number },
) {
  return right.receiveAmountFor1000USD - left.receiveAmountFor1000USD;
}

export function bestEligibleQuote(providers: readonly FxProviderQuote[]) {
  const withAmounts = providers.filter(hasReceiveAmount);
  const clean = withAmounts.filter((provider) => quoteQuality(provider).eligibleForBest);

  if (clean.length > 0) {
    return [...clean].sort(sortByReceiveAmount)[0];
  }

  return [...withAmounts]
    .filter((provider) => provider.status === "live")
    .sort(sortByReceiveAmount)[0];
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function quoteForSendAmount({
  midMarketRate,
  provider,
  sendAmountUSD,
}: {
  midMarketRate: number;
  provider: FxProviderQuote;
  sendAmountUSD: number;
}) {
  if (provider.quotedRate === null || provider.receiveAmountFor1000USD === null) {
    return {
      derived: false,
      effectiveMarginPctVsMid: null,
      receiveAmount: null,
    };
  }

  const providerAmount = provider.sendAmountUSD ?? SEND_AMOUNT_USD;
  const amountMatchesPayload = providerAmount === sendAmountUSD;
  const defaultAmount = sendAmountUSD === SEND_AMOUNT_USD && providerAmount === SEND_AMOUNT_USD;
  const receiveAmount =
    amountMatchesPayload || defaultAmount
      ? provider.receiveAmountFor1000USD
      : provider.quotedRate * Math.max(sendAmountUSD - (provider.feeUSD ?? 0), 0);
  const effectiveRate = receiveAmount / sendAmountUSD;

  return {
    derived: !defaultAmount && (provider.status !== "live" || !amountMatchesPayload),
    effectiveMarginPctVsMid: round(((midMarketRate - effectiveRate) / midMarketRate) * 100),
    receiveAmount: round(receiveAmount),
  };
}
