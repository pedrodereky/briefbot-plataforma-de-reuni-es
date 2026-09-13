import type { Tables } from '@/integrations/supabase/types';
import type { User as AuthUser } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Eye, EyeOff, ExternalLink, LogOut, Trash2, Loader2,
  Link as LinkIcon, MessageSquare, Sparkles, User, Key,
  Video, Mic, Mail, ShieldCheck, AlertTriangle, RefreshCw, Palette, Users2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppearanceSection } from '@/components/AppearanceSection';
import { PageHeader, PageBody } from '@/components/PageHeader';
import { TeamSection } from '@/components/TeamSection';

type UserSettings = Tables<'user_settings'>;

const DEFAULT_PRE_PROMPT = `Você e um assistente de reuniões. Gere um briefing pré-reunião com base nos dados fornecidos.

Inclua:
- Objetivo provavel da reunião
- Contexto dos participantes
- Pontos que o usuário deve preparar
- Perguntas sugeridas

Formato: Markdown limpo, direto e pratico.`;

const DEFAULT_POST_PROMPT = `Análise a transcrição desta reunião e gere:

## Resumo Executivo
Resumo em 3-4 frases.

## Decisoes Tomadas
Lista das decisoes.

## Action Items
Use o formato: [RESPONSAVEL] → [ACAO] → [PRAZO]

## Pontos Não Resolvidos
Itens que ficaram em aberto.

Ignore conversas paralelas. Foque no que tem impacto pratico.
Formato: Markdown.`;

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['user_settings', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <PageHeader titulo="Configurações" />
      <PageBody>
        <Tabs defaultValue="aparencia" className="mx-auto max-w-3xl space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="aparencia" className="gap-1.5"><Palette className="h-4 w-4" /> Aparência</TabsTrigger>
            <TabsTrigger value="api-keys" className="gap-1.5"><Key className="h-4 w-4" /> API Keys</TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5"><LinkIcon className="h-4 w-4" /> Integrações</TabsTrigger>
            <TabsTrigger value="prompts" className="gap-1.5"><Sparkles className="h-4 w-4" /> Prompts</TabsTrigger>
            <TabsTrigger value="equipe" className="gap-1.5"><Users2 className="h-4 w-4" /> Equipe</TabsTrigger>
            <TabsTrigger value="account" className="gap-1.5"><User className="h-4 w-4" /> Conta</TabsTrigger>
          </TabsList>

          <TabsContent value="aparencia">
            <AppearanceSection />
          </TabsContent>
          <TabsContent value="api-keys">
            <ApiKeysSection settings={settings} userId={user?.id} />
          </TabsContent>
          <TabsContent value="integrations">
            <IntegrationsSection settings={settings} userId={user?.id} />
          </TabsContent>
          <TabsContent value="prompts">
            <PromptsSection settings={settings} userId={user?.id} />
          </TabsContent>
          <TabsContent value="equipe">
            <TeamSection />
          </TabsContent>
          <TabsContent value="account">
            <AccountSection user={user} />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}

// ─── API Keys ─────────────────────────────────────────────

type ServiceDef = {
  /** key used for grouping in UI / for "service_name" passed to validate-api-key (livekit/deepgram/resend) */
  group: 'livekit' | 'deepgram' | 'resend';
  title: string;
  description: string;
  icon: typeof Video;
  iconBg: string;
  iconColor: string;
  /** entries in api_keys_registry that compose this service */
  registryServices: string[];
  /** fields shown in the reconfigure modal */
  fields: { name: string; label: string; placeholder: string; type?: 'text' | 'password' }[];
  helpUrl: string;
  helpLabel: string;
};

const SERVICES: ServiceDef[] = [
  {
    group: 'livekit',
    title: 'LiveKit',
    description: 'Vídeo e áudio das reuniões ao vivo',
    icon: Video,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    registryServices: ['livekit_api_key', 'livekit_api_secret', 'livekit_url'],
    fields: [
      { name: 'livekit_api_key', label: 'API Key', placeholder: 'APIxxxxxxxx' },
      { name: 'livekit_api_secret', label: 'API Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' },
      { name: 'livekit_url', label: 'Server URL', placeholder: 'wss://seu-app.livekit.cloud' },
    ],
    helpUrl: 'https://cloud.livekit.io',
    helpLabel: 'cloud.livekit.io',
  },
  {
    group: 'deepgram',
    title: 'Deepgram',
    description: 'Transcrição em tempo real durante as reuniões',
    icon: Mic,
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    registryServices: ['deepgram_api_key'],
    fields: [
      { name: 'deepgram_api_key', label: 'API Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' },
    ],
    helpUrl: 'https://console.deepgram.com',
    helpLabel: 'console.deepgram.com',
  },
  {
    group: 'resend',
    title: 'Resend',
    description: 'Envio de convites, lembretes e briefings por email',
    icon: Mail,
    iconBg: 'bg-info/10',
    iconColor: 'text-info',
    registryServices: ['resend_api_key'],
    fields: [
      { name: 'resend_api_key', label: 'API Key', placeholder: 're_...', type: 'password' },
    ],
    helpUrl: 'https://resend.com/api-keys',
    helpLabel: 'resend.com/api-keys',
  },
];

