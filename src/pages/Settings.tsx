import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { LogOut } from 'lucide-react';

export function SettingsPage() {
  const { profile, signOut, updateProfile } = useAuthStore();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [employeeId, setEmployeeId] = useState(profile?.employee_id || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ full_name: fullName, employee_id: employeeId });
      showToast('Profil mis à jour', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  };

  return (
    <div className="px-4 py-6">
      <h1 className="mb-6 text-xl font-bold text-gray-900">Paramètres</h1>

      <div className="space-y-4 rounded-xl bg-white p-4 shadow-sm">
        <Input
          label="Nom complet"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Prénom Nom"
        />
        <Input
          label="Matricule"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          placeholder="Numéro de matricule"
        />
        <Button onClick={handleSave} loading={saving} className="w-full">
          Sauvegarder
        </Button>
      </div>

      <div className="mt-6">
        <Button onClick={handleSignOut} variant="danger" className="w-full gap-2">
          <LogOut size={18} />
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}
