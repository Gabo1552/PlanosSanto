import type {SheetPiece,SheetSpec} from '../../sketchup_offline/ui/sheetOptimizer';
// Synthetic inputs; no private model, catalogue or supplier data.
const make=(count:number,base:number,height:number,rotate=false,prefix='piece'):SheetPiece[]=>Array.from({length:count},(_,i)=>({id:`${prefix}-${i}`,detail:`Synthetic ${prefix}-${i}`,base,height,rotate}));
const settings=(patch:Partial<SheetSpec>={}):SheetSpec=>({lengthMm:2600,widthMm:1830,trimMm:10,kerfMm:4.4,...patch});
export const GENERAL_REFERENCE_CASES=[
 {name:'three-large',spec:settings({lengthMm:2750}),pieces:make(3,1500,1500,true)},
 {name:'mixed-twelve',spec:settings(),pieces:[...make(8,764,580,true,'a'),...make(4,720,580,true,'b')]},
 {name:'exact-without-kerf',spec:settings({lengthMm:1220,widthMm:820,kerfMm:0}),pieces:make(4,600,400)},
 {name:'individual-grain-lock',spec:settings(),pieces:[...make(1,1810,2000,false,'locked'),...make(1,1810,2000,true,'rotate')]},
 {name:'custom-catalog-format',spec:settings({lengthMm:1734,widthMm:932,trimMm:7,kerfMm:3.2}),pieces:make(1,1720,918)},
 {name:'mixed-sixty',spec:settings({lengthMm:2800,widthMm:2070,trimMm:12}),pieces:Array.from({length:60},(_,i)=>({id:`varied-${i}`,detail:`Synthetic varied-${i}`,base:100+(i*97)%1100,height:80+(i*61)%700,rotate:i%3===0}))},
];
