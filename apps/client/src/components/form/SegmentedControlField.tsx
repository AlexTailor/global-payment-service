import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { SegmentedControl } from '@/components/ui/segmented-control';

interface SegmentedControlFieldOption {
  value: string;
  label: string;
}

interface SegmentedControlFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  options: SegmentedControlFieldOption[];
  className?: string;
}

export function SegmentedControlField<TFieldValues extends FieldValues>({
  control,
  name,
  options,
  className,
}: SegmentedControlFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <SegmentedControl.Root value={field.value} onValueChange={field.onChange} className={className}>
          {options.map((option) => (
            <SegmentedControl.Option key={option.value} value={option.value}>
              {option.label}
            </SegmentedControl.Option>
          ))}
        </SegmentedControl.Root>
      )}
    />
  );
}
