import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, QrCode } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayoutReal';

export default function LegacyEmployeeNotice() { const { siteId } = useParams(); const nav = useNavigate(); return <PublicLayout><div className="card p-7 text-center"><QrCode size={48} className="mx-auto text-teal-600"/><h1 className="font-display text-2xl font-bold text-[#102a56] mt-5">Use the designated attendance QR code</h1><p className="text-slate-500 mt-3">This older site link does not select entry or exit. Scan the permanent SITEPASS EMPLOYEE ENTRY or EMPLOYEE EXIT QR code.</p><button className="btn btn-soft mt-6" onClick={() => nav(`/verify/${siteId}`)}><ArrowLeft size={16}/>Back to site information</button></div></PublicLayout>; }
