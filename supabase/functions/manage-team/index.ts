// Edge function: manage-team
//
// Gestão da equipe de uma organização. Toda escrita na filiação passa por aqui
// de propósito: `organization_members` não concede INSERT nem DELETE a
// `authenticated`, então um membro não se promove nem convida ninguém direto
// pelo cliente, mesmo conhecendo a chave publicável.
//
// Criar usuário exige a chave de serviço (auth.admin), que nunca pode ir ao
// navegador — é a razão de esta função existir.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handlePreflight, jsonResponse, errorResponse, logErro } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";

type Papel = "owner" | "admin" | "member";

interface Membro {
  user_id: string;
  papel: Papel;
  email: string | null;
  nome: string | null;
  criado_em: string;
}

const PAPEIS_CONVIDAVEIS: Papel[] = ["admin", "member"];

function servico() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Organização de quem chamou, com o papel dele dentro dela. */
async function filiacao(supabase: ReturnType<typeof servico>, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("org_id, papel")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { org_id: string; papel: Papel } | null;
}

const podeAdministrar = (papel: Papel) => papel === "owner" || papel === "admin";

/** Senha inicial com entropia suficiente para não ser adivinhada. */
function senhaProvisoria(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 20);
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const usuario = await requireUser(req);
  if (!usuario.ok) return usuario.response;

  const supabase = servico();

  try {
    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo.acao ?? "listar");

    const minha = await filiacao(supabase, usuario.userId);
    if (!minha) return errorResponse(req, "Você ainda não pertence a uma organização.", 409);

    // ── Listar: qualquer membro pode ver com quem divide os dados ───────────
    if (acao === "listar") {
      const { data: org } = await supabase
        .from("organizations").select("id, nome").eq("id", minha.org_id).single();

      const { data: linhas, error } = await supabase
        .from("organization_members")
        .select("user_id, papel, created_at")
        .eq("org_id", minha.org_id)
        .order("created_at");
      if (error) throw error;

      // O e-mail vive em auth.users, fora do alcance do PostgREST.
      const membros: Membro[] = [];
      for (const linha of linhas ?? []) {
        const { data: u } = await supabase.auth.admin.getUserById(linha.user_id);
        membros.push({
          user_id: linha.user_id,
          papel: linha.papel as Papel,
          email: u?.user?.email ?? null,
          nome: (u?.user?.user_metadata?.full_name as string | undefined) ?? null,
          criado_em: linha.created_at,
        });
      }

      return jsonResponse(req, {
        organizacao: org,
        meu_papel: minha.papel,
        membros,
      });
    }

    // ── Daqui para baixo, só quem administra ────────────────────────────────
    if (!podeAdministrar(minha.papel)) {
      return errorResponse(req, "Só quem administra a organização pode fazer isso.", 403);
    }

    if (acao === "renomear") {
      const nome = String(corpo.nome ?? "").trim();
      if (nome.length < 2) return errorResponse(req, "Informe um nome com pelo menos 2 caracteres.", 400);
      const { error } = await supabase.from("organizations").update({ nome }).eq("id", minha.org_id);
      if (error) throw error;
      return jsonResponse(req, { ok: true, nome });
    }

    if (acao === "criar") {
      const email = String(corpo.email ?? "").trim().toLowerCase();
      const nome = String(corpo.nome ?? "").trim();
      const papel = (corpo.papel === "admin" ? "admin" : "member") as Papel;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return errorResponse(req, "E-mail inválido.", 400);
      }
      if (!PAPEIS_CONVIDAVEIS.includes(papel)) {
        return errorResponse(req, "Papel inválido.", 400);
      }

      const senha = senhaProvisoria();
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        // O trigger de novo usuário lê estes dois campos e põe a pessoa NESTA
        // organização, em vez de criar uma nova para ela.
        user_metadata: { full_name: nome || email.split("@")[0], org_id: minha.org_id, papel },
      });

      if (error) {
        const jaExiste = /already|registered|exists/i.test(error.message);
        return errorResponse(
          req,
          jaExiste
            ? "Já existe uma conta com esse e-mail. Peça para a pessoa entrar e usar 'Esqueci a senha'."
            : error.message,
          jaExiste ? 409 : 400,
        );
      }

      // A senha provisória volta UMA vez, para quem administra repassar. Ela
      // não é gravada em lugar nenhum: quem perder, usa "Esqueci a senha".
      return jsonResponse(req, { ok: true, user_id: data.user?.id, email, papel, senha_provisoria: senha });
    }

    if (acao === "papel") {
      const alvo = String(corpo.user_id ?? "");
      const papel = (corpo.papel === "admin" ? "admin" : "member") as Papel;
      if (!alvo) return errorResponse(req, "Informe quem deve mudar de papel.", 400);

      const { data: atual } = await supabase
        .from("organization_members").select("papel")
        .eq("org_id", minha.org_id).eq("user_id", alvo).maybeSingle();
      if (!atual) return errorResponse(req, "Essa pessoa não está na organização.", 404);
      if (atual.papel === "owner") {
        return errorResponse(req, "O dono da organização não pode mudar de papel.", 409);
      }

      const { error } = await supabase
        .from("organization_members").update({ papel })
        .eq("org_id", minha.org_id).eq("user_id", alvo);
      if (error) throw error;
      return jsonResponse(req, { ok: true, user_id: alvo, papel });
    }

    if (acao === "remover") {
      const alvo = String(corpo.user_id ?? "");
      if (!alvo) return errorResponse(req, "Informe quem deve sair.", 400);
      if (alvo === usuario.userId) {
        return errorResponse(req, "Você não pode remover a si mesmo.", 409);
      }

      const { data: atual } = await supabase
        .from("organization_members").select("papel")
        .eq("org_id", minha.org_id).eq("user_id", alvo).maybeSingle();
      if (!atual) return errorResponse(req, "Essa pessoa não está na organização.", 404);
      if (atual.papel === "owner") {
        return errorResponse(req, "O dono da organização não pode ser removido.", 409);
      }

      // Sai da equipe, mas a conta continua existindo: apagar o usuário levaria
      // junto as reuniões que ele criou, que são da organização.
      const { error } = await supabase
        .from("organization_members").delete()
        .eq("org_id", minha.org_id).eq("user_id", alvo);
      if (error) throw error;
      return jsonResponse(req, { ok: true, user_id: alvo });
    }

    return errorResponse(req, `Ação desconhecida: ${acao}`, 400);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logErro(req, "manage-team falhou", { mensagem });
    return new Response(JSON.stringify({ error: "Não foi possível concluir a operação." }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
