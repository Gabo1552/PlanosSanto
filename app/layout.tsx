import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Planos Santo · Guías de armado',description:'Planos claros, del taller al armado.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="es-AR"><body>{children}</body></html>;}
