import type { RouteFareRules } from '../types';

export interface FareCalculation {
  reg: number;
  disc: number;
  rawReg: number;
  rawDisc: number;
  isMinApplied: boolean;
}

export const roundToNearestPeso = (value: number) => Math.ceil(value - 0.5);
export const roundToStandardPeso = (value: number) => Math.round(value);
export const formatFareRate = (value: number) => {
  const fixedToThree = value.toFixed(3);
  return fixedToThree.endsWith('0') ? value.toFixed(2) : fixedToThree;
};

export const calculateFare = (
  distance: number,
  fareRules: Pick<RouteFareRules, 'regularRate' | 'discountRate' | 'minimumRegularFare' | 'minimumDiscountFare' | 'roundingMode'>
): FareCalculation => {
  if (distance <= 0) {
    return {
      reg: 0,
      disc: 0,
      rawReg: 0,
      rawDisc: 0,
      isMinApplied: false
    };
  }

  const rawReg = distance * fareRules.regularRate;
  const rawDisc = distance * fareRules.discountRate;
  const roundFare = fareRules.roundingMode === 'standard' ? roundToStandardPeso : roundToNearestPeso;
  const roundedReg = roundFare(rawReg);
  const roundedDisc = roundFare(rawDisc);
  const reg =
    typeof fareRules.minimumRegularFare === 'number'
      ? Math.max(roundedReg, fareRules.minimumRegularFare)
      : roundedReg;
  const disc =
    typeof fareRules.minimumDiscountFare === 'number'
      ? Math.max(roundedDisc, fareRules.minimumDiscountFare)
      : roundedDisc;
  const isRegMinApplied =
    typeof fareRules.minimumRegularFare === 'number' && roundedReg < fareRules.minimumRegularFare;
  const isDiscMinApplied =
    typeof fareRules.minimumDiscountFare === 'number' && roundedDisc < fareRules.minimumDiscountFare;

  return {
    reg,
    disc,
    rawReg,
    rawDisc,
    isMinApplied: isRegMinApplied || isDiscMinApplied
  };
};
