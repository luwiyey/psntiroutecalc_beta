# Cabanatuan fare guide review

Source: user-supplied `7d75c825-d79d-42a6-8d32-bb699e876237.jfif`, received October 1, 2026.

This review covers Cabanatuan-Baguio via Tarlac and via San Jose only.
The image contains conflicting values; unresolved rows must not be silently
corrected or published as approved route data.

## Clear changes

| Item | Via Tarlac | Via San Jose |
| --- | --- | --- |
| Regular rate per km | PHP 2.70 | PHP 2.70 |
| Discount rate per km | PHP 2.16 | PHP 2.16 |
| Minimum distance window | 1-26 km | 1-26 km |
| Cabanatuan KM | 86 | 83 |
| Baguio KM | 281 | 281 |
| Printed Cabanatuan-Baguio fare | PHP 527 / 421 | PHP 535 / 428 |

The via Tarlac minimum is consistently PHP 70 regular / PHP 56 discounted
in both the header and rows. This minimum is patched locally with boundary tests.
The KM-post replacement and via San Jose minimum are now confirmed and are
being integrated from this guide.

## Source conflicts requiring confirmation

- Via San Jose header says PHP 60 minimum, but the user confirmed that the
  rows are authoritative: PHP 70 regular / PHP 56 discounted.
- The image prints Maoasoas as KM 289, but the user confirmed the correct KM
  is KM 239, between San Luis at KM 237 and Pugo at KM 245.
- Via Tarlac's San Isidro row sharing KM 165 with Apulid appears to show
  PHP 213 / 186; the stated formula from KM 86 gives PHP 213 / 171.
  Confirm whether the formula takes precedence over inconsistent printed cells.

## Integration requirements once confirmed

- Replace the two route-specific KM lists and add the newly listed stops.
- Preserve known stop aliases where the same place is retained, without
  conflating distinct places that share a KM.
- Do not shift shared Bayambang, Tarlac-only, or Cubao stop datasets.
- Recompute endpoint distances against each route's actual Baguio endpoint;
  the existing seed helper assumes KM 271.
- Check terminal-to-terminal fares, minimum boundaries, reverse travel,
  stop ordering, and voice stop matching before deployment.
- Keep same-origin/destination journeys at zero; the terminal's printed
  minimum-fare cell is not a fare for travelling zero distance.

The confirmed route and minimum-fare changes are being tested before push and
deployment. The older unrelated worktree changes remain untouched.
