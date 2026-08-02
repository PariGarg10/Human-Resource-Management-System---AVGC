import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export function PasswordInput({ className = '', ...props }: Props) {
  const [show, setShow] = useState(false);

  return (
    <div className="password-field-wrap">
      <input {...props} type={show ? 'text' : 'password'} className={className} />
      <button
        type="button"
        className="password-toggle-btn"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        onClick={() => setShow((v) => !v)}
      >
        {show ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
      </button>
    </div>
  );
}
