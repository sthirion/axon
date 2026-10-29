import { useTheme } from '../../hooks/useTheme';
import { Button } from './Button';

// The label names the current theme; the changed label is the feedback, so nothing is announced.
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <Button onClick={toggle} className="w-auto min-w-32 bg-slate-600 dark:bg-slate-400">
      <span aria-hidden="true" className="mr-1">
        {dark ? '☾' : '☀'}
      </span>
      {dark ? 'Dark mode' : 'Light mode'}
    </Button>
  );
}
