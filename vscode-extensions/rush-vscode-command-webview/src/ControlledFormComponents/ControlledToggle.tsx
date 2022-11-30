import { IToggleProps, Toggle } from '@fluentui/react';
import * as React from 'react';
import { Controller } from 'react-hook-form';
import { ErrorMessage } from './ErrorMessage';

import type { IHookFormProps } from './interface';

export type IControlledToggleProps = IToggleProps & IHookFormProps<string>;

export const ControlledToggle = (props: IControlledToggleProps): JSX.Element => {
  const { name, control, rules, defaultValue } = props;
  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      defaultValue={defaultValue}
      render={({ field: { onChange, value, onBlur, name: fieldName }, fieldState: { error } }) => {
        console.log('ControlledToggle', fieldName, value);
        return (
          <>
            <Toggle
              onText="On"
              offText="Off"
              {...props}
              onChange={(e, checked) => onChange(checked)}
              checked={value}
              onBlur={onBlur}
              id={fieldName}
            />
            {error && error.message && <ErrorMessage message={error.message} />}
          </>
        );
      }}
    />
  );
};
