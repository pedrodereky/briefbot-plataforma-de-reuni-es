import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Eye, EyeOff, Check, ArrowRight, ArrowLeft, Loader2,
  ExternalLink, Video, Mic, Rocket, Save, Mail, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 'welcome', label: 'Inicio' },
  { id: 'livekit', label: 'LiveKit' },
  { id: 'deepgram', label: 'Deepgram' },
  { id: 'resend', label: 'Resend' },
  { id: 'done', label: 'Pronto' },
];

type ConfiguredMap = Record<string, boolean>;

export default function OnboardingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState<ConfiguredMap>({});
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');

  // Load registry status (which keys are already stored) + sender info from user_settings
  useEffect(() => {
    const load = async () => {
      if (!user) return;

      const [{ data: settings }, { data: registry }] = await Promise.all([
        supabase
          .from('user_settings')
          .select('sender_name, sender_email, onboarding_completed_at')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('api_keys_registry')
          .select('service_name, is_active')
          .eq('user_id', user.id),
      ]);

      if (settings?.onboarding_completed_at) {
        navigate('/dashboard', { replace: true });
        return;
      }

      if (settings?.sender_name) setSenderName(settings.sender_name);
      if (settings?.sender_email) setSenderEmail(settings.sender_email);

      const map: ConfiguredMap = {};
      (registry ?? []).forEach((r) => {
        if (r.is_active) map[r.service_name] = true;
      });
      setConfigured(map);
    };
    load();
  }, [user, navigate]);

  const refreshRegistry = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('api_keys_registry')
      .select('service_name, is_active')
      .eq('user_id', user.id);
    const map: ConfiguredMap = {};
    (data ?? []).forEach((r) => { if (r.is_active) map[r.service_name] = true; });
    setConfigured(map);
  };

  const storeSecret = async (service_name: string, value: string) => {
    const { error } = await supabase.functions.invoke('store-api-key', {
      body: { service_name, value },
    });
    if (error) throw error;
  };

  const saveLiveKit = async (apiKey: string, apiSecret: string, url: string, onCleared: () => void) => {
    setSaving(true);
    try {
      await Promise.all([
        storeSecret('livekit_api_key', apiKey.trim()),
        storeSecret('livekit_api_secret', apiSecret.trim()),
        storeSecret('livekit_url', url.trim()),
      ]);
      onCleared();
      await refreshRegistry();
      toast({ title: 'Chave salva com sucesso!' });
    } catch {
      toast({ title: 'Erro ao salvar a chave. Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveDeepgram = async (apiKey: string, onCleared: () => void) => {
    setSaving(true);
    try {
      await storeSecret('deepgram_api_key', apiKey.trim());
      onCleared();
      await refreshRegistry();
      toast({ title: 'Chave salva com sucesso!' });
    } catch {
      toast({ title: 'Erro ao salvar a chave. Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveResend = async (apiKey: string, onCleared: () => void) => {
    if (!user) return;
    setSaving(true);
    try {
      // Sender info is not a secret → goes to user_settings
      await supabase.from('user_settings').upsert(
        {
          user_id: user.id,
          sender_name: senderName.trim() || null,
          sender_email: senderEmail.trim() || null,
          email_enabled: !!(apiKey.trim() && senderEmail.trim()),
        },
        { onConflict: 'user_id' }
      );
      if (apiKey.trim()) {
        await storeSecret('resend_api_key', apiKey.trim());
      }
      onCleared();
      await refreshRegistry();
      queryClient.invalidateQueries({ queryKey: ['user_settings'] });
      toast({ title: 'Chave salva com sucesso!' });
    } catch {
      toast({ title: 'Erro ao salvar a chave. Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const completeOnboarding = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from('user_settings').upsert(
        { user_id: user.id, onboarding_completed_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      queryClient.invalidateQueries({ queryKey: ['user_settings_onboarding'] });
      toast({ title: 'Configuracao concluida!' });
      navigate('/dashboard', { replace: true });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const hasLiveKit = !!(configured.livekit_api_key && configured.livekit_api_secret && configured.livekit_url);
  const hasDeepgram = !!configured.deepgram_api_key;
  const hasResend = !!(configured.resend_api_key && senderEmail);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <button
                onClick={() => i <= step && setStep(i)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  i < step
                    ? 'bg-primary text-primary-foreground'
                    : i === step
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn('h-0.5 w-6', i < step ? 'bg-primary' : 'bg-muted')} />
              )}
            </div>
          ))}
        </div>

        {/* Steps */}
        {step === 0 && <WelcomeStep onNext={next} />}

        {step === 1 && (
          <LiveKitStep
            configured={hasLiveKit}
            onSave={saveLiveKit}
            saving={saving}
            onNext={next}
            onPrev={prev}
          />
        )}

        {step === 2 && (
          <DeepgramStep
            configured={hasDeepgram}
            onSave={saveDeepgram}
            saving={saving}
            onNext={next}
            onPrev={prev}
          />
        )}

        {step === 3 && (
          <ResendStep
            configured={!!configured.resend_api_key}
            senderName={senderName}
            onSenderNameChange={setSenderName}
            senderEmail={senderEmail}
            onSenderEmailChange={setSenderEmail}
            onSave={saveResend}
            saving={saving}
            onNext={next}
            onPrev={prev}
          />
        )}

        {step === 4 && (
          <DoneStep
            hasLiveKit={hasLiveKit}
            hasDeepgram={hasDeepgram}
            hasResend={hasResend}
            onComplete={completeOnboarding}
            onPrev={prev}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge className="ml-2 gap-1 bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/15">
      <ShieldCheck className="h-3 w-3" /> Configurada
    </Badge>
  ) : (
    <Badge variant="outline" className="ml-2">Nao configurada</Badge>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <Card>
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Rocket className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-2xl">Bem-vindo ao BriefBot</CardTitle>
        <CardDescription className="text-base">
          Vamos configurar sua plataforma de reunioes inteligentes em poucos minutos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {[
            { n: '1', t: 'LiveKit', d: 'Motor de video/audio para reunioes ao vivo' },
            { n: '2', t: 'Deepgram', d: 'Transcricao em tempo real durante reunioes' },
            { n: '3', t: 'IA integrada', d: 'Briefings e resumos inteligentes (ja configurado!)' },
          ].map((item) => (
            <div key={item.n} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold">{item.n}</div>
              <div>
                <p className="text-sm font-medium">{item.t}</p>
                <p className="text-xs text-muted-foreground">{item.d}</p>
              </div>
            </div>
          ))}
        </div>
        <Separator />
        <p className="text-xs text-muted-foreground text-center inline-flex items-center justify-center gap-1.5 w-full">
          <ShieldCheck className="h-3.5 w-3.5" />
          Suas chaves sao armazenadas criptografadas no cofre seguro do banco de dados.
        </p>
        <Button onClick={onNext} className="w-full gap-2">
          Comecar <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function LiveKitStep({
  configured, onSave, saving, onNext, onPrev,
}: {
  configured: boolean;
  onSave: (apiKey: string, apiSecret: string, url: string, onCleared: () => void) => void;
  saving: boolean; onNext: () => void; onPrev: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [url, setUrl] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const filled = !!(apiKey.trim() && apiSecret.trim() && url.trim());

  const clear = () => {
    setApiKey('');
    setApiSecret('');
    setUrl('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg flex-wrap">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
            <Video className="h-5 w-5 text-violet-600" />
          </div>
          LiveKit — Video e Audio
          <ConfiguredBadge configured={configured} />
        </CardTitle>
        <CardDescription>
          Crie uma conta gratuita em{' '}
          <a href="https://cloud.livekit.io" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
            cloud.livekit.io <ExternalLink className="h-3 w-3" />
          </a>{' '}
          e copie as chaves do projeto.
          {configured && ' Os campos abaixo estao em branco por seguranca — preencha apenas para substituir as chaves atuais.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lk-key">API Key</Label>
            <Input id="lk-key" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="APIxxxxxxxx" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lk-secret">API Secret</Label>
            <div className="relative">
              <Input
                id="lk-secret"
                autoComplete="off"
                type={showSecret ? 'text' : 'password'}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lk-url">Server URL</Label>
            <Input id="lk-url" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="wss://seu-app.livekit.cloud" />
          </div>
        </div>

        <Button onClick={() => onSave(apiKey, apiSecret, url, clear)} disabled={saving || !filled} variant="outline" className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {configured ? 'Atualizar credenciais LiveKit' : 'Salvar credenciais LiveKit'}
        </Button>

        <StepNav onPrev={onPrev} onNext={onNext} nextLabel={configured ? 'Proximo' : 'Pular por agora'} />
      </CardContent>
    </Card>
  );
}

function DeepgramStep({
  configured, onSave, saving, onNext, onPrev,
}: {
  configured: boolean;
  onSave: (apiKey: string, onCleared: () => void) => void;
  saving: boolean; onNext: () => void; onPrev: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [show, setShow] = useState(false);
  const clear = () => setApiKey('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg flex-wrap">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <Mic className="h-5 w-5 text-emerald-600" />
          </div>
          Deepgram — Transcricao
          <ConfiguredBadge configured={configured} />
        </CardTitle>
        <CardDescription>
          Crie uma conta em{' '}
          <a href="https://console.deepgram.com" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
            console.deepgram.com <ExternalLink className="h-3 w-3" />
          </a>{' '}
          (US$200 de credito gratis) e crie uma API Key.
          {configured && ' O campo abaixo esta em branco por seguranca — preencha apenas para substituir a chave atual.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dg-key">API Key</Label>
          <div className="relative">
            <Input
              id="dg-key"
              autoComplete="off"
              type={show ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShow(!show)}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button onClick={() => onSave(apiKey, clear)} disabled={saving || !apiKey.trim()} variant="outline" className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {configured ? 'Atualizar credencial Deepgram' : 'Salvar credencial Deepgram'}
        </Button>

        <StepNav onPrev={onPrev} onNext={onNext} nextLabel={configured ? 'Proximo' : 'Pular por agora'} />
      </CardContent>
    </Card>
  );
}

function ResendStep({
  configured,
  senderName, onSenderNameChange,
  senderEmail, onSenderEmailChange,
  onSave, saving, onNext, onPrev,
}: {
  configured: boolean;
  senderName: string; onSenderNameChange: (v: string) => void;
  senderEmail: string; onSenderEmailChange: (v: string) => void;
  onSave: (apiKey: string, onCleared: () => void) => void;
  saving: boolean; onNext: () => void; onPrev: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [show, setShow] = useState(false);
  const clear = () => setApiKey('');
  const filled = !!((apiKey.trim() || configured) && senderEmail.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg flex-wrap">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
            <Mail className="h-5 w-5 text-blue-600" />
          </div>
          Email — Convites e Lembretes
          <ConfiguredBadge configured={configured} />
        </CardTitle>
        <CardDescription>
          Configure o envio de emails via{' '}
          <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
            Resend <ExternalLink className="h-3 w-3" />
          </a>
          . O dominio do email deve estar verificado no Resend.
          {configured && ' O campo de chave esta em branco por seguranca — preencha apenas para substituir.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="resend-key">API Key do Resend</Label>
          <div className="relative">
            <Input
              id="resend-key"
              autoComplete="off"
              type={show ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="re_..."
            />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShow(!show)}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Separator />

        <p className="text-sm font-medium">Remetente dos emails</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nome do remetente</Label>
            <Input
              value={senderName}
              onChange={(e) => onSenderNameChange(e.target.value)}
              placeholder="Ex: BriefBot, Sua Empresa"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email do remetente *</Label>
            <Input
              value={senderEmail}
              onChange={(e) => onSenderEmailChange(e.target.value)}
              placeholder="reunioes@seudominio.com"
              type="email"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Os convites serao enviados como: <strong>{senderName || 'BriefBot'} &lt;{senderEmail || 'reunioes@seudominio.com'}&gt;</strong>
        </p>

        <Button onClick={() => onSave(apiKey, clear)} disabled={saving || !filled} variant="outline" className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configuracao de email
        </Button>

        <StepNav onPrev={onPrev} onNext={onNext} nextLabel={configured ? 'Proximo' : 'Pular por agora'} />
      </CardContent>
    </Card>
  );
}

function DoneStep({
  hasLiveKit, hasDeepgram, hasResend,
  onComplete, onPrev, saving,
}: {
  hasLiveKit: boolean; hasDeepgram: boolean; hasResend: boolean;
  onComplete: () => void; onPrev: () => void; saving: boolean;
}) {
  return (
    <Card>
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <CardTitle className="text-2xl">Tudo pronto!</CardTitle>
        <CardDescription className="text-base">
          Revise abaixo. Voce pode voltar e preencher o que falta ou ir direto ao dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <CheckItem ok={hasLiveKit} label="LiveKit (video/audio)" />
          <CheckItem ok={hasDeepgram} label="Deepgram (transcricao)" />
          <CheckItem ok label="IA integrada (briefings e resumos)" />
          <CheckItem ok={hasResend} label="Resend (convites e lembretes por email)" />
        </div>

        <Separator />

        <div className="flex gap-3">
          <Button variant="outline" onClick={onPrev} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Button onClick={onComplete} disabled={saving} className="flex-1 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Ir para o Dashboard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Shared ───────────────────────────────────────────────

function StepNav({ onPrev, onNext, nextLabel = 'Proximo' }: { onPrev: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="flex gap-3 pt-2">
      <Button variant="outline" onClick={onPrev} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <Button onClick={onNext} className="flex-1 gap-1">
        {nextLabel} <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-lg border p-3', ok ? 'border-green-500/30 bg-green-500/5' : 'border-border')}>
      <div className={cn(
        'flex h-5 w-5 items-center justify-center rounded-full',
        ok ? 'bg-green-500 text-white' : 'border-2 border-muted-foreground/30'
      )}>
        {ok && <Check className="h-3 w-3" />}
      </div>
      <span className="text-sm">{label}</span>
      {!ok && <Badge variant="outline" className="ml-auto text-[10px]">Pendente</Badge>}
    </div>
  );
}