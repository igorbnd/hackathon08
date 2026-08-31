import { useState } from 'react';

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  /** Optional helper text rendered below the field */
  hint?: string;
}

/**
 * Password field with a show/hide toggle.
 *
 * Visibility state is per-field rather than shared, so revealing one password
 * does not reveal a paired confirmation field.
 */
export function PasswordInput({
  id,
  label,
  value,
  onChange,
  name,
  autoComplete = 'current-password',
  placeholder,
  required = false,
  minLength,
  hint,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>

      <div className="relative mt-1">
        <input
          id={id}
          name={name ?? id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-16 text-gray-900 placeholder-gray-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-xs font-semibold text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>

      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
