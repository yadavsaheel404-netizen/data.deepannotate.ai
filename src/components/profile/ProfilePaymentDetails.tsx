import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { isValidUpi, sanitizeUpiInput } from '@/lib/upiValidation';

interface Props {
  upiId: string;
  setUpiId: (v: string) => void;
  accountHolderName: string;
  setAccountHolderName: (v: string) => void;
  bankAccountNumber: string;
  setBankAccountNumber: (v: string) => void;
  ifscCode: string;
  setIfscCode: (v: string) => void;
}

export default function ProfilePaymentDetails({
  upiId, setUpiId, accountHolderName, setAccountHolderName,
  bankAccountNumber, setBankAccountNumber, ifscCode, setIfscCode,
}: Props) {
  const upiTouched = upiId.length > 0;
  const upiValid = isValidUpi(upiId);
  const showInvalid = upiTouched && !upiValid;
  const showValid = upiTouched && upiValid;

  return (
    <>
      <Label className="text-base font-semibold">Payment Details</Label>
      <div className="space-y-2">
        <Label htmlFor="upiId">UPI ID</Label>
        <Input
          id="upiId"
          value={upiId}
          onChange={(e) => setUpiId(sanitizeUpiInput(e.target.value))}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text');
            setUpiId(sanitizeUpiInput(text));
          }}
          placeholder="e.g. vivek@ybl"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={showInvalid}
          className={cn(
            showInvalid && 'border-destructive focus-visible:ring-destructive',
            showValid && 'border-success focus-visible:ring-success',
          )}
        />
        {showInvalid ? (
          <p className="text-xs text-destructive">Enter a valid UPI ID (e.g. name@bank)</p>
        ) : (
          <p className="text-xs text-muted-foreground">Enter your UPI ID in format: name@bank</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="accountHolder">Account Holder Name *</Label>
        <Input
          id="accountHolder"
          value={accountHolderName}
          onChange={(e) => setAccountHolderName(e.target.value)}
          placeholder="Full name as on bank account"
          aria-invalid={accountHolderName.length > 0 && accountHolderName.trim().length < 2}
          className={cn(
            accountHolderName.length > 0 && accountHolderName.trim().length < 2 && 'border-destructive focus-visible:ring-destructive',
            accountHolderName.trim().length >= 2 && 'border-success focus-visible:ring-success',
          )}
        />
        {accountHolderName.length === 0 ? (
          <p className="text-xs text-muted-foreground">Required. Enter the name as per your bank account.</p>
        ) : accountHolderName.trim().length < 2 ? (
          <p className="text-xs text-destructive">Account Holder Name is required</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="bankAccount">Bank Account Number</Label>
        <Input id="bankAccount" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="Account number" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ifsc">IFSC Code</Label>
        <Input id="ifsc" value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} placeholder="IFSC code" />
      </div>
    </>
  );
}
