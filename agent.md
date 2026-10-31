# Agent runbook: Grade 10 maths solutions app

This folder turns Jacaranda *Maths Quest 10 + 10A* chapter PDFs into an offline-first, browsable study app. Every exercise question gets a step-by-step worked solution written for Grade 10 learners. Read this whole file before starting a new chapter.

## 1. Folder layout

```text
Math/
├── agent.md                         # this runbook
├── index.html, styles.css, app.js   # viewer (home tiles, chapter view, exercise panel)
├── build_data.py                    # merges chunks -> data/solutions.json and data/solutions.js
├── tools/
│   ├── extract_figs.py              # segments exercise sets, crops figures, writes manifest
│   └── test_viewer.js               # headless smoke test of the viewer (needs jsdom)
├── raw_pdfs/                        # clean copies of the chapter PDFs: Chapter_NN_Title.pdf
├── data/
│   ├── chunks/                      # one JSON per exercise set: chNN_setM.json (source of truth)
│   ├── figure_manifest.json         # {entry id: [image paths]}, written by extract_figs.py
│   ├── segments.json                # per-set/question figure summary, for checking
│   ├── solutions.json               # merged output (built)
│   └── solutions.js                 # same data as window.SOLUTIONS, so index.html works from disk
└── assets/
    ├── extracted_images/            # question figures: ch{X}_ex{Y}_q{Z}_fig{N}.png
    └── generated_diagrams/          # SVGs for solution steps (rare; usually empty)
```

Files in the project root that are not listed here are the source PDFs the user dropped in. Leave them where they are. Work from the copies in `raw_pdfs/`.

## 2. Scope rules

- Grade 10 chapters are the default. Year 12 files (for example `Methods12_2ed_Ch14.pdf`) are out of scope unless the user asks for them. Ch14 was added on request, so it is in the app. Ask before adding any other non-Grade-10 file.
- Chapter 14 has a different layout (lettered exercises 14A–14N, then review and multiple-choice blocks, and no answer key). Its figures were not cropped, because `tools/extract_figs.py` only knows the Jacaranda layout. Its solutions were checked by substitution and by hand, not against the book.
- If two files are byte-identical copies of a chapter (for example `c06SurfaceAreaAndVolume (1).pdf`), use one and ignore the other.
- Included per exercise: the pre-test and the review set are included, with `category: null`. Quick quizzes are not exercises and are skipped.
- Chapter numbers come from the file name and the printed chapter headings. Check them against the first page.

## 3. Pipeline for a new chapter

### Step 1: Add the PDF
1. Copy the PDF to `raw_pdfs/Chapter_NN_Short_Title.pdf` (NN is the two-digit chapter number, no spaces in the title).
2. Add an entry to `CHAPTERS` in `tools/extract_figs.py`, for example `(5, 'Chapter_05_Trigonometry_I.pdf')`. Keep the list in chapter order.

### Step 2: Check the structure
Extract layout text to a scratch folder (not the project) and look at the markers:

```bash
pdftotext -layout raw_pdfs/Chapter_NN_....pdf /tmp/scratch/chNN.txt   # use the session scratch dir if you have one
grep -n -E "Individual pathways|^ *Exercise [0-9]+\.[0-9]+|Review questions|Pre-test|^ *Answers" chNN.txt
```

Expect: a pre-test set (`Exercise N.1 Pre-test`), sets with an `Individual pathways` line (which gives the Practice / Consolidate / Master numbers), a review set (`Review questions`), then an `Answers` section. If the structure differs, stop and work out the segmentation before going further.

### Step 3: Segment and crop figures
Requires Python with PyMuPDF. Create it once, outside the project:

```bash
python3 -m venv <scratch>/venv && <scratch>/venv/bin/pip install pymupdf
<scratch>/venv/bin/python -W ignore tools/extract_figs.py
```

This writes figure crops to `assets/extracted_images/`, the manifest to `data/figure_manifest.json`, and the summary to `data/segments.json`. It prints one line per set with the question count, so compare those counts with the pathway lists. Sequential numbering is used to end a set, so if a set has the wrong count, look at the numbering in the text before trusting it.

Figure quality: crops are best effort. The script drops page-sized crops and lesson banners, but icons, stray text and lesson fragments can still get through. Check a contact sheet of a sample before you rely on it.

### Step 4: Write the solutions (the main work)
Use one agent per roughly 80–120 questions, on Opus, split by line range of the layout text. A large chapter takes three agents (for example sets 1–4, 5–7, 8–review). Brief each agent with:
- the layout-text path, its line range, and the sets it owns,
- the PDF path, and the fact that it can render pages with `pdftoppm -r 110 -f N -l N -png` when a diagram or fraction is garbled,
- the exact output file names (below), the schema (below), and the teaching standard (below),
- the instruction to check answers against the chapter's Answers section and to report disagreements instead of silently changing them.

Output: `data/chunks/chNN_setM.json`, one file per exercise set.

