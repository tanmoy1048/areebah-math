#!/usr/bin/env python3
"""Merge per-set solution chunks into data/solutions.json (and data/solutions.js for file:// use).

Inputs:
  data/chunks/ch{NN}_set{M}.json   one file per exercise set (written by the extraction step)
  data/figure_manifest.json        {entry id: [image paths]} from the figure crop step
  data/tricks/ch{NN}_set{M}.json   optional {entry id: [short tricks]} written per set; merged as entry["tricks"]
Outputs:
  data/solutions.json
  data/solutions.js                window.SOLUTIONS = [...] so index.html works from disk
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
CATEGORIES = {'Practice', 'Consolidate', 'Master', None}
REQUIRED_SOLUTION = ('formula', 'steps', 'finalAnswer', 'solutionFigures', 'tip')


def set_order(path):
    m = re.search(r'_set(\d+)\.json$', path)
    return int(m.group(1)) if m else 999


def main():
    manifest_path = os.path.join(ROOT, 'data', 'figure_manifest.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}

    chunks = sorted(glob.glob(os.path.join(ROOT, 'data', 'chunks', 'ch*_set*.json')),
                    key=lambda p: (os.path.basename(p)[:4], set_order(p)))
    tricks = {}
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'tricks', '*.json'))):
        try:
            for entry_id, items in json.load(open(path)).items():
                tricks[entry_id] = items
        except json.JSONDecodeError as e:
            print(f'PROBLEM: {os.path.basename(path)} is not valid JSON ({e})')
            return 1

    chapters = {}
    problems = []
    seen_ids = set()

    for path in chunks:
        try:
            doc = json.load(open(path))
        except json.JSONDecodeError as e:
            problems.append(f'{os.path.basename(path)}: invalid JSON ({e})')
            continue
        ch = chapters.setdefault(doc['chapterId'], {
            'chapterId': doc['chapterId'], 'chapterTitle': doc['chapterTitle'], 'topics': []})
        for topic in doc['topics']:
            target = next((t for t in ch['topics'] if t['topicId'] == topic['topicId']), None)
            if target is None:
                target = {'topicId': topic['topicId'], 'topicTitle': topic['topicTitle'], 'exercises': []}
                ch['topics'].append(target)
            for ex in topic['exercises']:
                where = f"{os.path.basename(path)} {ex.get('id')}"
                if ex['id'] in seen_ids:
                    problems.append(f'duplicate id {ex["id"]} ({where})')
                seen_ids.add(ex['id'])
                if ex.get('category') not in CATEGORIES:
                    problems.append(f'bad category {ex.get("category")!r} ({where})')
                sol = ex.get('solution', {})
                for key in REQUIRED_SOLUTION:
                    if key not in sol:
                        problems.append(f'missing solution.{key} ({where})')
                if not sol.get('steps'):
                    problems.append(f'empty steps ({where})')
                ex['questionFigures'] = manifest.get(ex['id'], [])
                items = tricks.get(ex['id'], [])
                if not isinstance(items, list) or not all(isinstance(t, str) and t.strip() for t in items):
                    problems.append(f'tricks must be a list of non-empty strings ({where})')
                ex['tricks'] = items if isinstance(items, list) else []
                target['exercises'].append(ex)

    unmatched = sorted(set(manifest) - seen_ids)
    unmatched_tricks = sorted(set(tricks) - seen_ids)
    chapter_list = [chapters[k] for k in sorted(chapters)]

    out_json = os.path.join(ROOT, 'data', 'solutions.json')
    with open(out_json, 'w') as f:
        json.dump(chapter_list, f, ensure_ascii=False, indent=2)
    with open(os.path.join(ROOT, 'data', 'solutions.js'), 'w') as f:
        f.write('window.SOLUTIONS = ')
        json.dump(chapter_list, f, ensure_ascii=False)
        f.write(';\n')

    total = len(seen_ids)
    with_fig = sum(1 for c in chapter_list for t in c['topics'] for e in t['exercises'] if e['questionFigures'])
    print(f'chunks: {len(chunks)}   chapters: {len(chapter_list)}   entries: {total}   with figures: {with_fig}')
    for c in chapter_list:
        n = sum(len(t['exercises']) for t in c['topics'])
        print(f'  {c["chapterId"]} {c["chapterTitle"]}: {len(c["topics"])} topics, {n} entries')
    print(f'entries with tricks: {sum(1 for c in chapter_list for t in c["topics"] for e in t["exercises"] if e["tricks"])}')
    if unmatched:
        print(f'figure keys with no matching entry ({len(unmatched)}): {unmatched[:15]}')
    if unmatched_tricks:
        print(f'trick keys with no matching entry ({len(unmatched_tricks)}): {unmatched_tricks[:15]}')
    if problems:
        print(f'PROBLEMS ({len(problems)}):')
        for p in problems[:50]:
            print('  -', p)
        return 1
    print('no schema problems')
    return 0


if __name__ == '__main__':
    sys.exit(main())
