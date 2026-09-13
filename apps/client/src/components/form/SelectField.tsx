import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { Select } from '@/components/ui/select';
import { Typography } from '@/components/ui/typography';

interface SelectFieldOption {
  value: string;
  label: string;
}

interface SelectFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  options: SelectFieldOption[];
  placeholder?: string;
  className?: string;
}

export function SelectField<TFieldValues extends FieldValues>({
  control,
  name,
  options,
  placeholder,
  className,
}: SelectFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="flex flex-col gap-1.5">
          <Select.Root value={field.value} onValueChange={field.onChange}>
            <Select.Trigger
              className={className}
              aria-invalid={!!fieldState.error}
              onBlur={field.onBlur}
            >
              <Select.Value placeholder={placeholder} />
            </Select.Trigger>
            <Select.Content>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          {fieldState.error && <Typography variant="error">{fieldState.error.message}</Typography>}
        </div>
      )}
    />
  );
}
