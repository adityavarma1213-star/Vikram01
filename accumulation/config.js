/* VIKRAM Accumulation Scanner configuration. Pure data; safe to import in browser or Node. */
const ACCUMULATION_CONFIG = Object.freeze({
  historyDays: 20,
  minConfirmedHistory: 10,
  freshnessDays: 1,
  flatPricePct: 0.25,
  volumeRatio: { strong: 1.5, elevated: 1.2 },
  deliveryPct: { strong: 55, positive: 45 },
  deliveryTrendLookback: 5,
  obvLookback: 5,
  oi: { strong: 5, positive: 2 },
  weights: { price: 15, volume: 20, delivery: 20, obv: 15, futuresOi: 30 },
  verdicts: {
    confirmed: 75,
    starting: 55,
    mixed: 35
  },
  confirmedGates: {
    minVolumeRatio: 1.2,
    minDeliveryPct: 45,
    requirePositivePrice: true,
    requireRisingObv: true,
    requirePositiveExactDateOi: true
  },
  watchlist: ['ONGC', 'VBL', 'BSE', 'NMDC']
});

if (typeof window !== 'undefined') window.ACCUMULATION_CONFIG = ACCUMULATION_CONFIG;
if (typeof module !== 'undefined') module.exports = ACCUMULATION_CONFIG;
