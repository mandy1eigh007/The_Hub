export function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div class="lb open" onClick={onClose}>
      <img src={src} alt="" onClick={e => e.stopPropagation()} />
    </div>
  );
}
