"""Deterministic vector logo explorations; no production assets are replaced."""
from pathlib import Path
import json
import subprocess
import zipfile
from fontTools.ttLib import TTCollection
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
P, R, INK, PAPER = '#5B3B8C', '#BD4055', '#282331', '#F5F2F8'
ZH = TTCollection('/System/Library/Fonts/Hiragino Sans GB.ttc').fonts[2]
ZH_LIGHT = TTCollection('/System/Library/Fonts/Hiragino Sans GB.ttc').fonts[0]
EN = TTCollection('/System/Library/Fonts/Avenir Next.ttc').fonts[2]
MARK_INDEX = 0

def text_width(value, size, spacing=0, font=ZH):
    cmap = font.getBestCmap(); units = font['head'].unitsPerEm
    return sum(font['hmtx'][cmap[ord(char)]][0] * size / units for char in value) + max(0, len(value)-1) * spacing

def text(value, x, y, size, color=INK, spacing=0, font=ZH, anchor='start'):
    if anchor == 'middle': x -= text_width(value, size, spacing, font) / 2
    if anchor == 'end': x -= text_width(value, size, spacing, font)
    cmap = font.getBestCmap(); glyphs = font.getGlyphSet(); units = font['head'].unitsPerEm
    result = []
    for char in value:
        name = cmap[ord(char)]; pen = SVGPathPen(glyphs); glyphs[name].draw(pen)
        result.append(f'<path fill="{color}" transform="translate({x:.3f} {y:.3f}) scale({size/units:.6f} {-size/units:.6f})" d="{pen.getCommands()}"/>')
        x += font['hmtx'][name][0] * size / units + spacing
    return ''.join(result)

def rect(x,y,w,h,color,rx=0,stroke=None):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{color}"'+(f' stroke="{stroke}"' if stroke else '')+'/>'

def line(x1,y1,x2,y2,color='#E6DFED',width=1):
    return f'<path d="M{x1} {y1}H{x2}" stroke="{color}" stroke-width="{width}"/>' if y1==y2 else f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{color}" stroke-width="{width}"/>'

CONCEPTS = [
    dict(id='A',slug='side-by-side',name='并肩',en='SIDE BY SIDE',desc='各自有节奏，一起向前。',use='运动感最强，适合跑步服与活动旗帜。'),
    dict(id='B',slug='tong-seal',name='同印',en='THE TONG MARK',desc='以「同」为记忆，把名字变成标志。',use='更稳重，适合作为小程序和长期主标。'),
    dict(id='C',slug='gather',name='共席',en='ROOM FOR EVERYONE',desc='来自不同地方，相聚在同一个中心。',use='更亲近，适合校园、社团与同城活动。'),
    dict(id='D',slug='shared-paths',name='同路',en='PATHS THAT CONNECT',desc='不同的路径，也能同行。',use='更流动，适合运动社群与品牌辅助纹样。'),
]

def mark(identifier, x=0, y=0, size=200, mode='color'):
    global MARK_INDEX
    MARK_INDEX += 1
    a, b = (P,R) if mode=='color' else ('#FFFFFF','#FFFFFF') if mode=='reverse' else (INK,INK)
    if identifier=='A':
        body = f'<g transform="translate(-6 0) scale(.94 1)"><path fill="{a}" d="M12 151 72 47H109L68 118H123L104 151Z"/><path fill="{b}" d="M116 151 167 63H204L172 118H208L189 151Z"/></g>'
    elif identifier=='B':
        body = f'<path fill="{a}" d="M42 22H158Q178 22 178 42V178H148V56Q148 52 144 52H56Q52 52 52 56V178H22V42Q22 22 42 22Z"/><path fill="{b}" d="M118 22H158Q178 22 178 42V76H148V56Q148 52 144 52H118Z"/><path fill="{a}" d="M68 78H132V96H68Z M74 112H126Q132 112 132 118V160H68V118Q68 112 74 112Z M86 130V142H114V130Z" fill-rule="evenodd"/>'
    elif identifier=='C':
        shape='M90 26H48Q26 26 26 48V90H54V60Q54 54 60 54H90Z'
        body=''.join(f'<path fill="{color}" d="{shape}" transform="{transform}"/>' for color,transform in [(a,''),(b,'translate(200 0) scale(-1 1)'),(a,'translate(0 200) scale(1 -1)'),(a,'translate(200 200) scale(-1 -1)')])
    else:
        mask_id='separation-'+str(MARK_INDEX)
        right='M92 45H130C156 45 172 63 172 88S156 131 130 131H92'
        body=f'<g transform="rotate(-24 100 100)" fill="none" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"><defs><mask id="{mask_id}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="300" height="300"><rect x="-50" y="-50" width="300" height="300" fill="white"/><path d="{right}" stroke="black" stroke-width="41"/></mask></defs><path mask="url(#{mask_id})" stroke="{a}" d="M108 69H70C44 69 28 87 28 112S44 155 70 155H108"/><path stroke="{b}" d="{right}"/></g>'
    return f'<g transform="translate({x} {y}) scale({size/200})">{body}</g>'

