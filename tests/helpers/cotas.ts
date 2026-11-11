import {dimensionChoices} from '../../lib/dimensions';
import {TOTAL_DIMENSIONS,type DimensionDisplay,type Furniture} from '../../lib/model';

/**
 * 0.8.31: plans draw only the totals of the furniture by default. The tests that check the layout of the piece cotas
 * (as before 0.8.31) turn every piece cota on and the totals off, so that they keep checking exactly that layout.
 */
export function pieceDimensionsOnly(f:Furniture):DimensionDisplay{
  return {shownPieces:dimensionChoices(f).map(c=>({pieceId:c.pieceId,role:c.role})),hiddenTotals:[...TOTAL_DIMENSIONS]};
}
/** Every piece cota on, with the totals (the full sheet a user gets with «Mostrar todas las cotas»). */
export function allDimensions(f:Furniture):DimensionDisplay{
  return {shownPieces:dimensionChoices(f).map(c=>({pieceId:c.pieceId,role:c.role}))};
}