type RegistryRow = {
  service_name: string;
  is_active: boolean;
  validation_status: string | null;
  last_validated_at: string | null;
  updated_at: string | null;
};

function ApiKeysSection({ settings: _settings, userId }: { settings: UserSettings | null; userId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: registry = [], isLoading } = useQuery({
    queryKey: ['api_keys_registry', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('api_keys_registry')
        .select('service_name, is_active, validation_status, last_validated_at, updated_at')
        .eq('user_id', userId);
      if (error) throw error;
      return (data ?? []) as RegistryRow[];
    },
    enabled: !!userId,
  });

  const [reconfiguring, setReconfiguring] = useState<ServiceDef | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['api_keys_registry', userId] });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Gerencie as chaves de integração dos servicos externos. As chaves ficam armazenadas
          criptografadas no cofre seguro do banco de dados — nunca são exibidas após serem salvas.
        </p>
      </div>

      <div className="grid gap-4">
        {SERVICES.map((svc) => (
          <ServiceCard
            key={svc.group}
            service={svc}
            registry={registry}
            onReconfigure={() => setReconfiguring(svc)}
            onChange={refresh}
          />
        ))}
      </div>

      <ReconfigureDialog
        service={reconfiguring}
        onClose={() => setReconfiguring(null)}
        onSaved={() => {
          setReconfiguring(null);
          refresh();
          toast({ title: 'Chave salva com sucesso!' });
        }}
      />
    </div>
  );
}

function statusFor(service: ServiceDef, registry: RegistryRow[]): 'active' | 'invalid' | 'not_configured' {
  const rows = registry.filter((r) => service.registryServices.includes(r.service_name) && r.is_active);
  if (rows.length < service.registryServices.length) return 'not_configured';
  if (rows.some((r) => r.validation_status === 'invalid')) return 'invalid';
  return 'active';
}

function lastUpdatedFor(service: ServiceDef, registry: RegistryRow[]): string | null {
  const dates = registry
    .filter((r) => service.registryServices.includes(r.service_name))
    .map((r) => r.updated_at)
    .filter(Boolean)
    .sort()
    .reverse();
  return dates[0] ?? null;
}