def lockup(identifier,x,y,width=700,mode='color'):
    scale=width/700; color='#FFFFFF' if mode=='reverse' else INK
    inner=mark(identifier,0,0,160,mode)+text('同行者众',190,111,94,color,spacing=4)
    return f'<g transform="translate({x} {y}) scale({scale})">{inner}</g>'

def svg(width,height,body,title='同行者众品牌设计方向'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><title>{title}</title>{body}</svg>'

def save_svg(name,width,height,body,folder='svg'):
    dest=ROOT/folder/name;dest.write_text(svg(width,height,body),encoding='utf-8');return dest

def render(source,dest,width=None):
    cmd=['rsvg-convert',str(source),'-o',str(dest)]
    if width:cmd+=['-w',str(width)]
    subprocess.run(cmd,check=True,capture_output=True)

def assets():
    for c in CONCEPTS:
        stem=c['id']+'-'+c['slug']
        for mode in ['color','mono','reverse']:
            f=save_svg(stem+'-mark-'+mode+'.svg',200,200,mark(c['id'],mode=mode))
            render(f,ROOT/'png'/(f.stem+'.png'),2048)
            f=save_svg(stem+'-horizontal-'+mode+'.svg',760,200,lockup(c['id'],20,20,700,mode))
            render(f,ROOT/'png'/(f.stem+'.png'),3040)
        f=save_svg(stem+'-stacked.svg',600,550,mark(c['id'],145,30,310)+text('同行者众',300,449,70,spacing=4,anchor='middle'))
        render(f,ROOT/'png'/(f.stem+'.png'),1800)
        f=save_svg(stem+'-app-icon.svg',256,256,rect(0,0,256,256,P,58)+mark(c['id'],30,30,196,'reverse'))
        render(f,ROOT/'png'/(f.stem+'.png'),1024)

def overview():
    w,h=2000,1610
    body=rect(0,0,w,h,PAPER)
    body+=text('TONGXINGZHEZHONG',75,66,18,P,spacing=3,font=EN)
    body+=text('让「同行」，成为一个记得住的符号。',75,148,49,spacing=1)
    body+=text('品牌标志探索 / 04 个方向',1925,69,20,'#85798E',font=ZH_LIGHT,anchor='end')
    body+=text('紫红相遇。由山野，走向更多相聚。',78,201,23,'#887B96',font=ZH_LIGHT)
    for index,c in enumerate(CONCEPTS):
        x=72+(index%2)*956;y=253+(index//2)*638
        body+=rect(x,y,900,598,'#FFFFFF',24, '#D7C8E7' if c['id']=='B' else '#E5DEEC')
        body+=text(c['id'],x+38,y+56,24,P,font=EN)
        body+=text(c['name'],x+80,y+55,25,INK)
        body+=text(c['en'],x+860,y+53,12,'#9B8AA8',spacing=1.8,font=EN,anchor='end')
        body+=lockup(c['id'],x+58,y+127,778)
        body+=text(c['desc'],x+52,y+360,26,INK)
        body+=text(c['use'],x+52,y+403,21,'#92839D',font=ZH_LIGHT)
        body+=line(x+48,y+440,x+852,y+440)
        body+=rect(x+52,y+471,74,74,P,17)+mark(c['id'],x+60,y+479,58,'reverse')
        body+=mark(c['id'],x+164,y+466,80,'mono')
        body+=rect(x+278,y+471,74,74,INK,17)+mark(c['id'],x+286,y+479,58,'reverse')
        body+=text('图标 / 单色 / 反白',x+387,y+517,18,'#A08FAA',font=ZH_LIGHT)
        body+=f'<circle cx="{x+789}" cy="{y+506}" r="12" fill="{P}"/><circle cx="{x+824}" cy="{y+506}" r="12" fill="{R}"/>'
    body+=text('同行者众',76,1570,23,INK)
    body+=text('活动海报 / 跑步服 / 社群服装 / 小程序',1923,1568,20,'#95859E',font=ZH_LIGHT,anchor='end')
    f=save_svg('01-four-directions.svg',w,h,body,'boards');render(f,f.with_suffix('.png'))

def detail(c):
    w,h=1200,1510;identifier=c['id']
    body=rect(0,0,w,h,'#FFFFFF')+text(identifier+' / '+c['en'],64,64,18,P,spacing=1.5,font=EN)
    body+=text(c['name'],65,143,59)
    body+=text(c['desc'],65,191,23,'#95839E',font=ZH_LIGHT)
    body+=rect(65,245,1070,645,PAPER,24)
    body+=mark(identifier,395,280,410)
    body+=text('同行者众',600,786,90,spacing=5,anchor='middle')
    body+=text('COLOUR',67,952,15,'#9D8BA8',spacing=2,font=EN)
    body+=text('ONE COLOUR',440,952,15,'#9D8BA8',spacing=2,font=EN)
    body+=text('REVERSED',810,952,15,'#9D8BA8',spacing=2,font=EN)
    body+=mark(identifier,86,1000,258)
    body+=mark(identifier,470,1000,258,'mono')
    body+=rect(810,991,325,280,P,20)+mark(identifier,842,1000,258,'reverse')
    body+=line(65,1320,1135,1320)
    body+=text('建议组合',65,1376,22,P)
    body+=text('图形独立识别，字标用于首次接触；服装支持单色印制。',65,1422,22,'#95839E',font=ZH_LIGHT)
    f=save_svg('02-'+identifier+'-identity.svg',w,h,body,'boards');render(f,f.with_suffix('.png'))

def shirt(x,y,identifier,back=False):
    # Flat apparel placement drawing, deliberately labelled as a production-placement study.
    d='M140 30 207 58 274 30 340 68 411 145 359 207 316 176 322 450Q207 475 92 450L98 176 55 207 3 145 74 68Z'
    b=f'<g transform="translate({x} {y})"><path d="{d}" fill="#FDFCFE" stroke="#DDD5E6" stroke-width="2"/><path d="M140 30Q207 118 274 30L253 21Q207 69 161 21Z" fill="#EAE3F1"/><path d="M140 30Q207 118 274 30M98 176 74 68M316 176 340 68M95 431Q207 449 320 431M20 146 60 191M394 146 355 191" fill="none" stroke="#E7DFEF" stroke-width="2"/>'
    if back:
        b+=mark(identifier,110,121,195,'mono')+text('同行者众',208,347,35,spacing=2,anchor='middle')
    else:
        b+=mark(identifier,242,130,55,'mono')
        b+=text('同行者众',207,296,43,spacing=2,anchor='middle')
        b+=text('TOGETHER, WE GO',207,330,10,'#8D7C9C',spacing=2,font=EN,anchor='middle')
    return b+'</g>'

def application(identifier):
    w,h=1600,1430
    body=rect(0,0,w,h,PAPER)+text('同行者众 / '+identifier+' 方案应用',70,87,34)
    body+=text('服装位置与海报排版示意',1530,85,19,'#9684A2',font=ZH_LIGHT,anchor='end')
    body+=rect(70,137,790,1165,'#EEE9F3',22)
    body+=text('WEAR IT TOGETHER',110,200,14,P,spacing=2,font=EN)
    body+=shirt(248,245,identifier)
    body+=shirt(248,764,identifier,True)
    body+=text('前胸组合 / 单色背标',465,1270,20,'#95849F',font=ZH_LIGHT,anchor='middle')
    x,y=897,137
    body+=rect(x,y,633,1165,P,22)
    body+=lockup(identifier,x+49,y+44,410,'reverse')
    body+=text('这周末',x+54,y+332,100,'#FFFFFF',spacing=2)
    body+=text('一起出发',x+54,y+458,100,'#FFFFFF',spacing=2)
    body+=text('校园 / 跑步 / 同城相聚',x+59,y+533,23,'#D1BFDF',font=ZH_LIGHT)
    body+=mark(identifier,x+108,y+600,430,'reverse')
    body+=rect(x+52,y+1057,530,1,'#896BA8')
    body+=text('GOOD COMPANY. GREAT DAYS.',x+56,y+1106,16,'#D1BFDF',spacing=1.5,font=EN)
    body+=text('平面服装与活动海报示意，展示单色适应性及远距离识别。',73,1372,22,'#95839E',font=ZH_LIGHT)
    f=save_svg('03-'+identifier+'-applications.svg',w,h,body,'boards');render(f,f.with_suffix('.png'))

def proofs():
    w,h=1400,1290
    b=rect(0,0,w,h,'#FFFFFF')+text('缩小以后，还能一眼认出。',66,92,44)
    b+=text('纯图形 / 单色 / 小程序图标 / 横向组合',68,143,22,'#9784A0',font=ZH_LIGHT)
    for i,c in enumerate(CONCEPTS):
        y=225+i*235
        b+=text(c['id']+' '+c['name'],70,y+71,27,P)
        for j,size in enumerate([24,32,48,72]):
            x=265+j*135
            b+=mark(c['id'],x,y+90-size,size,'mono')
            b+=text(str(size)+' px',x+size/2,y+136,15,'#9B88A4',font=EN,anchor='middle')
        b+=rect(850,y+8,96,96,P,24)+mark(c['id'],860,y+18,76,'reverse')
        b+=lockup(c['id'],1012,y+24,303)
        b+=line(68,y+184,1332,y+184)
    b+=text('每个主标均提供独立 SVG 与透明 PNG；字标已转为路径。',70,1232,21,'#9784A0',font=ZH_LIGHT)
    f=save_svg('04-size-and-monochrome.svg',w,h,b,'boards');render(f,f.with_suffix('.png'))

def manifest():
    (ROOT/'concepts.json').write_text(json.dumps({'brand':'同行者众','palette':{'purple':P,'red':R,'ink':INK},'concepts':CONCEPTS,'method':'Original deterministic vector path construction; lettering converted to outlines. No image-generation model used.'},ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':
    assets();overview()
    for c in CONCEPTS:detail(c)
    for identifier in ['A','B']:application(identifier)
    proofs();manifest()
    print('Generated vector assets, transparent PNGs, and presentation boards in',ROOT)
