import { useEffect } from 'preact/hooks';

export function ToastList({ toasts, dispatch }) {
  return (
    <div class="toasts">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} dispatch={dispatch} />
      ))}
    </div>
  );
}

function Toast({ toast, dispatch }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: 'REMOVE_TOAST', id: toast.id });
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id]);

  const cls = { s: 'ts', e: 'te', i: 'ti', w: 'tw' }[toast.type] || 'ti';
  return <div class={`toast ${cls}`}>{toast.msg}</div>;
}
