import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { escolherMimeType } from '@/lib/audio-mime';

interface UseTranscriptionOptions {
  meetingId: string;
  participantId: string;
  participantName: string;
  /** Token do convite; obrigatório para convidado sem conta. */
  joinToken?: string | null;
  enabled?: boolean;
}

/** Deepgram encerra conexão ociosa; um ping periódico mantém a sessão viva. */
const INTERVALO_KEEPALIVE_MS = 8000;

/** Reconexão com espera crescente, para não martelar o servidor. */
const MAX_TENTATIVAS_RECONEXAO = 5;
const ESPERA_BASE_MS = 1000;

export function useTranscription({
  meetingId,
  participantId,
  participantName,
  joinToken,
  enabled = false,
}: UseTranscriptionOptions) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const keepAliveRef = useRef<number | null>(null);
  const reconexaoRef = useRef<number | null>(null);
  const tentativasRef = useRef(0);
  /** Distingue encerramento pedido pelo usuário de queda de conexão. */
  const pararRef = useRef(false);

  const limparTimers = useCallback(() => {
    if (keepAliveRef.current !== null) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    if (reconexaoRef.current !== null) {
      clearTimeout(reconexaoRef.current);
      reconexaoRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    pararRef.current = true;
    limparTimers();
    tentativasRef.current = 0;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // CloseStream avisa o Deepgram para devolver o último resultado final
      // antes de encerrar, em vez de descartar o que estava em buffer.
      try {
        wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      } catch {
        // conexão já caiu
      }
      wsRef.current.close();
    }
    wsRef.current = null;

    setIsTranscribing(false);
    setInterimText('');
  }, [limparTimers]);

  /** Abre a conexão e começa a enviar áudio. Reutilizada pela reconexão. */
  const conectar = useCallback(
    async (audioStream: MediaStream) => {
      // Pede uma credencial EFÊMERA do Deepgram (validade de minutos, escopo
      // só de envio de áudio). A chave permanente do dono nunca chega aqui.
      const { data: keyData, error: keyErr } = await supabase.functions.invoke('deepgram-token', {
        body: { meeting_id: meetingId, join_token: joinToken ?? undefined },
      });
      if (keyErr || !keyData?.key) {
        throw new Error('Nao foi possivel obter credencial de transcricao');
      }

      const mimeType = escolherMimeType();
      if (!mimeType) {
        // Antes o construtor do MediaRecorder simplesmente lançava e a
        // transcrição morria calada — principalmente no Safari/iOS.
        throw new Error('Seu navegador nao suporta gravacao de audio para transcricao');
      }

      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-2&language=pt-BR&punctuate=true&interim_results=true&endpointing=300`,
        ['token', keyData.key],
      );

      wsRef.current = ws;
      streamRef.current = audioStream;

      ws.onopen = () => {
        setIsTranscribing(true);
        setError(null);
        tentativasRef.current = 0;

        const mediaRecorder = new MediaRecorder(audioStream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(event.data);
          }
        };

        mediaRecorder.start(250); // Envia trechos a cada 250ms

        keepAliveRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, INTERVALO_KEEPALIVE_MS);
      };

      ws.onmessage = async (event) => {
        try {
          const result = JSON.parse(event.data);
          const transcript = result.channel?.alternatives?.[0]?.transcript;
          if (!transcript) return;

          if (result.is_final && transcript.trim()) {
            setInterimText('');
            const { error: insertErr } = await supabase.from('meeting_transcripts').insert({
              meeting_id: meetingId,
              participant_id: participantId,
              participant_name: participantName,
              text: transcript.trim(),
              is_final: true,
            });
            // O retorno não era checado: falha de RLS ou de rede descartava o
            // trecho em silêncio, e a ata saía incompleta sem ninguém saber.
            if (insertErr) {
              console.error('Falha ao salvar trecho da transcricao', insertErr);
              setError('Parte da transcricao nao foi salva');
            }
          } else if (transcript.trim()) {
            setInterimText(transcript);
          }
        } catch {
          // Mensagens não-JSON do Deepgram são ignoradas.
        }
      };

      ws.onerror = () => {
        setError('Erro na conexao de transcricao');
      };

      ws.onclose = () => {
        setIsTranscribing(false);
        limparTimers();

        if (pararRef.current) return;

        // Queda não solicitada: tenta voltar. Sem isto, uma oscilação de rede
        // encerrava a transcrição pelo resto da reunião.
        if (tentativasRef.current >= MAX_TENTATIVAS_RECONEXAO) {
          setError('Transcricao interrompida. Recarregue a pagina para tentar de novo.');
          return;
        }

        const espera = ESPERA_BASE_MS * 2 ** tentativasRef.current;
        tentativasRef.current += 1;

        reconexaoRef.current = window.setTimeout(() => {
          const stream = streamRef.current;
          if (!stream || pararRef.current) return;
          conectar(stream).catch(() => {
            setError('Nao foi possivel restabelecer a transcricao');
          });
        }, espera);
      };
    },
    [meetingId, participantId, participantName, joinToken, limparTimers],
  );

  const start = useCallback(
    async (audioStream: MediaStream) => {
      setError(null);
      pararRef.current = false;
      tentativasRef.current = 0;

      try {
        await conectar(audioStream);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao iniciar transcricao');
        setIsTranscribing(false);
      }
    },
    [conectar],
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isTranscribing,
    interimText,
    error,
    start,
    stop,
  };
}
