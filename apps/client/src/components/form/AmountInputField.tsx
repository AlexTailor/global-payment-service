import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { AmountInput } from '@/components/ui/amount-input';
import { Typography } from '@/components/ui/typography';
import type { Currency } from '@/types/api';

interface AmountInputFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  currency: Currency;
  size?: 'default' | 'lg';
  hint?: string;
  className?: string;
}

export function AmountInputField<TFieldValues extends FieldValues>({
  control,
  name,
  currency,
  size,
  hint,
  className,
}: AmountInputFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="flex flex-col gap-1.5">
          <AmountInput
            {...field}
            currency={currency}
            size={size}
            invalid={!!fieldState.error}
            className={className}
          />
          {fieldState.error ? (
            <Typography variant="error">{fieldState.error.message}</Typography>
          ) : (
            hint && <Typography variant="caption">{hint}</Typography>
          )}
        </div>
      )}
    />
  );
}
