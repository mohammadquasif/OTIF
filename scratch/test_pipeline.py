"""End-to-end pipeline test: Upload → Scan → Approve → Export"""
import requests, json, io, sys, time

BASE = 'http://localhost:18765/api/v1'

# 1. Check health
r = requests.get(f'{BASE}/health', timeout=5)
print(f'Health: {r.status_code}')

# 2. Create test document
test_text = """# The Impact of Digital Transformation on SME Performance in India

## Abstract
This research investigates the impact of digital transformation on small and medium enterprise (SME) performance in India. Using a mixed-methods approach, we analyze survey data from 200 SMEs across manufacturing and service sectors. The findings reveal that digital transformation significantly improves operational efficiency and market reach, though barriers related to digital literacy and infrastructure persist.

## Introduction
Digital transformation has emerged as a critical factor for business competitiveness in the 21st century. Small and medium enterprises (SMEs) form the backbone of the Indian economy, contributing approximately 30% to the GDP and employing over 110 million people. However, the adoption of digital technologies among Indian SMEs remains uneven. This study examines the relationship between digital transformation initiatives and SME performance metrics, focusing on operational efficiency, revenue growth, and market expansion.

Furthermore, it is important to note that existing literature predominantly focuses on large enterprises in developed economies. There is a significant gap in understanding how SMEs in emerging economies navigate digital transformation. This research addresses this gap by providing empirical evidence from the Indian context.

## Literature Review
The concept of digital transformation encompasses the integration of digital technologies into all areas of business, fundamentally changing how organizations operate and deliver value. Vial (2019) provides a comprehensive framework for understanding digital transformation as a process where digital technologies create disruptions that trigger strategic responses from organizations.

Resource-based view (RBV) theory suggests that firms achieve competitive advantage through unique resources and capabilities. Digital capabilities, including IT infrastructure and digital skills, represent intangible assets that can differentiate firms in competitive markets. However, SMEs often lack the financial and human resources required for comprehensive digital initiatives.

In the Indian context, the Digital India initiative launched in 2015 has created a policy environment conducive to technology adoption. Nevertheless, challenges persist including inadequate digital infrastructure in semi-urban areas, limited access to affordable technology solutions, and a shortage of digitally skilled workers.

## Methodology
This study employs a mixed-methods research design combining quantitative survey data with qualitative case studies. The quantitative component includes a structured questionnaire administered to 200 SME owners and managers across Maharashtra, Tamil Nadu, and Gujarat. The survey instrument measures digital transformation maturity using a 5-point scale adapted from Westerman et al. (2014) and assesses firm performance through financial and operational metrics.

The qualitative component consists of semi-structured interviews with 20 purposively selected SME leaders to gain deeper insights into the barriers and enablers of digital transformation. Data analysis employs structural equation modeling (SEM) for quantitative data and thematic analysis following Braun and Clarke (2006) for qualitative data.

## Results
The survey achieved a response rate of 78% (n=156). Preliminary findings indicate a strong positive correlation between digital transformation maturity and operational efficiency. SMEs with higher digital maturity scores reported 23% higher revenue growth compared to those with lower scores. Mobile technology adoption emerged as the most impactful digital initiative, followed by cloud-based enterprise resource planning systems.

However, 45% of respondents identified inadequate digital skills as a primary barrier to transformation. Infrastructure limitations were cited by 38% of respondents, particularly those operating in tier-2 and tier-3 cities.

## Discussion
The findings corroborate the theoretical framework proposed by Vial (2019) while extending it to the SME context in emerging economies. The positive relationship between digital maturity and performance aligns with RBV theory, suggesting that digital capabilities serve as strategic resources even for resource-constrained firms.

The identification of digital skills gaps as a primary barrier has important policy implications. Government initiatives should complement technology infrastructure investments with digital literacy programs targeting SME workforces. Furthermore, the regional disparities in digital adoption highlight the need for localized approaches rather than one-size-fits-all interventions.

## Conclusion
This research demonstrates that digital transformation positively impacts SME performance in India, though benefits are contingent on overcoming digital literacy and infrastructure barriers. The study contributes to the literature by providing empirical evidence from an emerging economy context and offers practical implications for policymakers and SME leaders.

Future research should examine the long-term impacts of digital transformation and explore sector-specific dynamics. Longitudinal studies tracking SME digital maturity over time would provide valuable insights into the transformation journey.

## References
Braun, V., & Clarke, V. (2006). Using thematic analysis in psychology. Qualitative Research in Psychology, 3(2), 77-101.
Vial, G. (2019). Understanding digital transformation: A review and a research agenda. Journal of Strategic Information Systems, 28(2), 118-144.
Westerman, G., Bonnet, D., & McAfee, A. (2014). Leading digital: Turning technology into business transformation. Harvard Business Review Press.
"""

