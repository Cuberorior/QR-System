
import { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, Download, Printer } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { toast } from 'sonner';

export default function QRCodes() {
  const [site] = useState({
    id: 'SITE-CMB-01',
    name: 'Colombo Construction Site',
    location: 'Union Place, Colombo 02',
  });

  // Use the configured public URL for QR generation
  const baseUrl = (
    import.meta.env.VITE_PUBLIC_APP_URL ||
    window.location.origin
  ).replace(/\/$/, '');

  const url = `${baseUrl}/verify/${encodeURIComponent(site.id)}`;

  const download = () => {
    const canvas = document.querySelector('#site-qr canvas');

    if (!canvas) {
      toast.error('QR code not found.');
      return;
    }

    const link = document.createElement('a');
    link.download = `${site.id}-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    toast.success('QR code downloaded.');
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL copied.');
    } catch {
      toast.error('Unable to copy URL.');
    }
  };

  return (
    <main className="content">
      <PageHeader
        title="QR codes"
        description="Generate and distribute secure site verification QR codes."
      />

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5">
        <div className="card p-7 text-center">
          <p className="text-xs uppercase tracking-widest font-bold text-teal-600">
            Site verification QR
          </p>

          <h2 className="font-display text-2xl font-bold text-[#102a56] mt-2">
            {site.name}
          </h2>

          <p className="text-sm text-slate-500 mt-1">
            {site.location}
          </p>

          <div
            id="site-qr"
            className="inline-block p-5 bg-white border border-slate-100 rounded-2xl my-7"
          >
            <QRCodeCanvas
              value={url}
              size={220}
              includeMargin
            />
          </div>

          <div className="flex gap-2 justify-center">
            <button
              className="btn btn-primary"
              onClick={download}
            >
              <Download size={16} />
              Download
            </button>

            <button
              className="btn btn-soft"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Print
            </button>
          </div>
        </div>

        <div className="card p-7">
          <h2 className="font-bold text-[#102a56]">
            Verification URL
          </h2>

          <p className="text-sm text-slate-500 mt-1">
            This QR identifies the construction site only.
            It is not proof of identity or physical presence.
          </p>

          <div className="flex gap-2 mt-6">
            <input
              className="field bg-slate-50"
              readOnly
              value={url}
            />

            <button
              className="btn btn-soft"
              onClick={copyUrl}
            >
              <Copy size={16} />
            </button>
          </div>

          <div className="mt-8 p-6 rounded-2xl bg-[#102a56] text-white text-center">
            <p className="text-amber-400 text-xs font-bold tracking-[.2em]">
              CONSTRUCTION SITE ENTRY & EXIT
            </p>

            <p className="font-display text-2xl font-bold mt-3">
              SCAN HERE TO VERIFY
            </p>

            <p className="text-blue-200 text-sm mt-2">
              Employees: Verify your ID
              <br />
              Visitors: Register your details
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
