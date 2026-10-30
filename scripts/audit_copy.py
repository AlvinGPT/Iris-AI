import os
import re

terms = [
    r'Ophthalmic\s+Habit\s+Lab',
    r'Multimodal\s+Ophthalmic',
    r'Vision\s+Guard',
    r'Daylight\s+cycle',
    r'Circadian\s+equilibrium',
    r'\bcircadian\b',
    r'ANSI\s*/?\s*HFES\s*(?:100)?\s*(?:Standard)?',
    r'\bANSI\b',
    r'\bHFES\b',
    r'Ciliary\s+Tension',
    r'\bciliary\b',
    r'Safe\s+Vergence\s+Angle',
    r'\bvergence\b',
    r'Viewing\s+Horizon\s+Depth',
    r'\bhorizon\b',
    r'Blink\s+Cadence\s+Frequency',
    r'Target\s+14-18\s+BPM',
    r'Calibrated\s+Baseline',
    r'Full\s*/\s*Partial',
    r'Session\s+average\s*/\s*60s\s*rolling',
    r'Visualizing\s+user\s+adherence',
    r'Completing\s+5\s+regular',
    r'\badherence\b',
    r'\baccommodation\b',
    r'\bendurance\b',
    r'\bophthalm\w*',
    r'\bergonomic\b',
    r'\bphysiological\b',
    r'\blab\b',
    r'\bprotocol\b',
]

pattern = re.compile('|'.join(terms), re.IGNORECASE)

results = []
for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            fpath = os.path.join(root, file)
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                for line_no, line in enumerate(f, 1):
                    m = pattern.search(line)
                    if m:
                        results.append((fpath, line_no, m.group(0), line.strip()))

# Also check index.html
if os.path.exists('index.html'):
    with open('index.html', 'r', encoding='utf-8') as f:
        for line_no, line in enumerate(f, 1):
            m = pattern.search(line)
            if m:
                results.append(('index.html', line_no, m.group(0), line.strip()))

print(f"Total matching lines: {len(results)}")
for fpath, lno, match_word, line in results:
    print(f"{fpath}:{lno} [{match_word}] --> {line}")
