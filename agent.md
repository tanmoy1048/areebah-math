---

### Recommended Folder Layout for Your Agent

```text
math-solutions-hub/
├── agent.md                      # Instructions and specifications for future runs
├── index.html                    # Single-page application viewer
├── styles.css                    # Responsive styling (Dark/Light themes, badges)
├── app.js                        # Viewer logic, favorites (localStorage), KaTeX init
├── data/
│   └── solutions.json            # Master extracted exercises and solutions
├── raw_pdfs/                     # Source PDF chapters
│   ├── Chapter_01_Algebra.pdf
│   └── Chapter_02_Geometry.pdf
└── assets/
    ├── extracted_images/         # Images pulled directly from question prompts
    └── generated_diagrams/       # Generated SVGs for solution steps