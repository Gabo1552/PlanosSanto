import type {OrderPlan,OrderRow} from './WorkshopPanel';
import {followsModel,restoreProposal,rowEdgeBlockers,rowNotes} from './workshopRules';

/** Origen de los cantos de la pieza (0.8.16, puntos 5 y 6): se leen solos de las caras pintadas al proponer el
 *  pedido. No hay lectura manual, ni «usar propuesta», ni origen observado/manual con motivo: si se cambian a mano
 *  quedan así y se puede volver a los del modelo con un clic. */
export default function EdgeReview({plan,row,disabled,onChange}:{plan:OrderPlan;row:OrderRow;disabled:boolean;onChange:(patch:Partial<OrderRow>)=>void}){
 const proposed=!!plan.proposed?.[row.id],model=followsModel(plan,row,'edges');
 const notes=rowNotes(plan,row,'edges'),blockers=rowEdgeBlockers(plan,row);
 return <div className="edge-review" data-field="edgeSource" role="group" aria-labelledby={`edge-source-${row.id}`}>
  <p id={`edge-source-${row.id}`}><strong>{!proposed?'Cantos cargados en el pedido.':model?'Cantos leídos de las caras pintadas del modelo.':'Cantos cambiados a mano en el pedido.'}</strong>{' '}Al cambiar ejes, cara o inversión cada canto sigue en su lado físico.</p>
  {!!(notes.length||blockers.length)&&<ul className="workshop-reasons" aria-label="Avisos de los cantos del modelo">{[...blockers,...notes].map(text=><li key={text} className="workshop-reason">{text}</li>)}</ul>}
  {proposed&&!model&&<button type="button" disabled={disabled} onClick={()=>onChange(restoreProposal(plan,row,'edges'))}>Volver a los cantos del modelo</button>}
 </div>;
}
