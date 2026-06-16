import React from 'react';
import { useStore } from '../store';
import { Printer, FileDown, Trash2, ArrowLeft, LayoutGrid } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

const PrintQueue = () => {
  const { printQueue, removeFromQueue, clearQueue, setView, setPrinting, isPrinting } = useStore();

  const handlePrintAll = () => {
    if (printQueue.length === 0) return;
    setPrinting(true);
    // Give time for the print preview to render before opening the dialog
    setTimeout(() => {
      window.print();
      // We don't immediately setPrinting(false) to allow the user to see the preview
      // if they cancel the print dialog. They can close it manually.
    }, 500);
  };

  const handleExportPDFAll = async () => {
    if (printQueue.length === 0) return;

    const toastId = toast.loading('Gerando PDF da fila...');

    try {
      // Create a temporary instance to check the first image's dimensions
      const tempPdf = new jsPDF();
      const firstItem = printQueue[0];
      const firstImgData = firstItem.imageData;
      const firstIsLandscape = firstItem.isLandscape;

      const pdf = new jsPDF({
        orientation: firstIsLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      for (let i = 0; i < printQueue.length; i++) {
        const item = printQueue[i];
        const imgData = item.imageData;
        const isLandscape = item.isLandscape;

        if (i > 0) {
          pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
        }
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        // Using JPEG for better performance and smaller file size
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }

      pdf.save(`smartprice_fila_${new Date().getTime()}.pdf`);
      toast.success('PDF da fila baixado com sucesso!', { id: toastId });
    } catch (error) {
      console.error('Erro ao gerar PDF da fila:', error);
      toast.error('Erro ao gerar PDF da fila.', { id: toastId });
    }
  };

  const confirmPrint = () => {
    window.print();
    // Keep the preview visible for a moment after print dialog closes
    setTimeout(() => setPrinting(false), 500);
  };

  const handleExportSinglePDF = (item: { imageData: string; isLandscape: boolean }, index: number) => {
    const toastId = toast.loading(`Gerando PDF da plaquinha #${index + 1}...`);
    
    try {
      const pdf = new jsPDF({
        orientation: item.isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Using JPEG for better performance and smaller file size
      pdf.addImage(item.imageData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      pdf.save(`smartprice_tag_${index + 1}_${new Date().getTime()}.pdf`);
      toast.success('PDF baixado com sucesso!', { id: toastId });
    } catch (error) {
      console.error('Erro ao gerar PDF individual:', error);
      toast.error('Erro ao gerar PDF.', { id: toastId });
    }
  };

  if (isPrinting) {
    return (
      <div className="fixed inset-0 z-[9999] bg-zinc-100 dark:bg-zinc-950 overflow-y-auto no-scrollbar">
        {/* UI Header - Hidden during print */}
        <div className="sticky top-0 z-[10000] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between no-print">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setPrinting(false)}
              className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-black dark:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black tracking-tighter uppercase text-black dark:text-white">Pré-visualização de Impressão</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-black dark:text-white opacity-60 uppercase tracking-widest">
              {printQueue.length} {printQueue.length === 1 ? 'Página' : 'Páginas'} A4
            </span>
            <button 
              onClick={confirmPrint}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-black uppercase tracking-tighter shadow-lg hover:bg-blue-700 transition-all"
            >
              <Printer className="w-4 h-4" />
              Confirmar Impressão
            </button>
          </div>
        </div>

        {/* Preview Area - Hidden during print */}
        <div className="flex flex-col items-center gap-8 py-12 px-4 no-print">
          {printQueue.map((item, index) => (
            <div key={index} className="relative group">
              <div className="absolute -left-12 top-0 text-black dark:text-white opacity-40 font-black text-2xl">
                {index + 1}
              </div>
              <div className={`bg-white shadow-[0_0_50px_rgba(0,0,0,0.1)] ${item.isLandscape ? 'w-[297mm] h-[210mm]' : 'w-[210mm] h-[297mm]'} flex items-center justify-center overflow-hidden border border-zinc-200`}>
                <img src={item.imageData} className="w-full h-full object-contain" alt={`Plaquinha ${index + 1}`} crossOrigin="anonymous" />
              </div>
            </div>
          ))}
        </div>

        {/* Actual Print Area - Optimized for Browser Print */}
        <div id="print-queue-area" className="hidden print:block">
          {printQueue.map((item, index) => (
            <div key={index} className={`print-page ${item.isLandscape ? 'landscape' : ''}`}>
              <img src={item.imageData} alt={`Print Tag ${index + 1}`} crossOrigin="anonymous" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setView('editor')}
              className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-black dark:text-white"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white">FILA DE <span className="text-blue-600">IMPRESSÃO</span></h1>
              <p className="text-black dark:text-white opacity-60 text-sm font-medium uppercase tracking-widest">{printQueue.length} plaquinhas na fila</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={clearQueue}
              className="px-4 py-2 text-black dark:text-white opacity-60 hover:text-red-500 font-bold text-sm uppercase tracking-tighter flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Limpar Fila
            </button>
            <button 
              type="button"
              onClick={handlePrintAll}
              disabled={printQueue.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-black uppercase tracking-tighter shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all"
            >
              <Printer className="w-5 h-5" />
              Imprimir Tudo
            </button>
            <button 
              onClick={handleExportPDFAll}
              disabled={printQueue.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase tracking-tighter shadow-lg shadow-blue-500/20 hover:bg-blue-700 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all"
            >
              <FileDown className="w-5 h-5" />
              Exportar PDF Único
            </button>
          </div>
        </div>

        {/* Queue Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 no-print">
          {printQueue.map((item, index) => (
            <div key={index} className="group relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 transition-all hover:shadow-2xl hover:-translate-y-1">
              <img src={item.imageData} alt={`Tag ${index + 1}`} className="w-full h-auto" crossOrigin="anonymous" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                <button 
                  onClick={() => handleExportSinglePDF(item, index)}
                  className="p-3 bg-blue-600 text-white rounded-full hover:scale-110 active:scale-90 transition-all shadow-lg"
                  title="Exportar PDF desta plaquinha"
                >
                  <FileDown className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => removeFromQueue(index)}
                  className="p-3 bg-red-600 text-white rounded-full hover:scale-110 active:scale-90 transition-all shadow-lg"
                  title="Remover da fila"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="absolute top-3 left-3 bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-lg uppercase tracking-tighter">
                #{index + 1}
              </div>
            </div>
          ))}

          {printQueue.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-black dark:text-white opacity-40 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
              <LayoutGrid className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-bold uppercase tracking-widest text-sm text-black dark:text-white opacity-60">Sua fila está vazia</p>
              <button 
                onClick={() => setView('editor')}
                className="mt-4 text-blue-600 font-bold hover:underline opacity-100"
              >
                Voltar ao editor para adicionar plaquinhas
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrintQueue;
