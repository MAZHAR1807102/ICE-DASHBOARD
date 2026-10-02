'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import Modal from './Modal';
import { Button, Field, inputClass } from './ui';
import { useToast } from './Providers';
import { changePassword } from '../../utils/session';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < 6;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6 || newPassword !== confirmPassword) return;
    setIsSaving(true);
    const { error } = await changePassword(newPassword);
    setIsSaving(false);
    if (error) return toast.error(`Password not changed: ${error.message}`);
    toast.success('Password updated.');
    onClose();
  };

  return (
    <Modal title="Change password" description="Takes effect immediately on all your devices." size="sm" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <Field label="New password" hint={tooShort ? 'Use at least 6 characters.' : undefined}>
          <input type="password" autoFocus value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" hint={mismatch ? "The passwords don't match." : undefined}>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} autoComplete="new-password" />
        </Field>
        <Button type="submit" icon={KeyRound} loading={isSaving} disabled={newPassword.length < 6 || newPassword !== confirmPassword} className="w-full">
          Update password
        </Button>
      </form>
    </Modal>
  );
}