files = {'file': ('test_sme_digital.txt', io.BytesIO(test_text.encode()), 'text/plain')}
r = requests.post(f'{BASE}/documents/upload', files=files)
print(f'Upload: {r.status_code}')
resp = r.json()
doc_id = resp.get('doc_id')
if not doc_id:
    print('Upload failed:', r.text)
    sys.exit(1)
print(f'DocID: {doc_id[:36]}...')

# 3. Run SSE scan and capture events
print('\n--- SSE Scan Events ---')
r = requests.post(f'{BASE}/analysis/run/{doc_id}',
                  json={'doc_type': 'research_paper', 'norm': 'apa7'},
                  stream=True, timeout=120)
event_count = 0
scores = None
plan_count = 0
for line in r.iter_lines():
    if line:
        line_str = line.decode() if isinstance(line, bytes) else line
        if line_str.startswith('data: '):
            event_count += 1
            try:
                data = json.loads(line_str[6:])
                stage = data.get('stage', '?')
                msg = data.get('message', '')[:120]
                if 'scores' in data:
                    scores = data['scores']
                    print(f'  [{stage}] scores: plagiarism={scores.get("plagiarism_risk")}, orig={scores.get("originality_score")}, ai={scores.get("ai_writing_risk")}, cit={scores.get("citation_quality")}, overall={scores.get("overall_preflight")}')
                elif 'improvement_plan' in data:
                    plan_count = len(data['improvement_plan'])
                    print(f'  [{stage}] {msg} | plan items: {plan_count}')
                elif 'research_connectivity' in data:
                    rc = data['research_connectivity']
                    print(f'  [{stage}] internet: {rc.get("reachable_count", "?")}/{rc.get("checked_count", "?")} APIs reachable')
                else:
                    print(f'  [{stage}] {msg}')
            except Exception as e:
                print(f'  parse error: {e}')
print(f'\nTotal SSE events: {event_count}, Plan items: {plan_count}')

# 4. Get all plan item IDs
if plan_count == 0:
    print('No improvement plan items. Re-scoring...')
    r = requests.get(f'{BASE}/analysis/chapter-editor/{doc_id}?doc_type=research_paper&norm=apa7')
    scores = r.json().get('scores', {})
    print(f'Scores: {scores}')

print('\n--- Approve Rewrite ---')
r = requests.post(f'{BASE}/analysis/approve-rewrite', json={
    'doc_id': doc_id, 'approved_item_ids': [],
    'doc_type': 'research_paper', 'norm': 'apa7',
    'design_theme': 'mono_formal', 'output_formats': ['docx']
}, timeout=120)
print(f'Approve: {r.status_code}')
approve_data = r.json()
print(f'  Status: {approve_data.get("rewrite_status", "?")}')
preview = approve_data.get('rewrite_preview', '')
if preview:
    print(f'  Preview: {len(preview)} chars')
    print(f'  Start: {preview[:300]}...')
else:
    print(f'  Note: {approve_data.get("rewrite_note", "no note")[:200]}')

# 5. Export
print('\n--- Export ---')
r = requests.post(f'{BASE}/analysis/finalize-thesis', json={
    'doc_id': doc_id, 'chapters': [], 'doc_type': 'research_paper', 'norm': 'apa7',
    'design_theme': 'mono_formal', 'output_formats': ['docx']
}, timeout=60)
artifacts = r.json().get('artifacts', [])
for a in artifacts:
    print(f'  {a["format"]}: {a["filename"]} ({a["size_bytes"]} bytes)')

print('\nPIPELINE COMPLETE')