### Step 5: Merge and validate
```bash
python3 build_data.py
```
This prints the entries per chapter and any schema problems. It attaches figure paths from the manifest. Fix any problem before going on. A figure key with no matching entry means the writer used a different id from the one the script produced (see the notes below).

### Step 6: Test the viewer
```bash
NODE_PATH=<dir containing jsdom> node tools/test_viewer.js
```
The test loads the real `index.html`, `data/solutions.js` and `app.js` with the CDN KaTeX stubbed out, and walks through home, chapter navigation, search, filters, reveal, saving and the saved list. It must print `ALL PASSED`. Look at a real browser before you call the layout done.

## 4. Data schema

Chapter wrapper (one per chapter, merged from the set files):

```json
{ "chapterId": "ch05", "chapterTitle": "Trigonometry I", "topics": [ TOPIC ] }
```

Topic: `{ "topicId": "5.2", "topicTitle": "Pythagoras' theorem", "exercises": [ ENTRY ] }`

Entry: one per question part. If a numbered question has no parts, one entry for the whole question.

```json
{
  "id": "ch5_ex2_q1a",
  "number": "1(a)",
  "category": "Practice",
  "questionText": "Full question with $LaTeX$. Repeat the shared stem in each part.",
  "questionFigures": [],
  "solution": {
    "formula": "Key formula or theorem, stated explicitly",
    "steps": ["Given and goal", "Substitution", "Working", "..."],
    "finalAnswer": "$x = 3.4$ cm (1 d.p.)",
    "solutionFigures": [],
    "tip": "One short common-pitfall sentence."
  }
}
```

Rules:
- **id:** `ch{N}_ex{M}_q{Z}{letter}` where N has no leading zero (`ch5`, `ch15`) and M is the set's minor number. `chapterId` keeps the zero (`ch05`). The figure manifest uses the same id, so the two must match exactly.
- **category:** `Practice`, `Consolidate`, `Master` from the `Individual pathways` line for that set. `null` for pre-tests and review sets.
- **questionFigures:** leave empty. The merge fills it from the manifest.
- **solutionFigures:** leave empty unless a step truly needs a diagram that the question doesn't supply. Then save an SVG to `assets/generated_diagrams/` and list the path.
- **Roman sub-parts** (i, ii, iii) are answered inside their lettered entry.

## 5. Teaching standard for solutions

- Written for Grade 10 learners. Show every algebraic and trigonometric step, including substitutions and simplifications.
- Order: Given and goal → key formula named explicitly → working → final statement in words → one tip on a common error.
- Round only at the end, and state the rounding (for example, "correct to 2 decimal places").
- LaTeX: `$...$` inline, `$$...$$` display. Double the backslashes inside JSON strings.
- Check every final answer twice. Use the book's Answers section to check, not to copy.

## 6. Known pitfalls (from chapters 6, 9, 11, 15)

- **Layout text garbles** fractions, exponents and diagram labels. When an answer doesn't follow from the text, render the page and read the figure.
- **Answers that disagree with the book** happen a few times per chapter (misprints, rounding during working, and occasionally the book itself is wrong). Keep the correct answer, and say in the entry's steps what the book says and why it differs. List every disagreement in the final report.
- **Diagram-only questions:** where the answer needs a figure that is missing from the text, the writer describes the figure in words and flags it.
- **Lesson pages** contain numbered items (`1.`, `2.`) that look like questions. The segmentation script ignores them by sequence and by lesson banners. Don't add them back.
- **Figure keys with no entry** happen when a writer merges sub-parts or uses different letters. Check `build_data.py`'s "figure keys with no matching entry" list. Fix the entry ids, not the manifest.

## 7. Viewer behaviour (for changes)

- Routes: `#/` home (chapter tiles and a Saved tile); `#/c/<chapterId>` chapter view; `#/c/<chapterId>/<entryId>` one exercise; `#/c/saved` saved questions across chapters.
- Chapter view: left sidebar with search, difficulty filter, "Saved only", and the exercise list grouped by topic. Right panel: one exercise, "Show solution", Prev/Next, position counter.
- Keyboard: ← / → move between questions, S toggles the solution, Esc closes the drawer on phones.
- `localStorage` holds only saved questions (`maths-favourites`) and the theme (`maths-theme`). Every access is wrapped in try/catch.
- Pages render with the KaTeX CDN, so math needs internet on first load.

## 8. Chapter log

| Chapter | Title | Status |
|---|---|---|
| 05 | Trigonometry I | Done (395 entries; figures cropped; merged and tested) |
| 06 | Surface area and volume | Done |
| 09 | Non-linear relationships | Done (two writers) |
| 11 | Probability | Done |
| 14 | Circular functions (Methods 12, added on request) | Done (424 entries; no figures cropped; not checked against a book key) |
| 15 | Trigonometry II (10A) | Done |

Known gaps: Ch14 has no figure crops, and the sketch questions there are answered in words. Ch11 has about 50 figure keys that match no entry (listed by `build_data.py`), so some figures are not attached.

Update this table whenever a chapter is merged and tested.