function ServiceCard({
  service, registry, onReconfigure, onChange,
}: {
  service: ServiceDef;
  registry: RegistryRow[];
  onReconfigure: () => void;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<'test' | 'remove' | null>(null);
  const status = statusFor(service, registry);
  const lastUpdated = lastUpdatedFor(service, registry);
  const Icon = service.icon;

  const test = async () => {
    setBusy('test');
    try {
      const { data, error } = await supabase.functions.invoke('validate-api-key', {
        body: { service_name: service.group },
      });
      if (error) throw error;
      if (data?.status === 'valid') {
        toast({ title: 'Conexão válida!' });
      } else {
        toast({ title: 'Chave inválida ou servico indisponivel.', variant: 'destructive' });
      }
      onChange();
    } catch {
      toast({ title: 'Chave inválida ou servico indisponivel.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    try {
      await Promise.all(
        service.registryServices.map((s) =>
          supabase.functions.invoke('delete-api-key', { body: { service_name: s } })
        )
      );
      toast({ title: 'Chave removida com sucesso.' });
      onChange();
    } catch {
      toast({ title: 'Erro ao remover a chave.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', service.iconBg)}>
              <Icon className={cn('h-5 w-5', service.iconColor)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-foreground">{service.title}</h3>
                <StatusBadge status={status} />
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{service.description}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {lastUpdated
                  ? `Atualizada em ${new Date(lastUpdated).toLocaleDateString('pt-BR')}`
                  : (
                    <a href={service.helpUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
                      Como obter esta chave em {service.helpLabel} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            {status !== 'not_configured' && (
              <Button variant="outline" size="sm" onClick={test} disabled={busy !== null}>
                {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1.5">Testar conexão</span>
              </Button>
            )}
            <Button variant={status === 'not_configured' ? 'default' : 'outline'} size="sm" onClick={onReconfigure}>
              <Key className="h-4 w-4" />
              <span className="ml-1.5">{status === 'not_configured' ? 'Configurar chave' : 'Alterar chave'}</span>
            </Button>
            {status !== 'not_configured' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    <span className="ml-1.5">Remover</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover chave?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja remover esta chave? A integracao com {service.title} sera desativada.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={remove}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: 'active' | 'invalid' | 'not_configured' }) {
  if (status === 'active') {
    return (
      <Badge className="gap-1 bg-success/15 text-success border-success/30 hover:bg-success/15">
        <ShieldCheck className="h-3 w-3" /> Ativa
      </Badge>
    );
  }
  if (status === 'invalid') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" /> Inválida
      </Badge>
    );
  }
  return <Badge variant="outline" className="gap-1">Não configurada</Badge>;
}

function ReconfigureDialog({
  service, onClose, onSaved,
}: {
  service: ServiceDef | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Reset state when service changes
  useEffect(() => {
    setValues({});
    setShowFields({});
  }, [service?.group]);

  if (!service) return null;

  const allFilled = service.fields.every((f) => (values[f.name] ?? '').trim().length > 0);

  const save = async () => {
    setSaving(true);
    try {
      for (const f of service.fields) {
        const v = values[f.name].trim();
        const { error } = await supabase.functions.invoke('store-api-key', {
          body: { service_name: f.name, value: v },
        });
        if (error) throw error;
      }
      // Wipe inputs from memory immediately
      setValues({});
      onSaved();
    } catch {
      toast({ title: 'Erro ao salvar a chave. Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!service} onOpenChange={(open) => { if (!open) { setValues({}); onClose(); } }}>
      <DialogContent className="sm:max-w-md max-sm:h-screen max-sm:max-h-screen max-sm:rounded-none max-sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Configurar {service.title}</DialogTitle>
          <DialogDescription>
            Insira sua chave de API para habilitar a integracao com {service.title}.{' '}
            <a href={service.helpUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
              Como obter esta chave? <ExternalLink className="h-3 w-3" />
            </a>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {service.fields.map((f) => {
            const isPassword = f.type === 'password';
            const visible = !!showFields[f.name];
            return (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={`fld-${f.name}`}>{f.label}</Label>
                <div className="relative">
                  <Input
                    id={`fld-${f.name}`}
                    autoComplete="off"
                    type={isPassword && !visible ? 'password' : 'text'}
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                    placeholder={f.placeholder}
                  />
                  {isPassword && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowFields((p) => ({ ...p, [f.name]: !p[f.name] }))}
                      aria-label={visible ? 'Ocultar' : 'Mostrar'}
                    >
                      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { setValues({}); onClose(); }}>Cancelar</Button>
          <Button onClick={save} disabled={!allFilled || saving} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Integrations ──────────────────────────────────────────

function IntegrationsSection({ settings, userId }: { settings: UserSettings | null; userId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [slackUrl, setSlackUrl] = useState('');

  useEffect(() => {
    if (settings) {
      setSlackUrl(settings.slack_webhook_url ?? '');
    }
  }, [settings]);

  const saveField = async (fields: Partial<UserSettings>) => {
    if (!userId) return;
    await supabase.from('user_settings').upsert(
      { user_id: userId, ...fields },
      { onConflict: 'user_id' }
    );
    queryClient.invalidateQueries({ queryKey: ['user_settings'] });
  };

  const testSlack = async () => {
    if (!slackUrl) {
      toast({ title: 'URL não configurada', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: 'Teste BriefBot' } },
            { type: 'section', text: { type: 'mrkdwn', text: 'Integração com Slack funcionando!' } },
          ],
        }),
      });
      if (!res.ok) throw new Error('Falha');
      toast({ title: 'Mensagem de teste enviada!' });
    } catch {
      toast({ title: 'Erro ao enviar teste', description: 'Verifique a URL do webhook.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Slack */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Slack</CardTitle>
          <CardDescription>
            <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
              Como criar um Incoming Webhook <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={testSlack}>Testar</Button>
            <Button onClick={() => { saveField({ slack_webhook_url: slackUrl }); toast({ title: 'Webhook salvo!' }); }}>Salvar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Delivery toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Canais de entrega</CardTitle>
          <CardDescription>Escolha como receber briefings e atas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <Label>Enviar convites e lembretes por email (Resend)</Label>
            </div>
            <Switch
              checked={settings?.email_enabled ?? false}
              onCheckedChange={(v) => { saveField({ email_enabled: v }); toast({ title: 'Configuração salva' }); }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <Label>Enviar briefing no Slack</Label>
            </div>
            <Switch
              checked={settings?.slack_enabled ?? false}
              onCheckedChange={(v) => { saveField({ slack_enabled: v }); toast({ title: 'Configuração salva' }); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Reminders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lembretes</CardTitle>
          <CardDescription>Enviar lembrete por email antes da reunião</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Label>Lembrar</Label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={settings?.reminder_minutes_before ?? 15}
              onChange={(e) => { saveField({ reminder_minutes_before: parseInt(e.target.value) }); toast({ title: 'Configuração salva' }); }}
            >
              <option value="5">5 min antes</option>
              <option value="10">10 min antes</option>
              <option value="15">15 min antes</option>
              <option value="30">30 min antes</option>
              <option value="60">1 hora antes</option>
            </select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Prompts ───────────────────────────────────────────────

function PromptsSection({ settings, userId }: { settings: UserSettings | null; userId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [prePrompt, setPrePrompt] = useState('');
  const [postPrompt, setPostPrompt] = useState('');

  useEffect(() => {
    setPrePrompt(settings?.custom_pre_prompt ?? DEFAULT_PRE_PROMPT);
    setPostPrompt(settings?.custom_post_prompt ?? DEFAULT_POST_PROMPT);
  }, [settings]);

  const save = async () => {
    if (!userId) return;
    await supabase.from('user_settings').upsert(
      { user_id: userId, custom_pre_prompt: prePrompt, custom_post_prompt: postPrompt },
      { onConflict: 'user_id' }
    );
    queryClient.invalidateQueries({ queryKey: ['user_settings'] });
    toast({ title: 'Prompts salvos!' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Prompts personalizados</CardTitle>
        <CardDescription>Esses prompts são enviados diretamente ao modelo de IA</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Prompt do briefing pré-reunião</Label>
          <Textarea rows={8} value={prePrompt} onChange={(e) => setPrePrompt(e.target.value)} />
          <Button variant="ghost" size="sm" onClick={() => setPrePrompt(DEFAULT_PRE_PROMPT)}>Restaurar padrao</Button>
        </div>
        <Separator />
        <div className="space-y-2">
          <Label>Prompt da ata pós-reunião</Label>
          <Textarea rows={8} value={postPrompt} onChange={(e) => setPostPrompt(e.target.value)} />
          <Button variant="ghost" size="sm" onClick={() => setPostPrompt(DEFAULT_POST_PROMPT)}>Restaurar padrao</Button>
        </div>
        <Button onClick={save}>Salvar prompts</Button>
      </CardContent>
    </Card>
  );
}

// ─── Account ───────────────────────────────────────────────

/**
 * Troca de senha de quem já está logado.
 *
 * Não pede a senha atual: a sessão aberta é a prova de identidade, e é assim
 * que o Supabase trata `updateUser`. A confirmação existe por outro motivo —
 * um erro de digitação aqui tranca o usuário para fora na próxima entrada.
 */
function TrocarSenha() {
  const { definirNovaSenha } = useAuth();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const MINIMO = 6;
  const curta = senha.length > 0 && senha.length < MINIMO;
  const diferentes = confirmacao.length > 0 && senha !== confirmacao;
  const pode = senha.length >= MINIMO && senha === confirmacao && !salvando;

  const salvar = async () => {
    setSalvando(true);
    try {
      const { error } = await definirNovaSenha(senha);
      if (error) {
        toast({ title: 'Não foi possível trocar a senha', description: error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Senha alterada', description: 'Use a nova senha na próxima vez que entrar.' });
      setSenha('');
      setConfirmacao('');
      setAberto(false);
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">Senha</p>
          <p className="text-sm text-muted-foreground">Trocar a senha desta conta.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          Alterar senha
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-foreground">Nova senha</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="senha-nova" className="text-xs">Nova senha</Label>
          <Input
            id="senha-nova"
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          {curta && (
            <p className="text-xs text-destructive">Mínimo de {MINIMO} caracteres.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="senha-confirma" className="text-xs">Repita a senha</Label>
          <Input
            id="senha-confirma"
            type="password"
            autoComplete="new-password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
          />
          {diferentes && <p className="text-xs text-destructive">As duas não conferem.</p>}
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={salvar} disabled={!pode}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar senha
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setAberto(false); setSenha(''); setConfirmacao(''); }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function AccountSection({ user }: { user: AuthUser | null }) {
  const { signOut } = useAuth();
  const { toast } = useToast();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Conta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{user?.user_metadata?.full_name ?? 'Usuário'}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
        <Separator />

        <TrocarSenha />

        <Separator />
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir conta
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação e irreversivel. Todos os seus dados serão apagados permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => toast({ title: 'Funcionalidade em desenvolvimento' })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Confirmar exclusao
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
