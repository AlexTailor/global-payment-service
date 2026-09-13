import * as React from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { Input } from '@/components/ui/input';

interface InputFieldProps<TFieldValues extends FieldValues>
  extends Omit<React.ComponentProps<typeof Input>, 'name' | 'defaultValue'> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
}

export function InputField<TFieldValues extends FieldValues>({
  control,
  name,
  ...props
}: InputFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="flex flex-col gap-1.5">
          <Input {...props} {...field} aria-invalid={!!fieldState.error} />
          {fieldState.error && (
            <p className="text-[11.5px] text-failure-text">{fieldState.error.message}</p>
          )}
        </div>
      )}
    />
  );
}
