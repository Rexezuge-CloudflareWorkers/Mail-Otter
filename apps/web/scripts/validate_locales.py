"""Validate all locale files: JSON-valid, key parity with en, placeholder parity, no empty values."""
import json, glob, re, sys

BASE = '/home/engineer/workspace/CloudflareWorkers/Mail-Otter/apps/web/src/locales'
PH = re.compile(r'\{\{[^}]+\}\}')

def flat(o, p=''):
    out = {}
    for k, v in o.items():
        kk = f'{p}.{k}' if p else k
        if isinstance(v, dict):
            out.update(flat(v, kk))
        else:
            out[kk] = v
    return out

en = flat(json.load(open(f'{BASE}/en/translation.json', encoding='utf-8')))
ok = True
for f in sorted(glob.glob(f'{BASE}/*/translation.json')):
    lang = f.split('/')[-2]
    if lang == 'en':
        continue
    d = flat(json.load(open(f, encoding='utf-8')))
    missing = sorted(set(en) - set(d))
    extra = sorted(set(d) - set(en))
    empty = sorted(k for k, v in d.items() if not isinstance(v, str) or v == '')
    ph_bad = sorted(k for k in d if k in en and set(PH.findall(d[k])) != set(PH.findall(en[k])))
    status = 'OK' if not (missing or extra or empty or ph_bad) else 'FAIL'
    if status == 'FAIL':
        ok = False
    print(f'{lang}: keys={len(d)} missing={len(missing)} extra={len(extra)} empty={len(empty)} ph_mismatch={len(ph_bad)} [{status}]')
    for k in missing[:5]:
        print(f'   missing: {k}')
    for k in extra[:5]:
        print(f'   extra: {k}')
    for k in empty[:5]:
        print(f'   empty: {k}')
    for k in ph_bad[:5]:
        print(f'   ph: {k} en={PH.findall(en[k])} vs {lang}={PH.findall(d[k])}')
print('ALL OK' if ok else 'FAILURES PRESENT')
sys.exit(0 if ok else 1)
