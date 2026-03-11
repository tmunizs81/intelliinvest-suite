import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await resetPassword(email);
    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border border-primary/20 bg-card p-8 text-center animate-fade-in">
          <Mail className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Email enviado</h2>
          <p className="text-sm text-muted-foreground mb-4">Verifique sua caixa de entrada para redefinir a senha.</p>
          <Link to="/login" className="text-primary hover:underline text-sm">Voltar ao login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">T2-<span className="text-primary">Simplynvest</span></h1>
          <p className="text-sm text-muted-foreground mt-2">Recupere o acesso à sua conta</p>
        </div>
        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-4">
          {error && <div className="rounded-md bg-loss/10 border border-loss/20 p-3 text-sm text-loss-foreground">{error}</div>}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="seu@email.com" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Enviar link de recuperação
          </button>
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">Voltar ao login</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
