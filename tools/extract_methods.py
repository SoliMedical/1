from pathlib import Path
import re

text = Path('/home/ubuntu/medicenter-pwa/client/index.html').read_text()
for name in ['init(', 'isDeviceTrustValid(', 'restoreSession(', 'saveState(', 'addVisitType(', 'removeVisitType(', 'savePatient(', 'openPatientFormPage(', 'navigateTo(', 'openAppointmentsPage(']:
    print('\n---', name, '---')
    pos = text.find(name)
    if pos < 0:
        print('NOT FOUND')
        continue
    start = text.rfind('\n', 0, pos)
    depth = 0
    end = min(len(text), pos + 9000)
    for i in range(pos, end):
        if text[i] == '{': depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth <= 0 and i > pos + 20:
                end = i + 1
                break
    print(text[start:end])

print('\n--- key templates ---')
for needle in ['x-show="currentView === \'patientForm\'"', 'x-show="currentView === \'followUps\'"', 'x-model.number="visitTypePrices[typeName]"']:
    pos = text.find(needle)
    print('\nNEEDLE', needle, 'at', pos)
    print(text[max(0,pos-500):pos+1800])
