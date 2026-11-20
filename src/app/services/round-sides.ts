/**
 * Attack/defense side parity for standard Valorant rounds.
 *
 * Spectra's round number is 1-based, but an unstarted observer connection may
 * still report round 0. Treat it as round 1 (the configured starting sides).
 *
 * 1-12: initial sides, 13-24: reversed, 25: initial sides again, and
 * every successive overtime round swaps sides.
 */
export function sideParityForRound(
  round: number,
  switchRound = 13,
  firstOvertimeRound = 25,
): boolean {
  const normalizedRound = Number.isInteger(round) && round > 0 ? round : 1;
  const halftimeRound = Number.isInteger(switchRound) && switchRound > 1 ? switchRound : 13;
  const overtimeRound =
    Number.isInteger(firstOvertimeRound) && firstOvertimeRound > halftimeRound
      ? firstOvertimeRound
      : 25;

  if (normalizedRound < halftimeRound) return false;
  if (normalizedRound < overtimeRound) return true;
  return (normalizedRound - overtimeRound) % 2 === 1;
}

/**
 * Compare the producer's displayed round with the last Spectra match round.
 *
 * The source client's isAttacking values already reflect any side switches
 * that Spectra successfully detected. In a detection outage, the client may
 * be stuck on an earlier round. Only apply the missing switches, avoiding
 * a second flip when Spectra itself reaches halftime/overtime.
 *
 * The producer never needs a side-selection control.
 */
export function shouldFlipSidesForManualRound(
  producerRound: number,
  spectraRound: number,
  switchRound = 13,
  firstOvertimeRound = 25,
): boolean {
  return (
    sideParityForRound(producerRound, switchRound, firstOvertimeRound) !==
    sideParityForRound(spectraRound, switchRound, firstOvertimeRound)
  );
}
