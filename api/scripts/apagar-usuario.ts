/* ============================================================
   Apagar uma conta — a outra porta dos fundos estreita
   ============================================================
   Rodar:
     npm run apagar-usuario -- email@dominio.com            (mostra)
     npm run apagar-usuario -- email@dominio.com --confirmar (apaga)

   Existe pelo mesmo motivo de `creditar.ts`: durante os testes com
   usuários, conta de teste precisa sair, e não há administrador de
   plataforma neste produto (os papéis são todos POR EMPRESA). Um
   script no terminal já é a restrição mais forte disponível — exige
   acesso à máquina e ao `.env`.

   ------------------------------------------------------------
   POR QUE DOIS PASSOS, E POR QUE ELE RECUSA SOZINHO
   ------------------------------------------------------------
   Do usuário pendem coisas de dois tipos. Sessões, códigos,
   dispositivos e vínculos somem em cascata — são estado de acesso,
   não conteúdo. Mas empresa, projeto e idéia criados por ele são
   `Restrict`: o banco recusa, e está certo em recusar. Apagar a
   conta que criou uma empresa deixaria a empresa sem autor, ou
   levaria junto o trabalho de outras pessoas.

   Então este script não força nada. Ele conta o que existe, e se
   houver conteúdo criado ele PARA e diz o que encontrou. Quem
   decidir apagar mesmo assim que decida com o número na frente.

   `TentativaLogin` é o caso chato: também é `Restrict`, mas é só
   registro de tentativa — não é conteúdo de ninguém. Esse o script
   remove sozinho, porque bloquear por causa dele seria ruído.
   ============================================================ */

import { db } from '../src/db.js';

const [email, flag] = process.argv.slice(2);

function uso(): never {
  console.log('\n  npm run apagar-usuario -- <email>              mostra o que seria apagado');
  console.log('  npm run apagar-usuario -- <email> --confirmar  apaga de verdade\n');
  process.exit(1);
}

(async () => {
  if (!email) uso();

  const usuario = await db.usuario.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true, nome: true, email: true, emailVerificado: true, criadoEm: true,
      _count: {
        select: {
          sessoes: true, codigos: true, dispositivos: true, tentativas: true,
          vinculos: true, empresasCriadas: true, projetosCriados: true,
          ideiasCriadas: true, conversasIa: true,
        },
      },
    },
  });

  if (!usuario) {
    console.error(`\n  Nenhum usuário com o e-mail ${email}.\n`);
    process.exit(1);
  }

  const c = usuario._count;
  console.log(`\n  ${usuario.nome} <${usuario.email}>`);
  console.log(`  Criada em ${usuario.criadoEm.toISOString().slice(0, 16).replace('T', ' ')}` +
              `  ·  e-mail ${usuario.emailVerificado ? 'verificado' : 'NÃO verificado'}\n`);

  console.log('  Some em cascata:');
  console.log(`    sessões ${c.sessoes}  ·  códigos ${c.codigos}  ·  dispositivos ${c.dispositivos}  ·  vínculos ${c.vinculos}`);
  console.log('  Removido por este script:');
  console.log(`    tentativas de login ${c.tentativas}`);
  console.log('  CONTEÚDO criado (bloqueia):');
  console.log(`    empresas ${c.empresasCriadas}  ·  projetos ${c.projetosCriados}  ·  idéias ${c.ideiasCriadas}  ·  conversas IA ${c.conversasIa}\n`);

  const conteudo = c.empresasCriadas + c.projetosCriados + c.ideiasCriadas;
  if (conteudo > 0) {
    console.error('  PAROU: esta conta criou conteúdo. Apagá-la deixaria empresa, projeto');
    console.error('  ou idéia sem autor — o banco recusa, e com razão. Trate o conteúdo');
    console.error('  primeiro (transferir ou arquivar) antes de apagar a conta.\n');
    process.exit(1);
  }

  if (flag !== '--confirmar') {
    console.log('  Nada foi apagado. Para apagar, repita com --confirmar\n');
    process.exit(0);
  }

  /* Numa transação só: se a segunda falhar, a primeira não fica
     tendo acontecido. Meio caminho aqui é pior que não começar. */
  await db.$transaction([
    db.tentativaLogin.deleteMany({ where: { usuarioId: usuario.id } }),
    db.usuario.delete({ where: { id: usuario.id } }),
  ]);

  console.log(`  Conta de ${usuario.email} apagada. O e-mail está livre para novo cadastro.\n`);
})()
  .catch((e) => { console.error('\n  Falhou:', e instanceof Error ? e.message : e, '\n'); process.exit(1); })
  .finally(() => db.$disconnect());
