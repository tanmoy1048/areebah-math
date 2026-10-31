"""Segment Jacaranda Grade 10 exercise sets into questions/parts and crop figures.

Outputs:
  assets/extracted_images/ch{X}_ex{Y}_q{Z}_fig{N}.png
  data/figure_manifest.json   {entry_id: [relative image paths]}
  data/segments.json          {chapter: [{set, title, questions:[{num, parts:[...], figs:[...]}]}]}
"""
import bisect, json, os, re, sys
import pymupdf

ROOT = '/Users/rsadat/Desktop/Math'
CHAPTERS = [
    (5, 'Chapter_05_Trigonometry_I.pdf'),
    (6, 'Chapter_06_Surface_Area_and_Volume.pdf'),
    (9, 'Chapter_09_Non-linear_Relationships.pdf'),
    (11, 'Chapter_11_Probability.pdf'),
    (15, 'Chapter_15_Trigonometry_II_10A.pdf'),
]
H = 2000  # global y offset per page


def bold(span):
    return any(k in span['font'] for k in ('Bd', 'Md', 'Hv'))


def lines_of(doc):
    for pi, page in enumerate(doc):
        for b in page.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                spans = [s for s in l['spans'] if s['text'].strip()]
                if not spans:
                    continue
                txt = ''.join(s['text'] for s in l['spans']).strip()
                yield pi, page, spans, txt


def segment(doc, chap):
    # Build ordered marker list: (gy, page, kind, payload)
    markers = []
    cur_set = None
    for pi, page, spans, txt in lines_of(doc):
        s0 = spans[0]
        gy = pi * H + s0['bbox'][1]
        if re.search(r'LEARNING INTENTIONS|WORKED EXAMPLE', txt):
            markers.append((gy, pi, 'BOUND', None))
        if txt == 'Individual pathways':
            markers.append((gy, pi, 'PATH', cur_set))
        elif re.match(r'^Answers\b', txt) and s0['size'] >= 12:
            markers.append((gy, pi, 'END', None))
        elif re.search(r'Quick quiz|Review questions|Pre-test', txt):
            m = re.search(r'(\d+)\.(\d+)', txt)
            if m and int(m.group(1)) == chap:
                cur_set = int(m.group(2))
                kind = 'REVIEW' if 'Review' in txt else ('PRE' if 'Pre-test' in txt else 'QQ')
                markers.append((gy, pi, kind, cur_set))
        elif bold(s0) and 8.5 <= s0['size'] <= 9.5 and s0['bbox'][0] < 110:
            t = s0['text'].strip()
            if re.fullmatch(r'\d{1,2}\.', t) and s0['bbox'][0] < 95:
                markers.append((gy, pi, 'Q', int(t[:-1])))
            elif re.fullmatch(r'[a-h]\.', t):
                markers.append((gy, pi, 'P', t[0]))
    markers.sort(key=lambda m: m[0])

    # Walk markers: keep sequential question runs inside each active set
    sets = []
    active = None
    last_q = 0
    last_p = None
    for gy, pi, kind, val in markers:
        if kind in ('PATH', 'PRE', 'REVIEW'):
            if active and active['questions']:
                sets.append(active)
            title_set = val if val is not None else cur_set
            active = {'set': title_set, 'kind': kind, 'questions': [], 'pathways': kind == 'PATH'}
            last_q, last_p = 0, None
        elif kind == 'QQ':
            if active and active['questions']:
                sets.append(active)
            active = None
        elif kind == 'END':
            if active and active['questions']:
                sets.append(active)
            active = None
        elif active is None:
            continue
        elif kind == 'Q':
            if val == last_q + 1 and (active['kind'] != 'PATH' or active['questions'] is not None):
                active['questions'].append({'num': val, 'gy': gy, 'page': pi, 'parts': []})
                last_q, last_p = val, None
            else:
                # numbering restarted: this run is over, stop attributing questions to the set
                if active['questions']:
                    sets.append(active)
                active = None
        elif kind == 'P' and active and active['questions']:
            expected = 'a' if last_p is None else chr(ord(last_p) + 1)
            if val == expected:
                q = active['questions'][-1]
                q['parts'].append({'letter': val, 'gy': gy, 'page': pi})
                last_p = val
    if active and active['questions']:
        sets.append(active)
    return sets, markers


def graphics_on_page(page):
    W, Hh = page.rect.width, page.rect.height
    rects = []
    for d in page.get_drawings():
        r = d['rect']
        if r.y0 < 45 or r.y1 > Hh - 45:
            continue
        if r.width > 0.95 * W and r.height > 0.95 * Hh:
            continue
        if r.width < 25 and r.height < 25:
            continue
        rects.append(pymupdf.Rect(r))
    for info in page.get_image_info():
        r = pymupdf.Rect(info['bbox'])
        if r.width < 25 and r.height < 25:
            continue
        rects.append(r)
    return rects


