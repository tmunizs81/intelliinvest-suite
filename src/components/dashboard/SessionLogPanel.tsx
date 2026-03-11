import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Globe, Clock, LogOut, Shield } from 'lucide-react';

interface SessionInfo {
  id: string;
  device: string;
  browser: string;
  ip: string;
  lastActive: Date;
  isCurrent: boolean;
}

function getDeviceIcon(device: string) {
  return device.toLowerCase().includes('mobile') ? Smartphone : Monitor;
}

export default function SessionLogPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    // Simulate sessions from browser info
    const current: SessionInfo = {
      id: '1',
      device: /Mobi/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
      browser: getBrowserName(),
      ip: '***.***.***.' + Math.floor(Math.random() * 255),
      lastActive: new Date(),
      isCurrent: true,
    };
    setSessions([current]);
  }, []);

  const handleLogout = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Shield className="h-4 w-4" />
        <p className="text-xs">Dispositivos conectados à sua conta</p>
      </div>

      <div className="space-y-2">
        {sessions.map(s => {
          const DeviceIcon = getDeviceIcon(s.device);
          return (
            <div key={s.id} className={`flex items-center gap-3 p-3 rounded-lg border ${
              s.isCurrent ? 'border-primary/30 bg-primary/5' : 'border-border'
            }`}>
              <DeviceIcon className={`h-5 w-5 shrink-0 ${s.isCurrent ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">{s.device}</span>
                  <span className="text-[10px] text-muted-foreground">• {s.browser}</span>
                  {s.isCurrent && (
                    <span className="text-[9px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">Atual</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" /> {s.ip}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {s.lastActive.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  onClick={() => handleLogout(s.id)}
                  className="h-7 px-2.5 rounded-md bg-destructive/10 text-destructive text-[10px] font-medium flex items-center gap-1 hover:bg-destructive/20 transition-all"
                >
                  <LogOut className="h-3 w-3" /> Encerrar
                </button>
              )}
            </div>
          );
        })}
      </div>

      {sessions.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Nenhuma sessão ativa</p>
        </div>
      )}
    </div>
  );
}

function getBrowserName() {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  return 'Outro';
}
