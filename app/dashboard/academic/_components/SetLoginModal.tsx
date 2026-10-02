'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Button, Field, inputClass } from '../../../components/ui';
import type { Student } from '../../../../utils/types';

// Creates or resets a student's portal password.
export default function SetLoginModal({ student, onClose, onDone }: { student: Student; onClose: () => void; onDone: (message: string) => void }) {
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return;
    setIsSaving(true);
    const response = await fetch('/api/students/set-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id, password }),
    });
    const result = await response.json().catch(() => ({}));
    setIsSaving(false);
    onDone(response.ok ? result.message : `Error: ${result.error ?? 'Could not set the login.'}`);
  };

  return (
    <Modal title="Set student login" description={`${student.name} signs in with RU ID ${student.ru_id || '(not set)'}`} size="sm" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <Field label="New portal password" hint="At least 6 characters. Share it with the student privately.">
          <input type="text" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} autoComplete="off" />
        </Field>
        <Button type="submit" icon={KeyRound} loading={isSaving} disabled={password.length < 6 || !student.ru_id} className="w-full">Set password</Button>
        {!student.ru_id && <p className="text-xs text-rose-600">Add an RU ID to this student first — students sign in with it.</p>}
      </form>
    </Modal>
  );
}
