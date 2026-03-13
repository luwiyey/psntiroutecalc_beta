import { MIN_DISCOUNT_FARE, MIN_REGULAR_FARE } from '../constants';
import type { AppSettings } from '../types';

export interface FareCalculation {
  reg: number;
  disc: number;
  rawReg: number;
  rawDisc: number;
  isMinApplied: boolean;
}

export const roundToNearestPeso = (value: number) => Math.ceil(value - 0.5);
export const formatFareRate = (value: number) => {
  const fixedToThree = value.toFixed(3);
  return fixedToThree.endsWith('0') ? value.toFixed(2) : fixedToThree;
};

export const calculateFare = (
  distance: number,
  settings: Pick<AppSettings, 'regularRate' | 'discountRate'>
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

  const rawReg = distance * settings.regularRate;
  const rawDisc = distance * settings.discountRate;
  const reg = Math.max(roundToNearestPeso(rawReg), MIN_REGULAR_FARE);
  const disc = Math.max(roundToNearestPeso(rawDisc), MIN_DISCOUNT_FARE);

  return {
    reg,
    disc,
    rawReg,
    rawDisc,
    isMinApplied: reg === MIN_REGULAR_FARE || disc === MIN_DISCOUNT_FARE
  };
};
