import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getCountries, getCountryCallingCode, parsePhoneNumberFromString,
  AsYouType, type CountryCode as LibCountryCode,
} from 'libphonenumber-js';

// Country display names via Intl
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

// Convert ISO country code → flag emoji
const isoToFlag = (iso: string) =>
  iso
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

interface CountryEntry {
  iso: LibCountryCode;
  name: string;
  code: string; // calling code w/o '+'
  flag: string;
}

const COUNTRIES: CountryEntry[] = getCountries()
  .map((iso) => ({
    iso,
    name: regionNames.of(iso) || iso,
    code: getCountryCallingCode(iso),
    flag: isoToFlag(iso),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Countries with strict 10-digit national numbers (UX: hard cap)
const TEN_DIGIT_ISOS: Partial<Record<LibCountryCode, true>> = {
  IN: true, PH: true, US: true, CA: true,
};

const PRIORITY_ISOS: LibCountryCode[] = ['IN', 'PH', 'US', 'GB', 'AE', 'CA', 'AU', 'SG'];

interface Props {
  /** Full E.164 phone, e.g. "+919876543210" */
  value: string;
  onChange: (fullPhone: string) => void;
  id?: string;
}

function detectCountry(full: string): { iso: LibCountryCode; local: string } {
  const v = (full || '').replace(/\s+/g, '');
  if (v.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(v);
    if (parsed?.country) {
      return { iso: parsed.country, local: parsed.nationalNumber.toString() };
    }
    // Fallback: longest matching calling code
    const sorted = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
    for (const c of sorted) {
      if (v.startsWith(`+${c.code}`)) {
        return { iso: c.iso, local: v.slice(c.code.length + 1).replace(/\D/g, '') };
      }
    }
  }
  return { iso: 'IN', local: v.replace(/\D/g, '') };
}

export default function PhoneInput({ value, onChange, id }: Props) {
  const [open, setOpen] = useState(false);
  const { iso, local } = useMemo(() => detectCountry(value), [value]);
  const country = COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES[0];

  // Sort: priority first, then alpha
  const sortedCountries = useMemo(() => {
    const priority = PRIORITY_ISOS
      .map((p) => COUNTRIES.find((c) => c.iso === p))
      .filter(Boolean) as CountryEntry[];
    const rest = COUNTRIES.filter((c) => !PRIORITY_ISOS.includes(c.iso));
    return [...priority, ...rest];
  }, []);

  const setIso = (newIso: LibCountryCode) => {
    const c = COUNTRIES.find((x) => x.iso === newIso) ?? COUNTRIES[0];
    onChange(local ? `+${c.code}${local}` : '');
    setOpen(false);
  };

  const setLocal = (raw: string) => {
    let digits = raw.replace(/\D/g, '');
    if (TEN_DIGIT_ISOS[country.iso]) digits = digits.slice(0, 10);
    else digits = digits.slice(0, 15);
    onChange(digits ? `+${country.code}${digits}` : '');
  };

  // Validation
  const fullE164 = local ? `+${country.code}${local}` : '';
  const parsed = fullE164 ? parsePhoneNumberFromString(fullE164) : null;
  let isValid = true;
  if (local) {
    if (TEN_DIGIT_ISOS[country.iso]) {
      isValid = local.length === 10 && !!parsed?.isValid();
    } else {
      isValid = !!parsed?.isValid();
    }
  }
  const showError = local.length > 0 && !isValid;

  // Pretty national format
  const formatted = useMemo(() => {
    if (!local) return '';
    try {
      return new AsYouType(country.iso).input(local);
    } catch {
      return local;
    }
  }, [local, country.iso]);

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button" variant="outline" role="combobox"
              aria-expanded={open}
              className="w-[125px] shrink-0 justify-between font-normal px-2.5"
            >
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span aria-hidden>{country.flag}</span>
                <span className="text-sm">+{country.code}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search country…" />
              <CommandList>
                <CommandEmpty>No country found</CommandEmpty>
                <CommandGroup>
                  {sortedCountries.map((c) => (
                    <CommandItem
                      key={c.iso}
                      value={`${c.name} +${c.code} ${c.iso}`}
                      onSelect={() => setIso(c.iso)}
                      className="cursor-pointer"
                    >
                      <Check className={cn('mr-2 h-4 w-4', country.iso === c.iso ? 'opacity-100' : 'opacity-0')} />
                      <span className="mr-2">{c.flag}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">+{c.code}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          value={formatted}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={TEN_DIGIT_ISOS[country.iso] ? '98765 43210' : 'Phone number'}
          aria-invalid={showError}
          className={cn('flex-1', showError && 'border-destructive focus-visible:ring-destructive')}
        />
      </div>
      {showError && (
        <p className="text-xs text-destructive">Invalid phone number for selected country</p>
      )}
    </div>
  );
}