def cluster(rects, gap=10):
    groups = []
    for r in rects:
        grown = pymupdf.Rect(r.x0 - gap, r.y0 - gap, r.x1 + gap, r.y1 + gap)
        merged = [g for g in groups if any(grown.intersects(x) for x in g['members'])]
        new = {'bbox': pymupdf.Rect(r), 'members': [pymupdf.Rect(r)]}
        for g in merged:
            new['bbox'] |= g['bbox']
            new['members'] += g['members']
            groups.remove(g)
        groups.append(new)
    return [g['bbox'] for g in groups]


def figure_regions(doc, sets, chap, outdir, markers):
    """Assign cropped figures to the question/part they sit inside."""
    manifest, summary = {}, []
    gys = sorted(m[0] for m in markers)

    def next_gy(g):
        i = bisect.bisect_right(gys, g)
        return gys[i] if i < len(gys) else None

    for s in sets:
        setnum = s['set']
        qs = s['questions']
        for qi, q in enumerate(qs):
            end_gy = next_gy(q['gy'])
            start = q['gy']
            # Segment list: question stem region, then each part region
            bounds = []
            if q['parts']:
                bounds.append(('q', start, q['parts'][0]['gy']))
                for pi_, p in enumerate(q['parts']):
                    nxt = q['parts'][pi_ + 1]['gy'] if pi_ + 1 < len(q['parts']) else end_gy
                    bounds.append(('p:' + p['letter'], p['gy'], nxt))
            else:
                bounds.append(('q', start, end_gy))
            figs = []
            for tag, a, b in bounds:
                if b is None:
                    b = a + H  # to end of document; limited by the next marker naturally
                for pi in range(len(doc)):
                    if not (a < pi * H + 0 or True):
                        continue
                    lo, hi = max(a, pi * H), min(b, (pi + 1) * H)
                    if hi <= lo:
                        continue
                    page = doc[pi]
                    rects = [r for r in graphics_on_page(page)
                             if lo <= pi * H + (r.y0 + r.y1) / 2 < hi]
                    if not rects:
                        continue
                    for box in cluster(rects):
                        if box.width < 8 or box.height < 8:
                            continue
                        if box.width * box.height > 0.4 * doc[pi].rect.width * doc[pi].rect.height:
                            continue
                        figs.append({'tag': tag, 'page': pi, 'box': box, 'gy': pi * H + box.y0})
            figs.sort(key=lambda f: f['gy'])
            # Group sorted figures by question for numbering
            entry_figs = []
            for n, f in enumerate(figs, 1):
                fname = f'ch{chap}_ex{setnum}_q{q["num"]}_fig{n}.png'
                page = doc[f['page']]
                # include text spans (dimension labels) that fall inside the figure box
                box = pymupdf.Rect(f['box'].x0 - 18, f['box'].y0 - 14, f['box'].x1 + 18, f['box'].y1 + 14)
                box &= page.rect
                for b_ in page.get_text('dict')['blocks']:
                    for l_ in b_.get('lines', []):
                        for sp in l_['spans']:
                            sb = pymupdf.Rect(sp['bbox'])
                            if sb.intersects(box) and box.contains(sb):
                                box |= sb
                if not os.path.exists(outdir):
                    os.makedirs(outdir)
                pix = page.get_pixmap(clip=box, dpi=200)
                pix.save(os.path.join(outdir, fname))
                rel = f'assets/extracted_images/{fname}'
                if f['tag'] == 'q':
                    keys = [f'ch{chap}_ex{setnum}_q{q["num"]}{p["letter"]}' for p in q['parts']] or [f'ch{chap}_ex{setnum}_q{q["num"]}']
                else:
                    keys = [f'ch{chap}_ex{setnum}_q{q["num"]}{f["tag"][2:]}']
                for k in keys:
                    manifest.setdefault(k, []).append(rel)
                entry_figs.append(fname)
            summary.append({'set': setnum, 'kind': s['kind'], 'q': q['num'],
                            'parts': [p['letter'] for p in q['parts']], 'figs': entry_figs})
    return manifest, summary


def main():
    os.chdir(ROOT)
    outdir = os.path.join(ROOT, 'assets', 'extracted_images')
    allmanifest, allsummary = {}, {}
    for chap, fn in CHAPTERS:
        doc = pymupdf.open(os.path.join(ROOT, 'raw_pdfs', fn))
        sets, markers = segment(doc, chap)
        man, summ = figure_regions(doc, sets, chap, outdir, markers)
        allmanifest.update(man)
        allsummary[chap] = summ
        print(f'Chapter {chap}: {len(sets)} sets, {len(summ)} questions, {sum(len(s["figs"]) for s in summ)} figures')
        for st in sets:
            print('   set', st['set'], st['kind'], 'questions', len(st['questions']),
                  'first', st['questions'][0]['num'], 'last', st['questions'][-1]['num'],
                  'parts', sum(len(q['parts']) for q in st['questions']))
    with open(os.path.join(ROOT, 'data', 'figure_manifest.json'), 'w') as f:
        json.dump(allmanifest, f, indent=1, sort_keys=True)
    with open(os.path.join(ROOT, 'data', 'segments.json'), 'w') as f:
        json.dump(allsummary, f, indent=1)


if __name__ == '__main__':
    main()
