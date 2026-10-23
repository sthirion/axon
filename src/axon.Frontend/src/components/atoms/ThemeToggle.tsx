import { useTheme } from '../../hooks/useTheme';
import { Button } from './Button';

// A toggle button: the pressed state is the feedback, so nothing is announced on a switch.
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button
      aria-pressed={theme === 'dark'}
      onClick={toggle}
      className="bg-slate-600 dark:bg-slate-400"
    >
      <span aria-hidden="true" className="mr-1">
        {theme === 'dark' ? '☾' : '☀'}
      </span>
      Dark mode
    </Button>
  );
}
