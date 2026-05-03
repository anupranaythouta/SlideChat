// Toast notification system — call window.showToast(message, type) from anywhere
let _setToasts = null;

window.showToast = (message, type = 'success') => {
  if (!_setToasts) return;
  const id = Date.now() + Math.random();
  _setToasts(prev => [...prev, { id, message, type }]);
  setTimeout(() => {
    _setToasts(prev => prev.filter(t => t.id !== id));
  }, 3500);
};

const ToastContainer = () => {
  const [toasts, setToasts] = React.useState([]);
  _setToasts = setToasts;

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="sc-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`sc-toast sc-toast-${t.type}`}>
          <span className="sc-toast-icon">
            {t.type === 'success' ? Icons.check : t.type === 'error' ? Icons.x : Icons.sparkles}
          </span>
          <span className="sc-toast-msg">{t.message}</span>
          <button className="sc-toast-close" onClick={() => dismiss(t.id)}>
            {Icons.x}
          </button>
        </div>
      ))}
    </div>
  );
};

window.ToastContainer = ToastContainer;
