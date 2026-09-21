"""Synthetic QR layout experiment; no deployed address or activation secret."""
from pathlib import Path
import json
from reportlab.graphics.barcode import qrencoder
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent
payloads={'compact':'ODP:TEST:07R1:202609000000027:27','web':'https://example.invalid/test/07R1/202609000000027/27'}
results=[]
for name,payload in payloads.items():
 qr=qrencoder.QRCode(None,3) # Q error correction
 qr.addData(payload);qr.make()
 n=qr.moduleCount;total=n+8;scale=12
 im=Image.new('RGB',(total*scale,total*scale),'white');d=ImageDraw.Draw(im)
 rects=[]
 for y,row in enumerate(qr.modules):
  for x,on in enumerate(row):
   if on:
    d.rectangle(((x+4)*scale,(y+4)*scale,(x+5)*scale-1,(y+5)*scale-1),fill='black')
    rects.append(f'<rect x="{x+4}" y="{y+4}" width="1" height="1"/>')
 im.save(root/f'{name}.png')
 for mm in [12,15,18,20]:
  (root/f'{name}-{mm}mm.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{mm}mm" height="{mm}mm" viewBox="0 0 {total} {total}"><rect width="{total}" height="{total}" fill="white"/><g fill="black">'+''.join(rects)+'</g></svg>')
 results.append({'name':name,'payload':payload,'bytes':len(payload.encode()),'qrVersion':qr.version,'dataModules':n,'totalModulesIncludingQuietZone':total,'errorCorrection':'Q','moduleSizeMm':{str(mm):round(mm/total,4) for mm in [12,15,18,20]}})
(root/'metrics.json').write_text(json.dumps(results,indent=2)+'\n')
# Physical SVG sheet: print at 100%, verify the 50 mm ruler.
parts=['<svg xmlns="http://www.w3.org/2000/svg" width="180mm" height="100mm" viewBox="0 0 180 100"><rect width="180" height="100" fill="white"/><g font-family="sans-serif" font-size="3"><text x="5" y="7">ODP 0.7 TEST ONLY - Q ECC - print 100%</text>']
for row,name in enumerate(payloads):
 y=15+row*35;parts.append(f'<text x="5" y="{y}">{name}</text>')
 for col,mm in enumerate([12,15,18,20]):
  x=25+col*36
  svg=(root/f'{name}-{mm}mm.svg').read_text().replace('<svg ',f'<svg x="{x}" y="{y}" ',1).replace(f'width="{mm}mm" height="{mm}mm"',f'width="{mm}" height="{mm}"')
  parts.extend([svg,f'<text x="{x}" y="{y+mm+4}">{mm} mm</text>'])
parts.extend(['<path d="M5 94 H55 M5 92 V96 M55 92 V96" stroke="black" stroke-width="0.3"/><text x="60" y="95">50 mm</text></g></svg>'])
(root/'print-sheet.svg').write_text(''.join(parts))
print(json.dumps(results,indent=2))
