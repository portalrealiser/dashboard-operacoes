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

  // Mostrar progresso
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

    const response = await fetch('/modulo/rastreios/processar', {
      method: 'POST',
      body: formData
    });

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
      `}).join('');

      document.getElementById('resultList').innerHTML = listHtml;

      // Reload após 3 seg para atualizar métricas
      setTimeout(() => location.reload(), 3000);
    }, 500);

  } catch (err) {
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'block';
    document.getElementById('resultStats').innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px 0"><i class="ti ti-alert-circle"></i> Erro de conexão: ${err.message}</div>`;
  }
}
