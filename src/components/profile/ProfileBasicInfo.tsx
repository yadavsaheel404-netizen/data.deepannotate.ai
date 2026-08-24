import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface Props {
  displayName: string;
  setDisplayName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  languages: string[];
  toggleLanguage: (v: string) => void;
  indianLanguages: { value: string; label: string }[];
}

export default function ProfileBasicInfo({
  displayName, setDisplayName, phone, setPhone,
  languages, toggleLanguage, indianLanguages,
}: Props) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="displayName">Display Name</Label>
        <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
      </div>
      <div className="space-y-2">
        <Label>Preferred Languages</Label>
        <p className="text-xs text-muted-foreground">Select the languages you can work with</p>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 max-h-52 overflow-y-auto">
          {indianLanguages.map((l) => (
            <label key={l.value} className="flex items-center gap-2 cursor-pointer text-sm py-1">
              <Checkbox checked={languages.includes(l.value)} onCheckedChange={() => toggleLanguage(l.value)} />
              {l.label}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
