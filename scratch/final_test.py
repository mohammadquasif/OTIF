"""Final comprehensive pipeline test with all improvements."""
import requests, json, io, time, sys, io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = 'http://127.0.0.1:18765/api/v1'
PASS, FAIL = 0, 0

def check(step, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  [PASS] {step}")
    else:
        FAIL += 1
        print(f"  [FAIL] {step} — {detail}")

# ── Test document ──
test_text = """# The Impact of Digital Transformation on SME Performance in India

## Abstract
This research investigates the impact of digital transformation on small and medium enterprise (SME) performance in India. Using a mixed-methods approach, we analyze survey data from 200 SMEs across manufacturing and service sectors.

## Introduction
Digital transformation has emerged as a critical factor for business competitiveness in the 21st century. Small and medium enterprises (SMEs) form the backbone of the Indian economy, contributing approximately 30% to the GDP and employing over 110 million people.

Furthermore, it is important to note that existing literature predominantly focuses on large enterprises in developed economies. There is a significant gap in understanding how SMEs in emerging economies navigate digital transformation.

## Literature Review
Vial (2019) provides a comprehensive framework for understanding digital transformation as a process where digital technologies create disruptions that trigger strategic responses from organizations. Resource-based view (RBV) theory suggests that firms achieve competitive advantage through unique resources and capabilities.

In the Indian context, the Digital India initiative launched in 2015 has created a policy environment conducive to technology adoption.

## Methodology
This study employs a mixed-methods research design combining quantitative survey data with qualitative case studies. The quantitative component includes a structured questionnaire administered to 200 SME owners and managers across Maharashtra, Tamil Nadu, and Gujarat.

The qualitative component consists of semi-structured interviews with 20 purposively selected SME leaders. Data analysis employs structural equation modeling (SEM) for quantitative data and thematic analysis following Braun and Clarke (2006) for qualitative data.

## Results
The survey achieved a response rate of 78% (n=156). SMEs with higher digital maturity scores reported 23% higher revenue growth compared to those with lower scores. Mobile technology adoption emerged as the most impactful digital initiative.

However, 45% of respondents identified inadequate digital skills as a primary barrier to transformation.

## Discussion
The findings corroborate the theoretical framework proposed by Vial (2019) while extending it to the SME context in emerging economies. The positive relationship between digital maturity and performance aligns with RBV theory.

## Conclusion
This research demonstrates that digital transformation positively impacts SME performance in India, though benefits are contingent on overcoming digital literacy and infrastructure barriers.

Future research should examine the long-term impacts of digital transformation and explore sector-specific dynamics.

## References
Braun, V., & Clarke, V. (2006). Using thematic analysis in psychology. Qualitative Research in Psychology, 3(2), 77-101.
Vial, G. (2019). Understanding digital transformation: A review and a research agenda. Journal of Strategic Information Systems, 28(2), 118-144.
Westerman, G., Bonnet, D., & McAfee, A. (2014). Leading digital: Turning technology into business transformation. Harvard Business Review Press.
"""

print("=" * 60)
print("OTIF Pipeline Test — Upload → Scan (Detailed) → Approve → Export")
print("=" * 60)

# ── 1. UPLOAD ──
print("\n1. UPLOAD")
files = {'file': ('sme_research.txt', _io.BytesIO(test_text.encode()), 'text/plain')}
r = requests.post(f'{BASE}/documents/upload', files=files)
check("Upload returns 200", r.status_code == 200, str(r.status_code))
doc_id = r.json().get('doc_id')
check("Has doc_id", bool(doc_id))
print(f"   DocID: {doc_id[:40]}..." if doc_id else "   No doc_id")

if not doc_id:
    print("ABORT: Cannot continue without doc_id")
    sys.exit(1)

# ── 2. SCAN (detailed pace) ──
print("\n2. SCAN (detailed pace)")
scan_start = time.time()
event_count = 0
api_checking = 0
api_results = 0
stages_seen = set()
final_scores = None
plan_items = 0
has_document_loaded = False

r = requests.post(f'{BASE}/analysis/run/{doc_id}',
                  json={'doc_type': 'research_paper', 'norm': 'apa7', 'pace': 'detailed'},
                  stream=True, timeout=300)
for line in r.iter_lines():
    if line:
        line_str = line.decode() if isinstance(line, bytes) else line
        if line_str.startswith('data: '):
            data = json.loads(line_str[6:])
            event_count += 1
            stage = data.get('stage', '?')
            stages_seen.add(stage)
            if stage == 'research_source_checking': api_checking += 1
            if stage == 'research_source_result': api_results += 1
            if stage == 'document_loaded': has_document_loaded = True
            if stage == 'scores_ready':
                final_scores = data.get('scores', {})
                plan_items = len(data.get('improvement_plan', []))
            if stage == 'error':
                print(f"   ERROR: {data.get('message', '')[:150]}")

scan_elapsed = time.time() - scan_start

check("SSE events > 30 (was 25)", event_count > 30, f"got {event_count}")
check("Per-API checking events", api_checking >= 10, f"got {api_checking}")
check("Per-API result events", api_results >= 10, f"got {api_results}")
check("Document loaded event", has_document_loaded)
check("Scores present", final_scores is not None)
check("Improvement plan > 3", plan_items > 3, f"got {plan_items}")
check("Scan completed (not error)", 'error' not in stages_seen)
check("Detailed pace takes > 30s", scan_elapsed > 30, f"took {scan_elapsed:.1f}s")

if final_scores:
    sc = final_scores
    print(f"   Scores: plagiarism={sc.get('plagiarism_risk')}, orig={sc.get('originality_score')}, "
          f"ai={sc.get('ai_writing_risk')}, cit={sc.get('citation_quality')}, overall={sc.get('overall_preflight')}")
print(f"   Events: {event_count} total, {len(stages_seen)} unique stages")
print(f"   Elapsed: {scan_elapsed:.1f}s")

# ── 3. APPROVE ──
print("\n3. APPROVE REWRITE")
r = requests.post(f'{BASE}/analysis/approve-rewrite', json={
    'doc_id': doc_id,
    'approved_item_ids': ['plagiarism-risk-reduction', 'originality-claim-strength',
                           'citation-strength', 'imrad-structure'],
    'doc_type': 'research_paper', 'norm': 'apa7',
    'design_theme': 'mono_formal', 'output_formats': ['docx']
}, timeout=180)
approval = r.json()
check("Approve returns 200", r.status_code == 200, f"got {r.status_code}")
rewrite_status = approval.get('rewrite_status', '')
check("Rewrite status valid", rewrite_status in ('rewrite_preview_ready', 'approval_recorded_ai_unavailable',
      'approval_recorded_selected_text_required'), f"got {rewrite_status}")
preview = approval.get('rewrite_preview', '')
has_diff = bool(approval.get('diff'))
check("Has preview text or diff", bool(preview) or has_diff)
if preview:
    print(f"   Preview: {len(preview)} chars")
    print(f"   Start: {preview[:150]}...")
    check("Preview not a refusal", not preview.startswith("I'm sorry"), "model refused")
if has_diff:
    diff = approval['diff']
    print(f"   Diff: {diff.get('deletion_count', 0)} deletions, {diff.get('insertion_count', 0)} insertions")

# ── 4. EXPORT ──
print("\n4. EXPORT")
chapter_res = requests.get(
    f'{BASE}/analysis/chapter-editor/{doc_id}',
    params={'doc_type': 'research_paper', 'norm': 'apa7'},
    timeout=60,
)
check("Chapter editor returns 200", chapter_res.status_code == 200, f"got {chapter_res.status_code}")
chapter_payload = [
    {
        'id': ch.get('id'),
        'title': ch.get('title'),
        'original_text': ch.get('original_text', ''),
        'edited_text': ch.get('edited_text') or ch.get('original_text', ''),
    }
    for ch in chapter_res.json().get('chapters', [])
]
check("Has export chapters", len(chapter_payload) > 0, f"got {len(chapter_payload)}")
r = requests.post(f'{BASE}/analysis/finalize-thesis', json={
    'doc_id': doc_id, 'chapters': chapter_payload, 'doc_type': 'research_paper', 'norm': 'apa7',
    'design_theme': 'mono_formal', 'output_formats': ['docx']
}, timeout=60)
artifacts = r.json().get('artifacts', [])
check("Has artifacts", len(artifacts) > 0, f"got {len(artifacts)}")
for a in artifacts:
    check(f"Artifact {a['format']} > 1KB", a['size_bytes'] > 1024, f"{a['size_bytes']} bytes")
    print(f"   {a['format']}: {a['filename']} ({a['size_bytes']} bytes)")

# ── SUMMARY ──
print(f"\n{'='*60}")
print(f"RESULTS: {PASS} passed, {FAIL} failed, {PASS+FAIL} total")
print(f"{'='*60}")
if FAIL == 0:
    print("ALL TESTS PASSED")
else:
    print(f"{FAIL} TEST(S) FAILED")
