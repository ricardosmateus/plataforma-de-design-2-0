/* ============================================================
   Testes das primitivas de segurança
   ============================================================
   Não tocam o banco: exercitam hash de senha, política, código de
   verificação e tokens de sessão. Rodam com `npm run teste`.
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/x';
process.env.JWT_SEGREDO ??= 'segredo-de-teste-com-mais-de-32-caracteres!!';
process.env.OTP_PIMENTA ??= 'pimenta-de-teste-com-mais-de-32-caracteres!!';
process.env.VERIFICAR_VAZAMENTO ??= 'nao';
process.env.NODE_ENV = 'test';

const senhas = await import('../src/seguranca/senha.js');
const otp = await import('../src/seguranca/otp.js');
const sessao = await import('../src/seguranca/sessao.js');

describe('senha — hash', () => {
  test('argon2id: verifica a correta e recusa a errada', async () => {
    const hash = await senhas.hashear('cavalo bateria grampo correto');
    assert.ok(hash.startsWith('$argon2id$'), 'deve usar argon2id, não argon2i nem argon2d');
    assert.equal(await senhas.conferir(hash, 'cavalo bateria grampo correto'), true);
    assert.equal(await senhas.conferir(hash, 'cavalo bateria grampo errado'), false);
  });

  test('o mesmo texto gera hashes diferentes (sal por senha)', async () => {
    const [a, b] = await Promise.all([senhas.hashear('mesma senha aqui'), senhas.hashear('mesma senha aqui')]);
    assert.notEqual(a, b, 'sem sal único, senhas iguais seriam identificáveis no dump');
  });

  test('hash corrompido não derruba a requisição', async () => {
    assert.equal(await senhas.conferir('nao-e-um-hash', 'x'), false);
  });
});

describe('senha — política (NIST SP 800-63B Rev 4)', () => {
  test('reprova abaixo do mínimo', async () => {
    assert.ok(await senhas.validarPolitica('abc1234'));
  });

  test('aceita frase longa SEM maiúscula, número ou símbolo', async () => {
    /* É o ponto da norma: composição obrigatória barra justamente
       as senhas boas. */
    assert.equal(await senhas.validarPolitica('cavalo bateria grampo correto'), null);
  });

  test('reprova senha comum ainda que satisfaça composição antiga', async () => {
    assert.ok(await senhas.validarPolitica('password1'));
  });

  test('reprova senha que contém o nome ou o e-mail da pessoa', async () => {
    const r = await senhas.validarPolitica('ricardomateus2026', ['Ricardo Mateus', 'ricardo']);
    assert.ok(r, 'termos do próprio contexto entram na blocklist');
  });

  test('aceita comprimento máximo alto (frases longas)', async () => {
    assert.equal(await senhas.validarPolitica('a'.repeat(200) + ' frase'), null);
  });
});

describe('código de verificação', () => {
  test('sempre seis dígitos', () => {
    for (let i = 0; i < 300; i++) {
      assert.match(otp.gerarCodigo(), /^\d{6}$/);
    }
  });

  test('o selo confere o código certo e recusa o errado', () => {
    const codigo = otp.gerarCodigo();
    const selo = otp.selar(codigo);
    assert.equal(otp.codigoConfere(codigo, selo), true);
    assert.equal(otp.codigoConfere('000000' === codigo ? '111111' : '000000', selo), false);
  });

  test('o selo não é o código em texto puro', () => {
    const codigo = '123456';
    assert.ok(!otp.selar(codigo).includes(codigo));
  });

  test('selo inválido não estoura', () => {
    assert.equal(otp.codigoConfere('123456', 'lixo'), false);
  });

  test('a validade fica no futuro', () => {
    assert.ok(otp.expiraEm().getTime() > Date.now());
  });
});

describe('sessão', () => {
  test('token opaco tem entropia alta e é único', () => {
    const conjunto = new Set(Array.from({ length: 500 }, () => sessao.gerarTokenOpaco()));
    assert.equal(conjunto.size, 500);
    assert.ok([...conjunto][0]!.length >= 40);
  });

  test('o digest não devolve o token', () => {
    const t = sessao.gerarTokenOpaco();
    assert.notEqual(sessao.digerir(t), t);
    assert.equal(sessao.digerir(t), sessao.digerir(t), 'digest precisa ser estável para indexar');
  });

  test('token de acesso ida e volta', async () => {
    const jwt = await sessao.assinarAcesso('usuario-1', 'sessao-1');
    const lido = await sessao.lerAcesso(jwt);
    assert.deepEqual(lido, { usuarioId: 'usuario-1', sessaoId: 'sessao-1' });
  });

  test('token adulterado é recusado', async () => {
    const jwt = await sessao.assinarAcesso('usuario-1', 'sessao-1');
    assert.equal(await sessao.lerAcesso(jwt.slice(0, -3) + 'aaa'), null);
  });

  test('"lembrar de mim" alonga a vida do refresh', () => {
    assert.ok(sessao.duracaoRefresh(true) > sessao.duracaoRefresh(false));
  });
});
