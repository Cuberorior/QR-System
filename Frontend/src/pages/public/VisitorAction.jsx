import { useParams } from 'react-router-dom';
import VisitorExitAccess from './VisitorExitAccess';
import VisitorRegistrationSelfService from './VisitorRegistrationSelfService';

export default function VisitorAction() { const { action } = useParams(); return action === 'exit' ? <VisitorExitAccess /> : <VisitorRegistrationSelfService />; }
