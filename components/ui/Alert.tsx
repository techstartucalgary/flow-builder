interface AlertProps {
  variant: 'error' | 'success' | 'info' | 'warning';
  message: string;
  onClose?: () => void;
}

export const Alert = ({ variant, message, onClose }: AlertProps) => {
  const variants = {
    error: 'bg-red-100 border-red-400 text-red-700',
    success: 'bg-green-100 border-green-400 text-green-700',
    info: 'bg-blue-100 border-blue-400 text-blue-700',
    warning: 'bg-yellow-100 border-yellow-400 text-yellow-700',
  };

  return (
    <div className={`mb-4 p-3 border rounded relative ${variants[variant]}`}>
      {message}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-lg font-bold hover:opacity-70"
          aria-label="Close"
        >
          ×
        </button>
      )}
    </div>
  );
};
