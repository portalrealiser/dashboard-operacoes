let selectedFile = null;

function handleFileSelect(input) {
  if (input.files && input.files[0]) {
    selectedFile = input.files[0];
    document.getElementById('fileSelected').style.display = 'flex';
    document.getElementById('fileName').textContent = selectedFile.name;
    document.getElementById('dropzone').style.display = 'none';
    checkReady();
  }
}

function clearFile() {
  selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('fileSelected').style.display = 'none';
  document.getElementById('dropzone').style.display = 'block';
  checkReady();
}

function checkReady() {
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  const btn = document.getElementById('btnProcessar');
  btn.disabled = !(selectedFile && dateFrom && dateTo);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dateFrom').addEventListener('change', checkReady);
  document.getElementById('dateTo').addEventListener('change', checkReady);

  const dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      selectedFile = file;
      document.getElementById('fileSelected').style.display = 'flex';
      document.getElementById('fileName').textContent = file.name;
      document.getElementById('dropzone').style.display = 'none';
      checkReady();
    }
  });
});

async function processar() {
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;

  if (!selectedFile || !dateFrom || !dateTo) return;

  document.getElementById('uploadForm').style.display = 'none';
  document.getElementById('progressSection').style.display = 'block';
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('progressBar').style.width = '30%';
  document.getElementById('progressSub').textContent = 'Lendo planilha e buscando pedidos na Shopify...';

  const formData = new FormData();
  formData.append('planilha', selectedFile);
  formData.append('date_from', dateFrom);
  formData.append('date_to', dateTo);

  try {
    document.getElementById('progressBar').style.width = '60%';
    const response = await fetch('/modulo/rastreios/processar', { method: 'POST', body: formData });
    document.getElementById('progressBar').style.width = '90%';
    const data = await response.json();
    document.getElementById('progressBar').style.width = '100%';

    setTimeout(() => {
      document.getElementById('progressSection').style.display = 'none';
      document.getElementById('resultSection').style.display = 'block';

      if (!data.ok) {
        document.getElementById('resultStats').innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px 0"><i class="ti ti-alert-circle"></i> ${data.error}</div>`;
        document.getElementById('resultList').innerHTML = '';
        return;
      }

      const r = data.results;

      document.getElementById('resultStats').innerHTML = `
        <div class="rstat rstat-green">
          <div class="rstat-icon"><i class="ti ti-circle-check"></i></div>
          <div class="rstat-value">${r.success}</div>
          <div class="rstat-label">Vinculados agora</div>
        </div>
        <div class="rstat rstat-blue">
          <div class="rstat-icon"><i class="ti ti-refresh"></i></div>
          <div class="rstat-value">${r.already_fulfilled || 0}</div>
          <div class="rstat-label">Já possuíam rastreio</div>
        </div>
        <div class="rstat rstat-amber">
          <div class="rstat-icon"><i class="ti ti-search-off"></i></div>
          <div class="rstat-value">${r.not_found}</div>
          <div class="rstat-label">Não encontrados</div>
        </div>
        <div class="rstat rstat-red">
          <div class="rstat-icon"><i class="ti ti-alert-circle"></i></div>
          <div class="rstat-value">${r.error}</div>
          <div class="rstat-label">Erros</div>
        </div>
      `;

      const statusConfig = {
        success: { dot: 'rdot-green', label: 'Vinculado' },
        already_fulfilled: { dot: 'rdot-blue', label: 'Já possuía rastreio' },
        not_found: { dot: 'rdot-amber', label: 'Não encontrado' },
        error: { dot: 'rdot-red', label: 'Erro' }
      };

      const listHtml = r.items.map(item => {
        const cfg = statusConfig[item.status] || statusConfig.error;
        return `
          <div class="result-item ${item.status}">
            <div class="result-dot ${cfg.dot}"></div>
            <div class="result-rastreio">${item.rastreio}</div>
            <div class="result-status-label">${cfg.label}</div>
            <div class="result-msg">${item.message}</div>
            ${item.pedido ? `<div class="result-pedido">${item.pedido}</div>` : ''}
          </div>
        `;
      }).join('');

      document.getElementById('resultList').innerHTML = listHtml;

      // Atualizar métricas no topo sem recarregar a página
      atualizarMetricas(r);

    }, 500);

  } catch (err) {
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'block';
    document.getElementById('resultStats').innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px 0"><i class="ti ti-alert-circle"></i> Erro de conexão: ${err.message}</div>`;
  }
}

function atualizarMetricas(r) {
  // Atualiza os cards de métricas no topo sem reload
  const cards = document.querySelectorAll('.metric-value');
  if (cards.length >= 1) cards[0].textContent = parseInt(cards[0].textContent || 0) + r.success;
  if (cards.length >= 2) cards[1].textContent = parseInt(cards[1].textContent || 0) + r.not_found;
  if (cards.length >= 3) cards[2].textContent = parseInt(cards[2].textContent || 0) + r.error;
}

function abrirLote(batchId) {
  fetch('/modulo/rastreios/lote/' + batchId)
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      mostrarModalLote(data.batch, data.items);
    });
}

function mostrarModalLote(batch, items) {
  const statusConfig = {
    success: { dot: 'rdot-green', label: 'Vinculado' },
    already_fulfilled: { dot: 'rdot-blue', label: 'Já possuía rastreio' },
    not_found: { dot: 'rdot-amber', label: 'Não encontrado' },
    error: { dot: 'rdot-red', label: 'Erro' }
  };

  const success = items.filter(i => i.status === 'success').length;
  const already = items.filter(i => i.status === 'already_fulfilled').length;
  const not_found = items.filter(i => i.status === 'not_found').length;
  const error = items.filter(i => i.status === 'error').length;

  const listHtml = items.map(item => {
    const cfg = statusConfig[item.status] || statusConfig.error;
    return `
      <div class="result-item ${item.status}">
        <div class="result-dot ${cfg.dot}"></div>
        <div class="result-rastreio">${item.rastreio}</div>
        <div class="result-status-label">${cfg.label}</div>
        <div class="result-msg">${item.message}</div>
        ${item.order_name ? `<div class="result-pedido">${item.order_name}</div>` : ''}
      </div>
    `;
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <div>
          <div class="modal-title">Detalhes do Lote</div>
          <div class="modal-sub">Processado em ${new Date(batch.created_at).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})} · Período: ${batch.date_from ? new Date(batch.date_from+'T12:00:00').toLocaleDateString('pt-BR') : '-'} até ${batch.date_to ? new Date(batch.date_to+'T12:00:00').toLocaleDateString('pt-BR') : '-'}</div>
        </div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-stats">
        <div class="rstat rstat-green"><div class="rstat-icon"><i class="ti ti-circle-check"></i></div><div class="rstat-value">${success}</div><div class="rstat-label">Vinculados</div></div>
        <div class="rstat rstat-blue"><div class="rstat-icon"><i class="ti ti-refresh"></i></div><div class="rstat-value">${already}</div><div class="rstat-label">Já possuíam</div></div>
        <div class="rstat rstat-amber"><div class="rstat-icon"><i class="ti ti-search-off"></i></div><div class="rstat-value">${not_found}</div><div class="rstat-label">Não encontrados</div></div>
        <div class="rstat rstat-red"><div class="rstat-icon"><i class="ti ti-alert-circle"></i></div><div class="rstat-value">${error}</div><div class="rstat-label">Erros</div></div>
      </div>
      <div class="result-list modal-list">${listHtml}</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}
