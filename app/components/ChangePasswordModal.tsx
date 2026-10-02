'use client';

import { useState } from 'react';
import Modal from './Modal';
import { changePassword } from '../../utils/session';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (newPassword.length < 6) return alert('Password must be at least 6 characters long.');

    setIsSaving(true);
    const { error } = await changePassword(newPassword);
    setIsSaving(false);

    if (error) return alert(`Error updating password: ${error.message}`);
    alert('Password updated successfully!');
    onClose();
  };

  return (
    <Modal title="Change Password" size="sm" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">Update the password for your account. This takes effect immediately.</p>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-slate-800"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Updating...' : 'Confirm Password Change'}
        </button>
      </div>
    </Modal>
  );
}
