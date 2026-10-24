"""Offline hypothesis sweep. Research only: never used by the extension or its RBZ.
No supplier cut list, project name or paths are included in the JSON output.
python3 scripts/calibrate_experto.py --expected 27,11,12,56 a.json b.json c.json d.json
"""
import argparse
import json
import math
from pathlib import Path


def validate(data):
    board = data.get('placa', {})
    for key in ('base', 'altura'):
        value = board.get(key)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value <= 10:
            raise ValueError('Invalid board dimensions')
    if not isinstance(board.get('veta'), bool) or not isinstance(data.get('cortes'), list):
        raise ValueError('Invalid grain or cut list')
    count = 0
    for row in data['cortes']:
        if not isinstance(row.get('cantidad'), int) or isinstance(row['cantidad'], bool) or row['cantidad'] < 1:
            raise ValueError('Invalid quantity')
        count += row['cantidad']
        for key in ('base', 'altura'):
            value = row.get(key)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 50:
                raise ValueError('Invalid cut dimensions')
        if not isinstance(row.get('rota'), bool):
            raise ValueError('Invalid rotation')
    if count > 20000:
        raise ValueError('Audit limited to 20000 pieces')

def run(D,order='perimeter',rule='minarea',depth=2,orientation='normal'):
 validate(D)
 k=4.4;L=D['placa']['base']-10;H0=D['placa']['altura']-10
 P=[(p['id']+1,p['base'],p['altura'],p['rota'] and not D['placa']['veta']) for p in D['cortes'] for _ in range(p['cantidad'])]
 sorts={'area':lambda p:(-p[1]*p[2],-max(p[1:3])),'perimeter':lambda p:(-p[1]-p[2],-max(p[1:3])),'long':lambda p:(-max(p[1:3]),-p[1]*p[2]),'height':lambda p:(-p[2],-p[1]),'width':lambda p:(-p[1],-p[2])}
 sheets=[]
 for id,base,height,rotate in sorted(P,key=sorts[order]):
  fit=None
  for s in sheets:
   for i,n in enumerate(s['free']):
    opts=[(base,height)]+([(height,base)] if rotate else [])
    if orientation=='rotated':opts.reverse()
    elif orientation=='short':opts.sort(key=lambda o:min(n[2]-o[0]-k,n[3]-o[1]-k) if o[0]+k<=n[2]+1e-9 and o[1]+k<=n[3]+1e-9 else float('inf'))
    elif orientation=='repeat':opts.sort(key=lambda o:-(int(n[2]/(o[0]+k))*int(n[3]/(o[1]+k))))
    for w,h in opts:
     if w+k<=n[2]+1e-9 and h+k<=n[3]+1e-9:fit=(s,i,n,w,h);break
    if fit:break
   if fit:break
  if not fit:
   s={'free':[(0,0,L+k,H0+k,0)],'p':[],'cuts':[]};sheets.append(s)
   opts=[(base,height)]+([(height,base)] if rotate else [])
   if orientation=='rotated':opts.reverse()
   elif orientation=='short':opts.sort(key=lambda o:min(L-o[0],H0-o[1]) if o[0]<=L and o[1]<=H0 else float('inf'))
   elif orientation=='repeat':opts.sort(key=lambda o:-(int((L+k)/(o[0]+k))*int((H0+k)/(o[1]+k))))
   for w,h in opts:
    if w<=L and h<=H0:fit=(s,0,s['free'][0],w,h);break
  if not fit:raise ValueError('no fit')
  s,i,(x,y,W,H,d),w,h=fit;s['free'].pop(i);s['p'].append((id,x,y,w,h));a=round(H-h-k,6);b=round(W-w-k,6)
  horizontal={'reference':a>b,'horizontal':True,'vertical':False,'minarea':b*H<W*a,'maxarea':b*H>=W*a,'shorter':W<=H,'longer':W>H}[rule]
  if horizontal:
   if a>0:s['cuts'].append(W)
   if d<depth and a>k:s['free'].append((x,y+h+k,W,a,d))
   if b>0:s['cuts'].append(h+k)
   if d<depth and b>k:s['free'].append((x+w+k,y,b,h+k,d+1))
  else:
   if b>0:s['cuts'].append(H)
   if d<depth and b>k:s['free'].append((x+w+k,y,b,H,d))
   if a>0:s['cuts'].append(w+k)
   if d<depth and a>k:s['free'].append((x,y+h+k,w+k,a,d+1))
 return {'boards':len(sheets),'metres':round(sum(2*L+2*H0+sum(s['cuts']) for s in sheets)/1000,4),'steps':sum(2+len(s['cuts']) for s in sheets),'first':[p[0] for p in sheets[0]['p']],'sheets':sheets}
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sources', nargs='+', type=Path)
    parser.add_argument('--expected', help='Comma-separated supplier board counts in source order')
    args = parser.parse_args()
    data = [json.loads(path.read_text(encoding='utf-8')) for path in args.sources]
    for d in data:
        validate(d)
    target = [int(n) for n in args.expected.split(',')] if args.expected else None
    if target is not None and (len(target) != len(data) or any(n < 0 for n in target)):
        parser.error('Expected counts must match sources')
    results = []
    for order in ['area', 'perimeter', 'long', 'height', 'width']:
        for rule in ['reference', 'horizontal', 'vertical', 'minarea', 'maxarea', 'shorter', 'longer']:
            for depth in [2, 10000]:
                for orientation in ['normal', 'rotated', 'short', 'repeat']:
                    res = [run(d, order, rule, depth, orientation) for d in data]
                    counts = [r['boards'] for r in res]
                    results.append({'order': order, 'rule': rule, 'depth': depth, 'orientation': orientation,
                                    'boards': counts, 'metres': [r['metres'] for r in res],
                                    'steps': [r['steps'] for r in res],
                                    'distance': sum(abs(a-b) for a, b in zip(counts, target)) if target else None})
    if target:
        results.sort(key=lambda r: r['distance'])
    print(json.dumps({'scope': 'Experimental, no product change or commercial approval',
                      'cases': len(data), 'variants': len(results), 'expectedBoards': target,
                      'matchingAllCounts': sum(r['boards'] == target for r in results) if target else None,
                      'results': results}, indent=2))
