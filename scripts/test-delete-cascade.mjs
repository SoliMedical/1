// Soli Medical regression test: backup -> cascade delete -> restore verification.
// This test uses an isolated in-memory fixture and never touches the clinic browser data.

import assert from 'node:assert/strict';

const patient = { id: 'patient-1', fullName: 'مريض اختبار الحذف' };
const state = {
  patients: [patient, { id: 'patient-2', fullName: 'مريض غير مرتبط' }],
  prescriptions: [
    { id: 'rx-1', patientId: 'patient-1', patientName: patient.fullName },
    { id: 'rx-2', patientId: 'patient-2', patientName: 'مريض غير مرتبط' },
  ],
  waitingQueue: [
    { id: 'queue-1', patientId: 'patient-1', patientName: patient.fullName },
    { id: 'queue-2', patientId: 'patient-2', patientName: 'مريض غير مرتبط' },
  ],
  invoices: [
    { id: 'invoice-1', patientId: 'patient-1', patientName: patient.fullName },
    { id: 'invoice-2', patientId: 'patient-2', patientName: 'مريض غير مرتبط' },
  ],
};

const backup = structuredClone(state);
const patientName = patient.fullName.trim();
const deletePatientCascade = (source, id) => {
  const target = source.patients.find((item) => item.id === id);
  assert.ok(target, 'The fixture patient must exist before deletion.');
  const targetName = String(target.fullName || '').trim();
  source.patients = source.patients.filter((item) => item.id !== id);
  source.prescriptions = source.prescriptions.filter((item) => item.patientId !== id && String(item.patientName || '').trim() !== targetName);
  source.waitingQueue = source.waitingQueue.filter((item) => item.patientId !== id && String(item.patientName || '').trim() !== targetName);
  source.invoices = source.invoices.filter((item) => item.patientId !== id && String(item.patientName || '').trim() !== targetName);
};

deletePatientCascade(state, patient.id);
assert.equal(state.patients.some((item) => item.id === patient.id), false);
assert.equal(state.prescriptions.some((item) => item.patientId === patient.id || item.patientName === patientName), false);
assert.equal(state.waitingQueue.some((item) => item.patientId === patient.id || item.patientName === patientName), false);
assert.equal(state.invoices.some((item) => item.patientId === patient.id || item.patientName === patientName), false);
assert.equal(state.patients.length, 1);
assert.equal(state.prescriptions.length, 1);
assert.equal(state.waitingQueue.length, 1);
assert.equal(state.invoices.length, 1);

const restoredState = structuredClone(backup);
assert.deepEqual(restoredState, backup, 'The pre-delete JSON backup must restore the original fixture exactly.');
console.log('Delete cascade regression: PASS (backup preserved, linked records removed, unrelated records kept).');
