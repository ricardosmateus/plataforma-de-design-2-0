// ============================================================
// INJETAR BARRA DE PROGRESSO NO BOARD
// ============================================================
// Cole este script no console do navegador (F12) enquanto estiver
// na página board.html para testar se a barra funciona

console.log('🔧 Iniciando injeção de barra de progresso...');

// 1. Verificar se elementos HTML existem
var container = document.getElementById('canvasProgress');
var bar = document.getElementById('canvasProgressBar');

if (!container || !bar) {
  console.error('❌ Elementos HTML não encontrados!');
  console.error('   canvasProgress:', container ? '✓' : '✗');
  console.error('   canvasProgressBar:', bar ? '✓' : '✗');
} else {
  console.log('✅ Elementos HTML encontrados');
}

// 2. Criar/sobrescrever objeto de controle
window.ProgressoBoard = {
  bar: bar,
  container: container,
  timer: null,

  mostrar: function() {
    console.log('► mostrar() chamado');
    if (!this.container || !this.bar) {
      console.error('❌ Elementos não disponíveis');
      return;
    }

    this.container.hidden = false;
    console.log('  → container.hidden = false');

    // Resetar animação
    this.bar.style.animation = 'none';
    console.log('  → animation = none (reset)');

    // Forçar reflow
    void this.bar.offsetWidth;
    console.log('  → reflow triggered');

    // Aplicar animação
    this.bar.style.animation = 'carregandoBarra 3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
    console.log('  → animation = carregandoBarra 3s');

    console.log('✅ mostrar() concluído');
  },

  esconder: function() {
    console.log('► esconder() chamado');

    if (this.timer) {
      clearTimeout(this.timer);
      console.log('  → timer anterior cancelado');
    }

    if (!this.container || !this.bar) {
      console.error('❌ Elementos não disponíveis');
      return;
    }

    // Completar barra visualmente
    this.bar.style.animation = 'none';
    this.bar.style.width = '100%';
    console.log('  → bar completou 100%');

    // Aguardar antes de esconder
    this.timer = setTimeout(function() {
      if (container) {
        container.hidden = true;
        console.log('  → container.hidden = true');
      }
      if (bar) {
        bar.style.width = '0%';
        console.log('  → bar resetada para 0%');
      }
      console.log('✅ esconder() concluído');
    }.bind(this), 300);

    console.log('  → aguardando 300ms antes de esconder...');
  }
};

console.log('✅ window.ProgressoBoard criado/atualizado');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TESTE RÁPIDO:');
console.log('');
console.log('1. Para MOSTRAR a barra:');
console.log('   window.ProgressoBoard.mostrar()');
console.log('');
console.log('2. Para ESCONDER a barra:');
console.log('   window.ProgressoBoard.esconder()');
console.log('');
console.log('3. Teste automático (5 segundos):');
console.log('   window.ProgressoBoard.mostrar(); setTimeout(() => window.ProgressoBoard.esconder(), 5000);');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
