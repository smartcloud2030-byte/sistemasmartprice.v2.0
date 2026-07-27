import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { useStore } from '../store';
import { Download, Upload, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { findImportConflicts, ReportRow, ReportConflict } from '../lib/productReportConflicts';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';

const COLUMNS = ['ID', 'Nome do Produto', 'Código de Barras 1', 'Código de Barras 2', 'Preço', 'Categoria', 'Descrição'];

function parseId(raw: unknown): string | number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const asNumber = Number(trimmed);
  return Number.isNaN(asNumber) ? trimmed : asNumber;
}

function cellToString(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
}

export default function ProductReport() {
  const { products, fetchProducts } = useStore();
  const [pendingRows, setPendingRows] = useState<ReportRow[] | null>(null);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [conflicts, setConflicts] = useState<ReportConflict[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // Não existe useStore().fetchProductCount — a contagem de produtos é
  // buscada localmente (mesmo padrão do ProductManager.tsx, que também
  // implementa isso por conta própria via GET /api/products/count).
  const fetchProductCount = async () => {
    try {
      await fetch('/api/products/count', { headers: { 'x-api-token': API_SECRET } });
    } catch {
      // silencioso — a contagem exibida em outro lugar da tela vai só
      // atualizar na próxima visita; não é crítico para o fluxo de importação
    }
  };

  const handleExport = () => {
    const rows = products.map(p => ({
      'ID': p.id,
      'Nome do Produto': p.name,
      'Código de Barras 1': p.barcode || '',
      'Código de Barras 2': p.barcode2 || '',
      'Preço': p.price,
      'Categoria': p.category,
      'Descrição': p.description,
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `produtos-smartprice-${today}.xlsx`);
  };

  const resetImportState = () => {
    setPendingRows(null);
    setIgnoredCount(0);
    setConflicts([]);
  };

  const handleFileSelected = async (file: File) => {
    resetImportState();
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const rows: ReportRow[] = [];
      let ignored = 0;
      for (const r of raw) {
        const id = parseId(r['ID']);
        if (id === null) { ignored++; continue; }
        rows.push({
          id,
          name: cellToString(r['Nome do Produto']),
          barcode: cellToString(r['Código de Barras 1']) || null,
          barcode2: cellToString(r['Código de Barras 2']) || null,
          price: cellToString(r['Preço']),
          category: cellToString(r['Categoria']),
          description: cellToString(r['Descrição']),
        });
      }

      setIgnoredCount(ignored);
      const foundConflicts = findImportConflicts(rows, products);
      if (foundConflicts.length > 0) {
        setConflicts(foundConflicts);
      } else {
        setPendingRows(rows);
      }
    } catch {
      toast.error('Não foi possível ler essa planilha. Confirme que é o arquivo .xlsx baixado por aqui.');
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingRows) return;
    setIsImporting(true);
    try {
      const res = await fetch('/api/products/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-token': API_SECRET },
        body: JSON.stringify(pendingRows),
      });
      if (!res.ok) throw new Error(`PUT /products/bulk falhou: ${res.status}`);
      const data = await res.json();
      toast.success(`${data.updatedCount} produto(s) atualizado(s)${data.skippedIds?.length ? `, ${data.skippedIds.length} ignorado(s) (não encontrado(s))` : ''}.`);
      resetImportState();
      await fetchProducts();
      await fetchProductCount();
    } catch (e: any) {
      toast.error('Erro ao atualizar produtos: ' + (e.message || 'tente novamente'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-black dark:text-white">1. Baixar planilha</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Baixe o catálogo atual em Excel, edite os campos que quiser (não mexa na coluna ID) e suba de volta.
        </p>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
          <Download className="w-4 h-4" /> Baixar planilha (Excel)
        </button>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-black dark:text-white">2. Subir planilha atualizada</p>
        <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg cursor-pointer text-sm font-medium text-blue-600 w-fit">
          <Upload className="w-4 h-4" /> Selecionar planilha (.xlsx)
          <input type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }} />
        </label>
      </div>

      {conflicts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-bold uppercase text-sm">Conflitos encontrados — nada foi atualizado</p>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {conflicts.map((c, i) => (
              <div key={i} className="text-xs bg-white dark:bg-zinc-900 rounded-lg p-2">
                <p className="font-semibold text-black dark:text-white">Linha do produto ID {c.row.id} ({c.row.name || 'sem nome'})</p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {c.reason === 'catalog'
                    ? `bate com o produto já cadastrado "${c.matchedProduct.name}" (ID ${c.matchedProduct.id})`
                    : `bate com outra linha da mesma planilha: ID ${c.matchedRow.id} (${c.matchedRow.name || 'sem nome'})`}
                </p>
              </div>
            ))}
          </div>
          <button onClick={resetImportState} className="text-xs font-bold uppercase text-amber-600 hover:text-amber-700">Fechar</button>
        </div>
      )}

      {pendingRows && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800 rounded-xl p-4 space-y-3">
          <p className="text-sm text-black dark:text-white">
            <strong>{pendingRows.length}</strong> produto(s) serão atualizados
            {ignoredCount > 0 ? `, ${ignoredCount} linha(s) sem ID foram ignoradas` : ''}.
          </p>
          <div className="flex gap-3">
            <button onClick={resetImportState} className="px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-black dark:text-white">Cancelar</button>
            <button onClick={handleConfirmImport} disabled={isImporting} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              {isImporting ? 'Atualizando...' : 'Atualizar produtos'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
