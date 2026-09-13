import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contaDasChaves, contaDasChavesPorReuniao } from '../../supabase/functions/_shared/chaves.ts';

type ClienteSupabase = Parameters<typeof contaDasChaves>[0];

/**
 * De quem são as chaves que uma reunião usa.
 *
 * Errar aqui é silencioso do pior jeito: a reunião simplesmente não acha
 * credencial e o usuário vê "Deepgram não configurado" numa conta que tem
 * Deepgram configurado.
 */

const DONO_ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CRIADOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function clienteFalso(opcoes: {
  dono?: string | null;
  erroRpc?: { code: string } | null;
  reuniao?: { user_id: string; org_id: string | null } | null;
}) {
  return {
    rpc: vi.fn(async (nome: string) => {
      if (nome !== 'dono_da_org') throw new Error(`rpc inesperada: ${nome}`);
      return { data: opcoes.dono ?? null, error: opcoes.erroRpc ?? null };
    }),
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: opcoes.reuniao ?? null, error: null }),
        }),
      }),
    })),
    // O duplo cast é o mínimo: o dublê implementa só as duas chamadas que
    // `chaves.ts` faz, e o SupabaseClient real tem dezenas de membros.
  } as unknown as ClienteSupabase;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('contaDasChaves', () => {
  it('usa o dono da organização, não quem criou a reunião', async () => {
    const supabase = clienteFalso({ dono: DONO_ORG });
    const conta = await contaDasChaves(supabase, { user_id: CRIADOR, org_id: ORG });
    expect(conta).toBe(DONO_ORG);
  });

  it('sem organização, cai no criador — é a linha anterior à migração', async () => {
    const supabase = clienteFalso({ dono: DONO_ORG });
    const conta = await contaDasChaves(supabase, { user_id: CRIADOR, org_id: null });
    expect(conta).toBe(CRIADOR);
    // Nem chega a perguntar: sem org_id não há o que resolver.
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('se a RPC falhar, cai no criador em vez de ficar sem chave nenhuma', async () => {
    // Acontece se a function chamar com cliente de usuário: dono_da_org é
    // exclusiva do service_role. Ficar sem chave quebraria a reunião inteira.
    const supabase = clienteFalso({ dono: null, erroRpc: { code: '42501' } });
    const conta = await contaDasChaves(supabase, { user_id: CRIADOR, org_id: ORG });
    expect(conta).toBe(CRIADOR);
    expect(console.warn).toHaveBeenCalled();
  });

  it('organização sem dono localizado também cai no criador', async () => {
    const supabase = clienteFalso({ dono: null });
    const conta = await contaDasChaves(supabase, { user_id: CRIADOR, org_id: ORG });
    expect(conta).toBe(CRIADOR);
  });
});

describe('contaDasChavesPorReuniao', () => {
  it('busca a organização da reunião e resolve o dono dela', async () => {
    const supabase = clienteFalso({
      dono: DONO_ORG,
      reuniao: { user_id: CRIADOR, org_id: ORG },
    });
    const conta = await contaDasChavesPorReuniao(supabase, 'reuniao-1', CRIADOR);
    expect(conta).toBe(DONO_ORG);
  });

  it('reunião não encontrada devolve o dono informado', async () => {
    const supabase = clienteFalso({ dono: DONO_ORG, reuniao: null });
    const conta = await contaDasChavesPorReuniao(supabase, 'some-id', CRIADOR);
    expect(conta).toBe(CRIADOR);
  });
});
