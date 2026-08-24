import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Append an "Other" option that reveals a free-text input */
  allowOther?: boolean;
  otherLabel?: string;
}

const OTHER_VALUE = '__other__';

export default function MultiSelectCombobox({
  options, value, onChange, placeholder = 'Select…',
  searchPlaceholder = 'Search…', emptyText = 'No results',
  allowOther = false, otherLabel = 'Other',
}: Props) {
  const [open, setOpen] = useState(false);
  const [otherInput, setOtherInput] = useState('');

  // Built-in option values for distinguishing custom entries
  const builtInValues = new Set(options.map((o) => o.value));
  const customValues = value.filter((v) => !builtInValues.has(v) && v !== OTHER_VALUE);
  const hasCustomActive = customValues.length > 0;

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  const remove = (v: string) => onChange(value.filter((x) => x !== v));

  const toggleOther = () => {
    if (hasCustomActive) {
      // Remove all custom entries
      onChange(value.filter((v) => builtInValues.has(v)));
    } else {
      setOtherInput('');
      // Open the input by setting a sentinel that we'll show via local state
      // No store change yet — user must type & confirm
    }
  };

  const addCustom = () => {
    const t = otherInput.trim();
    if (!t) return;
    if (value.includes(t)) { setOtherInput(''); return; }
    onChange([...value, t]);
    setOtherInput('');
  };

  const labelFor = (v: string) =>
    options.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button" variant="outline" role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal hover:bg-background hover:text-foreground"
          >
            <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
              {value.length === 0 ? placeholder : `${value.length} selected`}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0 z-[60]"
          align="start"
          sideOffset={4}
          collisionPadding={8}
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList className="max-h-[280px] overflow-y-auto overscroll-contain">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const selected = value.includes(opt.value);
                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      onSelect={() => toggle(opt.value)}
                      className={cn(
                        'cursor-pointer flex items-center gap-2',
                        selected && 'bg-primary/5',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-sm border',
                          selected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-input',
                        )}
                        aria-hidden
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1">{opt.label}</span>
                    </CommandItem>
                  );
                })}
                {allowOther && (
                  <CommandItem
                    value={otherLabel}
                    onSelect={toggleOther}
                    className={cn(
                      'cursor-pointer flex items-center gap-2',
                      hasCustomActive && 'bg-primary/5',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-sm border',
                        hasCustomActive
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-input',
                      )}
                      aria-hidden
                    >
                      {hasCustomActive && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1">{otherLabel}</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {allowOther && (
        <div className="flex gap-2">
          <Input
            value={otherInput}
            onChange={(e) => setOtherInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Enter your language and press Add"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={addCustom} disabled={!otherInput.trim()}>
            Add
          </Button>
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium"
            >
              {labelFor(v)}
              <button
                type="button"
                onClick={() => remove(v)}
                className="hover:text-primary/70"
                aria-label={`Remove ${labelFor(v)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
